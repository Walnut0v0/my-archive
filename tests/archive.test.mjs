import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";

test("password sessions, CRUD, search, private image storage and export", async () => {
  const bundle = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2026-08-01",
      d1Databases: ["DB"],
      r2Buckets: ["IMAGES"],
      bindings: {
        ARCHIVE_PASSWORD: "test-only-password",
        SESSION_SECRET: "test-only-session-secret-32-characters",
      },
      serviceBindings: { ASSETS: () => new Response("static shell") },
    }),
  );
  try {
    const db = await mf.getD1Database("DB");
    await db.exec(
      (await readFile("migrations/0001_archive.sql", "utf8")).replace(
        /\n/g,
        " ",
      ),
    );
    const request = async (path, opts = {}) => {
      if (opts.body instanceof FormData) {
        const serialized = new Request("https://archive.test", {
          method: "POST",
          body: opts.body,
        });
        opts = {
          ...opts,
          body: new Uint8Array(await serialized.arrayBuffer()),
          headers: {
            ...opts.headers,
            "Content-Type": serialized.headers.get("content-type"),
          },
        };
      }
      return mf.dispatchFetch("https://archive.test" + path, opts);
    };
    assert.equal((await request("/api/stats")).status, 401);
    assert.equal((await request("/")).status, 200);
    assert.equal(
      (
        await request("/api/login", {
          method: "POST",
          headers: { Origin: "https://evil.test" },
          body: JSON.stringify({ password: "test-only-password" }),
        })
      ).status,
      403,
    );
    const login = async (password) =>
      request("/api/login", {
        method: "POST",
        headers: { Origin: "https://archive.test" },
        body: JSON.stringify({ password }),
      });
    assert.equal((await login("wrong")).status, 401);
    const logged = await login("test-only-password");
    assert.equal(logged.status, 200);
    const setCookie = logged.headers.get("set-cookie");
    assert.match(setCookie, /HttpOnly; Secure; SameSite=Strict/);
    const cookie = setCookie.split(";")[0];
    const api = async (path, opts = {}) => {
      const res = await request("/api" + path, {
        ...opts,
        headers: {
          Cookie: cookie,
          Origin: "https://archive.test",
          ...opts.headers,
        },
      });
      return { status: res.status, data: await res.json() };
    };
    const record = {
      type: "fiction",
      title: "测试文稿",
      author: "作者",
      url: "https://example.com/story",
      notes: "私人笔记",
      content: "一段完整的正文。\n第二段正文。",
      tags: ["角色A", "测试"],
      starred: true,
    };
    const created = await api("/entries", {
      method: "POST",
      body: JSON.stringify(record),
    });
    assert.equal(created.status, 201);
    const id = created.data.id;
    assert.equal((await api("/entries?q=第二段")).data.items[0].id, id);
    assert.equal(
      (await api("/entries?tag=角色A&type=fiction&starred=1")).data.items
        .length,
      1,
    );
    assert.equal((await api("/entries?q=%")).data.items.length, 0);
    assert.equal(
      (
        await api("/entries", {
          method: "POST",
          body: JSON.stringify({ ...record, url: "javascript:alert(1)" }),
        })
      ).status,
      400,
    );
    await api("/entries/" + id, {
      method: "PUT",
      body: JSON.stringify({ ...record, title: "已修改标题" }),
    });
    assert.equal((await api("/entries")).data.items[0].title, "已修改标题");
    const form = new FormData();
    form.set(
      "file",
      new Blob(
        [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])],
        { type: "image/png" },
      ),
      "测试.png",
    );
    const uploaded = await api("/entries/" + id + "/images", {
      method: "POST",
      body: form,
    });
    assert.equal(uploaded.status, 201);
    const imageId = uploaded.data.id;
    assert.equal((await request("/api/images/" + imageId)).status, 401);
    const image = await request("/api/images/" + imageId, {
      headers: { Cookie: cookie },
    });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.equal((await image.arrayBuffer()).byteLength, 12);
    assert.equal((await api("/stats")).data.bytes, 12);
    const invalid = new FormData();
    invalid.set(
      "file",
      new Blob(['<svg onload="alert(1)"></svg>'], { type: "image/png" }),
      "fake.png",
    );
    assert.equal(
      (
        await api("/entries/" + id + "/images", {
          method: "POST",
          body: invalid,
        })
      ).status,
      400,
    );
    const backup = (await api("/export")).data;
    assert.equal(backup.entries[0].content, record.content);
    assert.equal(backup.entries[0].images[0].id, imageId);
    assert.equal(
      (await api("/entries/" + id, { method: "DELETE" })).status,
      200,
    );
    assert.equal((await api("/stats")).data.total, 0);
    assert.equal((await api("/stats")).data.bytes, 0);
    assert.equal(
      (await request("/api/images/" + imageId, { headers: { Cookie: cookie } }))
        .status,
      404,
    );
  } finally {
    await mf.dispose();
  }
});
