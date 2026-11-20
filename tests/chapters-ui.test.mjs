import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
test("HTML import, chapter editing, reorder, save and reader chapter navigation", async () => {
  const dom = new JSDOM("<html><body></body></html>", {
    url: "https://archive.test",
  });
  for (const key of [
    "window",
    "document",
    "HTMLElement",
    "HTMLInputElement",
    "Node",
    "Event",
    "MutationObserver",
    "DOMParser",
  ])
    globalThis[key] =
      key === "window"
        ? dom.window
        : key === "document"
          ? dom.window.document
          : dom.window[key];
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { default: React } = await import("react");
  const { render, screen, fireEvent, waitFor, cleanup } =
    await import("@testing-library/react");
  const { default: userEvent } = await import("@testing-library/user-event");
  await mkdir(".wrangler/test-chapters", { recursive: true });
  await build({
    entryPoints: ["src/Editor.tsx", "src/Reader.tsx"],
    bundle: true,
    format: "esm",
    platform: "node",
    packages: "external",
    jsx: "automatic",
    outdir: ".wrangler/test-chapters",
    outExtension: { ".js": ".mjs" },
  });
  const { Editor } = await import(
    pathToFileURL(path.resolve(".wrangler/test-chapters/Editor.mjs")).href
  );
  const { Reader } = await import(
    pathToFileURL(path.resolve(".wrangler/test-chapters/Reader.mjs")).href
  );
  let payload,
    saves = 0;
  globalThis.fetch = async (url, opts) => {
    assert.equal(url, "/api/entries");
    payload = JSON.parse(opts.body);
    return Response.json({ id: "new-novel" });
  };
  const user = userEvent.setup({ document: dom.window.document });
  const props = {
    entry: null,
    close() {},
    saved: async () => {
      saves++;
    },
    busy: false,
    setBusy() {},
    tagOptions: { material: [], fanwork: [] },
    knownPlatforms: [],
  };
  try {
    render(React.createElement(Editor, props));
    await user.click(
      screen.getByRole("button", { name: "同人文", exact: true }),
    );
    const html =
      '<div id="preface"><div class="meta"><h1>导入的文稿</h1><a rel="author">测试作者</a></div><p class="message"><a href="https://archiveofourown.org/works/123">原帖</a></p></div><div id="chapters" class="userstuff"><div class="meta"><h2 class="heading">第一章</h2></div><div class="userstuff"><p>第一章正文</p></div><div class="meta"><h2 class="heading">第二章</h2></div><div class="userstuff"><p>第二章正文</p></div></div>';
    fireEvent.change(screen.getByLabelText("导入 AO3 HTML 或 TXT"), {
      target: {
        files: [new File([html], "example.html", { type: "text/html" })],
      },
    });
    await waitFor(() =>
      assert.equal(screen.getByLabelText(/标题 \*/).value, "导入的文稿"),
    );
    assert.equal(screen.getByLabelText("原作者 / 发布者").value, "测试作者");
    assert.equal(screen.getByLabelText("本章正文").value, "第一章正文");
    await user.click(screen.getByRole("button", { name: "添加章节" }));
    await user.type(screen.getByLabelText("章节标题"), "第三章");
    await user.type(screen.getByLabelText("本章正文"), "新增正文");
    await user.click(screen.getByRole("button", { name: "上移", exact: true }));
    assert.equal(screen.getByLabelText("编辑章节").value, "1");
    await user.click(screen.getByRole("button", { name: "保存收藏" }));
    await waitFor(() => assert.equal(saves, 1));
    assert.deepEqual(
      payload.chapters.map((c) => c.title),
      ["第一章", "第三章", "第二章"],
    );
    assert.equal(payload.links[0].platform, "AO3");
    cleanup();
    render(
      React.createElement(Reader, {
        entry: { ...payload, id: "new-novel" },
        close() {},
      }),
    );
    assert.match(screen.getByText("第一章正文").textContent, /第一章正文/);
    assert.equal(screen.queryByText("新增正文"), null);
    await user.selectOptions(screen.getByLabelText("阅读章节"), "1");
    assert.ok(screen.getByText("新增正文"));
    assert.equal(screen.queryByText("第一章正文"), null);
    await user.click(
      screen.getAllByRole("button", { name: "下一章", exact: true })[0],
    );
    assert.ok(screen.getByText("第二章正文"));
    assert.equal(
      screen.getAllByRole("button", { name: "下一章", exact: true })[0]
        .disabled,
      true,
    );
  } finally {
    cleanup();
    dom.window.close();
  }
});
