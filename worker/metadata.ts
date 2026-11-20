import { decodeHTML } from "entities";
function validUrl(raw: string) {
  const u = new URL(raw);
  const h = u.hostname.toLowerCase();
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443" && u.port !== "80") ||
    !h.includes(".") ||
    h.includes(":") ||
    /^\d+[.\d]*$/.test(h) ||
    /\.(local|internal|localhost|test|invalid)$/.test(h)
  )
    throw new Error("请填写公开网页的 http 或 https 链接");
  return u;
}
async function publicHost(host: string) {
  const queries = await Promise.all(
    ["A", "AAAA"].map(async (type) => {
      const response = await fetch(
        "https://cloudflare-dns.com/dns-query?" +
          new URLSearchParams({ name: host, type }),
        {
          headers: { Accept: "application/dns-json" },
          signal: AbortSignal.timeout(4000),
        },
      );
      return (await response.json()) as {
        Answer?: { type: number; data: string }[];
      };
    }),
  );
  const ipv6 = queries
    .flatMap((q) => q.Answer || [])
    .filter((a) => a.type === 28)
    .map((a) => a.data);
  if (ipv6.some((ip) => !/^2[0-9a-f]{3}:/i.test(ip)))
    throw new Error("网页地址无法读取");
  const addresses = queries
    .flatMap((q) => q.Answer || [])
    .filter((a) => a.type === 1)
    .map((a) => a.data);
  if (
    !addresses.length ||
    addresses.some((ip) =>
      /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|192\.0\.|198\.(1[89])\.|22[4-9]\.|2[3-5]\d\.)/.test(
        ip,
      ),
    )
  )
    throw new Error("网页地址无法读取");
}
export async function readTitle(raw: string) {
  let url = validUrl(raw);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    for (let i = 0; i < 4; i++) {
      await publicHost(url.hostname);
      const r = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "text/html,application/xhtml+xml" },
      });
      if (r.status >= 300 && r.status < 400) {
        const location = r.headers.get("location");
        await r.body?.cancel();
        if (!location) break;
        url = validUrl(new URL(location, url).href);
        continue;
      }
      if (!r.ok || !r.headers.get("content-type")?.includes("html")) {
        await r.body?.cancel();
        return "";
      }
      const reader = r.body?.getReader();
      if (!reader) return "";
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (size < 262144) {
          const { value, done } = await reader.read();
          if (done) break;
          const part = value.slice(0, 262144 - size);
          chunks.push(part);
          size += part.length;
        }
      } finally {
        await reader.cancel();
      }
      let title = "",
        og = "";
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.length;
      }
      await new HTMLRewriter()
        .on("title", {
          text(t) {
            title += t.text;
          },
        })
        .on("meta", {
          element(e) {
            if (
              ["og:title", "twitter:title"].includes(
                e.getAttribute("property") || e.getAttribute("name") || "",
              )
            )
              og ||= e.getAttribute("content") || "";
          },
        })
        .transform(
          new Response(bytes, {
            headers: { "Content-Type": "text/html;charset=utf-8" },
          }),
        )
        .text();
      const result = decodeHTML(og || title)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
      return /just a moment|access denied|security verification|验证码|安全验证|登录|登录后|login|sign in/i.test(
        result,
      )
        ? ""
        : result;
    }
    return "";
  } finally {
    clearTimeout(timer);
  }
}
