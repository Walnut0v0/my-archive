import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { xhsText, xhsUrl, douyinText, douyinUrl } from "./share-fixtures.mjs";
test("shared text extracts URLs, titles and authors without changing signed query parameters", async () => {
  const { outputFiles } = await build({
    entryPoints: ["src/share.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
  });
  const { extractSharedUrl, parseSharedText } = await import(
    "data:text/javascript;base64," +
      Buffer.from(outputFiles[0].text).toString("base64")
  );
  assert.deepEqual(parseSharedText(xhsText), {
    url: xhsUrl,
    platform: "小红书",
    title: "生日快乐🎂",
    author: "ottel9ka",
  });
  assert.deepEqual(parseSharedText(douyinText), {
    url: douyinUrl,
    platform: "抖音",
    title: "第 39 届中国电影金鸡奖提名者表彰仪式，唱的太好...",
    author: "苏苿兮🌸",
  });
  assert.equal(
    extractSharedUrl(
      xhsText.replace(
        "https://www.xiaohongshu.com",
        String.raw`https\://www\.xiaohongshu.com`,
      ),
    ),
    xhsUrl,
  );
  assert.equal(extractSharedUrl("复制链接：" + douyinUrl + "。"), douyinUrl);
  assert.equal(
    extractSharedUrl("（https://example.org/a(b)）"),
    "https://example.org/a(b)",
  );
  assert.equal(
    extractSharedUrl("https://example.org/a(b))"),
    "https://example.org/a(b)",
  );
  assert.equal(extractSharedUrl("没有链接的普通备注"), "");
  assert.equal(extractSharedUrl("javascript:alert(1)"), "");
  assert.equal(
    extractSharedUrl("https://example.org/?token=A%2FB%3D&x=1#part"),
    "https://example.org/?token=A%2FB%3D&x=1#part",
  );
  assert.deepEqual(parseSharedText(douyinUrl), {
    url: douyinUrl,
    platform: "抖音",
    title: "",
    author: "",
  });
});
