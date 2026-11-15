import { SignJWT, jwtVerify } from "jose";
interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  ASSETS: Fetcher;
  ARCHIVE_PASSWORD: string;
  SESSION_SECRET: string;
  DEV_MODE?: string;
}
const LIMIT = 8_000_000_000,
  MAX_IMAGE = 15 * 1024 * 1024;
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
async function authorize(req: Request, env: Env) {
  const u = new URL(req.url);
  if (
    env.DEV_MODE === "true" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
  )
    return;
  if (!env.ARCHIVE_PASSWORD || !env.SESSION_SECRET)
    fail(503, "网站正在准备中，请稍后再来。");
  const token = req.headers
    .get("Cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("archive_session="))
    ?.slice(16);
  if (!token) fail(401, "请输入密码打开收藏。");
  try {
    await jwtVerify(token!, new TextEncoder().encode(env.SESSION_SECRET), {
      issuer: "my-archive",
      audience: "archive",
      algorithms: ["HS256"],
    });
  } catch {
    fail(401, "请输入密码打开收藏。");
  }
}
function clean(value: unknown, max: number, required = false) {
  if (typeof value !== "string")
    return required ? fail(400, "缺少必填文字") : "";
  const v = value.trim();
  if (v.length > max) fail(400, "文字超出长度限制");
  if (required && !v) fail(400, "请输入标题");
  return v;
}
async function body(req: Request) {
  const text = await req.text();
  if (text.length > 2_000_000) fail(413, "正文过长，最多约 100 万字。");
  try {
    return JSON.parse(text);
  } catch {
    fail(400, "无效的 JSON 数据");
  }
}
function normalize(b: Record<string, unknown>) {
  if (!["material", "fiction", "art"].includes(String(b.type)))
    fail(400, "请选择收藏类型");
  const url = clean(b.url, 3000);
  if (url) {
    try {
      if (!["https:", "http:"].includes(new URL(url).protocol))
        fail(400, "仅支持 http 或 https 原帖链接");
    } catch {
      fail(400, "原帖链接无效");
    }
  }
  const tags = Array.isArray(b.tags)
    ? [...new Set(b.tags.map((t) => clean(t, 40)).filter(Boolean))]
    : [];
  if (tags.length > 30) fail(400, "最多添加 30 个标签");
  return {
    type: String(b.type),
    title: clean(b.title, 200, true),
    author: clean(b.author, 200),
    url,
    notes: clean(b.notes, 10000),
    content: clean(b.content, 1_000_000),
    tags: JSON.stringify(tags),
    starred: b.starred ? 1 : 0,
  };
}
async function entry(env: Env, id: string) {
  const r = await env.DB.prepare("SELECT * FROM entries WHERE id=?")
    .bind(id)
    .first();
  if (!r) fail(404, "收藏不存在或已被删除");
  return r!;
}
async function inflate(env: Env, rows: Record<string, unknown>[]) {
  if (!rows.length) return [];
  const { results } = await env.DB.prepare(
    `SELECT * FROM images WHERE entry_id IN (${rows.map(() => "?").join(",")}) ORDER BY created_at,id`,
  )
    .bind(...rows.map((r) => r.id))
    .all();
  return rows.map((r) => ({
    ...r,
    tags: JSON.parse(String(r.tags)),
    starred: !!r.starred,
    images: results.filter((i) => i.entry_id === r.id),
  }));
}
function imageMime(b: Uint8Array) {
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v))
    return "image/png";
  const s = new TextDecoder().decode(b.slice(0, 12));
  if (s.startsWith("GIF87a") || s.startsWith("GIF89a")) return "image/gif";
  if (s.startsWith("RIFF") && s.slice(8) === "WEBP") return "image/webp";
  return null;
}
async function api(req: Request, env: Env) {
  const u = new URL(req.url),
    p = u.pathname,
    method = req.method;
  if (method !== "GET" && method !== "HEAD") {
    if (req.headers.get("Origin") !== u.origin)
      fail(403, "请求来源无效，请从本站操作。");
    if (req.headers.get("Sec-Fetch-Site") === "cross-site")
      fail(403, "不允许跨站操作。");
  }
  if (p === "/api/stats" && method === "GET") {
    const counts = await env.DB.prepare(
      "SELECT type,COUNT(*) AS count FROM entries GROUP BY type",
    ).all();
    const tags = await env.DB.prepare(
      "SELECT j.value AS name, COUNT(*) AS count FROM entries e, json_each(e.tags) j GROUP BY j.value ORDER BY count DESC,name LIMIT 100",
    ).all();
    const usage = await env.DB.prepare(
      "SELECT bytes FROM storage_usage WHERE id=1",
    ).first();
    const total = await env.DB.prepare(
      "SELECT COUNT(*) AS total,SUM(starred) AS starred FROM entries",
    ).first();
    return json({
      counts: counts.results,
      tags: tags.results,
      bytes: usage?.bytes || 0,
      limit: LIMIT,
      ...total,
    });
  }
  if (p === "/api/entries" && method === "GET") {
    const clauses: string[] = [],
      args: (string | number)[] = [];
    for (const field of ["type", "starred"]) {
      const val = u.searchParams.get(field);
      if (val) {
        clauses.push(`${field}=?`);
        args.push(val);
      }
    }
    const tag = u.searchParams.get("tag");
    if (tag) {
      clauses.push(
        "EXISTS(SELECT 1 FROM json_each(entries.tags) WHERE value=?)",
      );
      args.push(tag);
    }
    const q = u.searchParams.get("q")?.slice(0, 200);
    if (q) {
      clauses.push(
        "(title LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')",
      );
      const pattern = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
      args.push(...Array(5).fill(pattern));
    }
    const from = u.searchParams.get("from"),
      to = u.searchParams.get("to");
    if (from && /^\d{4}-\d\d-\d\d$/.test(from)) {
      clauses.push("created_at>=?");
      args.push(from);
    }
    if (to && /^\d{4}-\d\d-\d\d$/.test(to)) {
      clauses.push("created_at<?");
      args.push(to + "T23:59:59.999Z");
    }
    const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
    const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0),
      limit = 30;
    const order = u.searchParams.get("order") === "oldest" ? "ASC" : "DESC";
    const rows = await env.DB.prepare(
      `SELECT * FROM entries${where} ORDER BY created_at ${order},id ${order} LIMIT ? OFFSET ?`,
    )
      .bind(...args, limit + 1, offset)
      .all();
    return json({
      items: await inflate(env, rows.results.slice(0, limit)),
      more: rows.results.length > limit,
    });
  }
  if (p === "/api/export" && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT * FROM entries ORDER BY created_at DESC",
    ).all();
    // Batched hydration avoids SQLite's bound-variable limit on large libraries.
    const entries = [];
    for (let i = 0; i < rows.results.length; i += 80)
      entries.push(...(await inflate(env, rows.results.slice(i, i + 80))));
    return json({ version: 1, exported_at: new Date().toISOString(), entries });
  }
  if (p === "/api/entries" && method === "POST") {
    const b = normalize(await body(req)),
      id = crypto.randomUUID(),
      now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO entries(id,type,title,author,url,notes,content,tags,starred,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        b.type,
        b.title,
        b.author,
        b.url,
        b.notes,
        b.content,
        b.tags,
        b.starred,
        now,
        now,
      )
      .run();
    return json({ id }, 201);
  }
  const match = p.match(/^\/api\/entries\/([a-f0-9-]+)$/);
  if (match) {
    const id = match[1];
    await entry(env, id);
    if (method === "PUT") {
      const b = normalize(await body(req));
      await env.DB.prepare(
        "UPDATE entries SET type=?,title=?,author=?,url=?,notes=?,content=?,tags=?,starred=?,updated_at=? WHERE id=?",
      )
        .bind(
          b.type,
          b.title,
          b.author,
          b.url,
          b.notes,
          b.content,
          b.tags,
          b.starred,
          new Date().toISOString(),
          id,
        )
        .run();
      return json({ ok: true });
    }
    if (method === "DELETE") {
      const images = await env.DB.prepare(
        "SELECT id FROM images WHERE entry_id=?",
      )
        .bind(id)
        .all<{ id: string }>();
      // Remove objects first; a retry can safely finish interrupted deletes.
      for (const image of images.results) await env.IMAGES.delete(image.id);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM images WHERE entry_id=?").bind(id),
        env.DB.prepare("DELETE FROM entries WHERE id=?").bind(id),
      ]);
      return json({ ok: true });
    }
  }
  const upload = p.match(/^\/api\/entries\/([a-f0-9-]+)\/images$/);
  if (upload && method === "POST") {
    await entry(env, upload[1]);
    if (Number(req.headers.get("Content-Length")) > MAX_IMAGE + 65536)
      fail(413, "每张图片最多 15 MB");
    const data = await req.formData(),
      file = data.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_IMAGE)
      fail(413, "请选择 15 MB 以内的图片");
    const bytes = new Uint8Array(await file.arrayBuffer()),
      mime = imageMime(bytes);
    if (!mime) fail(400, "支持 JPG、PNG、GIF 和 WebP 图片，请先转换其他格式");
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    try {
      await env.DB.prepare(
        "INSERT INTO images(id,entry_id,name,mime,size,created_at) VALUES(?,?,?,?,?,?)",
      )
        .bind(id, upload[1], file.name.slice(0, 200), mime, file.size, now)
        .run();
    } catch (e) {
      if (String(e).includes("CHECK constraint"))
        fail(413, "图片空间已达到 8 GB 上限");
      throw e;
    }
    try {
      await env.IMAGES.put(id, bytes, { httpMetadata: { contentType: mime } });
    } catch (e) {
      await env.DB.prepare("DELETE FROM images WHERE id=?").bind(id).run();
      throw e;
    }
    return json({ id, name: file.name, mime, size: file.size }, 201);
  }
  const image = p.match(/^\/api\/images\/([a-f0-9-]+)$/);
  if (image) {
    const row = await env.DB.prepare("SELECT * FROM images WHERE id=?")
      .bind(image[1])
      .first();
    if (!row) fail(404, "图片不存在");
    if (method === "GET") {
      const object = await env.IMAGES.get(image[1]);
      if (!object) fail(404, "图片文件未找到");
      return new Response(object.body, {
        headers: {
          "Content-Type": String(row!.mime),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (method === "DELETE") {
      await env.IMAGES.delete(image[1]);
      await env.DB.prepare("DELETE FROM images WHERE id=?")
        .bind(image[1])
        .run();
      return json({ ok: true });
    }
  }
  return json({ error: "接口不存在" }, 404);
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(req.url);
      if (url.pathname === "/api/login" && req.method === "POST") {
        if (req.headers.get("Origin") !== url.origin) fail(403, "请从本站登录");
        if (!env.ARCHIVE_PASSWORD || !env.SESSION_SECRET)
          fail(503, "网站正在准备中，请稍后再来。");
        const data = await body(req);
        const digest = async (s: string) =>
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
          );
        const [a, b] = await Promise.all([
          digest(String(data.password)),
          digest(env.ARCHIVE_PASSWORD),
        ]);
        let diff = 0;
        for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
        if (diff) fail(401, "密码不对，再试一下吧。");
        const token = await new SignJWT({})
          .setProtectedHeader({ alg: "HS256" })
          .setIssuer("my-archive")
          .setAudience("archive")
          .setIssuedAt()
          .setExpirationTime("180d")
          .sign(new TextEncoder().encode(env.SESSION_SECRET));
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Set-Cookie": `archive_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=15552000`,
          },
        });
      }
      if (url.pathname === "/api/logout" && req.method === "POST") {
        if (req.headers.get("Origin") !== url.origin) fail(403, "请从本站操作");
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie":
              "archive_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
          },
        });
      }
      if (url.pathname.startsWith("/api/")) await authorize(req, env);
      const result = url.pathname.startsWith("/api/")
        ? await api(req, env)
        : await env.ASSETS.fetch(req);
      const response = new Response(result.body, result);
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("Referrer-Policy", "no-referrer");
      response.headers.set("X-Frame-Options", "DENY");
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
      );
      return response;
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error("Archive request failed", e);
      return json(
        {
          error:
            "操作未完成，请稍后重试。若是首次部署，请检查 D1、R2 绑定和数据库迁移。",
        },
        500,
      );
    }
  },
};
