import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
test("AO3 HTML imports metadata and actual chapters without notes or active HTML", async () => {
  const dom = new JSDOM("");
  globalThis.DOMParser = dom.window.DOMParser;
  try {
    const { outputFiles } = await build({
      entryPoints: ["src/ao3.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
    });
    const { parseAo3Html } = await import(
      "data:text/javascript;base64," +
        Buffer.from(outputFiles[0].text).toString("base64")
    );
    const source = `<div id="preface"><p class="message"><a href="https://archiveofourown.org/works/123">原帖</a></p><div class="meta"><h1>测试文稿</h1><div class="byline"><a rel="author">作者A</a></div><dl class="tags"><dd>Published: 2020-03-04 Updated: 2021-01-01 Words: 999 Chapters: 2/3</dd></dl><p>Summary</p><blockquote class="userstuff"><p>这是简介</p></blockquote><p>Notes</p><blockquote class="userstuff">作者前言</blockquote></div></div><div id="chapters" class="userstuff"><div class="meta group"><h2 class="heading">Chapter 1: 开始</h2></div><div class="userstuff"><p>第一段<strong>加粗</strong></p><p>第二段<br>换行</p><script>不得导入脚本</script><img src="https://example.org/a.png"></div><div class="meta"><p>Chapter End Notes</p><blockquote class="userstuff">章节注释</blockquote></div><div class="meta group"><h2 class="heading">Chapter 2: 后续</h2></div><div class="userstuff"><p>第三段</p></div></div>`;
    const data = parseAo3Html(source);
    assert.equal(data.title, "测试文稿");
    assert.equal(data.author, "作者A");
    assert.equal(data.url, "https://archiveofourown.org/works/123");
    assert.equal(data.published_date, "2020-03-04");
    assert.equal(data.notes, "这是简介");
    assert.equal(data.chapters.length, 2);
    assert.equal(data.chapters[0].title, "Chapter 1: 开始");
    assert.equal(data.chapters[0].content, "第一段加粗\n\n第二段\n换行");
    assert.equal(data.chapters[1].content, "第三段");
    assert.equal(data.word_count, 13);
    const single = parseAo3Html(
      '<div id="preface"><h1>短篇</h1></div><div id="chapters" class="userstuff"><p>单章正文</p></div>',
    );
    assert.equal(single.chapters.length, 1);
    assert.equal(single.chapters[0].content, "单章正文");
    assert.throws(() => parseAo3Html("<p>普通网页</p>"), /AO3/);
  } finally {
    dom.window.close();
  }
});
