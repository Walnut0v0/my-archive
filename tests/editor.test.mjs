import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { JSDOM } from "jsdom";

test("editor supports Enter tags, reusable tags, platform links, date precision and pasted media", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://archive.test/",
  });
  for (const key of [
    "window",
    "document",
    "HTMLElement",
    "HTMLInputElement",
    "Node",
    "Event",
    "MutationObserver",
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
  let objectId = 0;
  URL.createObjectURL = () => "blob:test-preview-" + objectId++;
  URL.revokeObjectURL = () => {};
  const { default: React } = await import("react");
  const { render, screen, fireEvent, waitFor, cleanup } =
    await import("@testing-library/react");
  const { default: userEvent } = await import("@testing-library/user-event");
  await mkdir(".wrangler/test-ui", { recursive: true });
  await build({
    entryPoints: ["src/Editor.tsx"],
    bundle: true,
    format: "esm",
    platform: "node",
    packages: "external",
    jsx: "automatic",
    outfile: ".wrangler/test-ui/editor.mjs",
  });
  const { Editor } = await import(
    pathToFileURL(path.resolve(".wrangler/test-ui/editor.mjs")).href
  );
  const calls = [];
  let resolveTitle;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url === "/api/metadata")
      return new Promise((resolve) => {
        resolveTitle = () => resolve(Response.json({ title: "自动标题" }));
      });
    return Response.json({
      id: url.endsWith("/images") ? crypto.randomUUID() : "new-entry",
      name: "pasted.png",
      mime: "image/png",
      size: 3,
    });
  };
  const user = userEvent.setup({ document: dom.window.document });
  let saved = 0;
  render(
    React.createElement(Editor, {
      entry: null,
      close() {},
      saved: async () => {
        saved++;
      },
      busy: false,
      setBusy() {},
      tagOptions: { material: ["旧标签", "角色A"], fanwork: ["同人专用"] },
      knownPlatforms: ["自定义站"],
    }),
  );
  try {
    assert.equal(screen.queryByRole("button", { name: "同人专用" }), null);
    await user.click(
      screen.getByRole("button", { name: "同人文", exact: true }),
    );
    assert.ok(screen.getByRole("button", { name: "同人专用" }));
    assert.equal(
      screen.queryByRole("button", { name: "旧标签", exact: true }),
      null,
    );
    await user.click(
      screen.getByRole("button", { name: "同人图", exact: true }),
    );
    assert.ok(screen.getByRole("button", { name: "同人专用" }));
    await user.click(screen.getByRole("button", { name: "物料", exact: true }));
    assert.ok(screen.getByRole("button", { name: "旧标签", exact: true }));
    await user.type(screen.getByLabelText("新增标签"), "新标签{Enter}");
    assert.ok(screen.getByRole("button", { name: "删除标签 新标签" }));
    assert.equal(screen.getByLabelText("新增标签").value, "");
    await user.click(screen.getByRole("button", { name: "旧标签" }));
    assert.ok(screen.getByRole("button", { name: "删除标签 旧标签" }));
    await user.click(
      screen.getByRole("checkbox", { name: "微博", exact: true }),
    );
    await user.type(
      screen.getByLabelText("微博链接 1"),
      "https://weibo.com/test",
    );
    await waitFor(() => assert.ok(resolveTitle));
    await user.type(screen.getByLabelText(/标题 \*/), "手动标题");
    await React.act(async () => resolveTitle());
    assert.equal(screen.getByLabelText(/标题 \*/).value, "手动标题");
    await user.click(
      screen.getByRole("button", { name: "再添加一个微博链接" }),
    );
    await user.type(
      screen.getByLabelText("微博链接 2"),
      "https://weibo.com/second",
    );
    await user.type(
      screen.getByLabelText("自定义平台名称"),
      "自己的平台{Enter}",
    );
    await user.type(
      screen.getByLabelText("自己的平台链接 3"),
      "https://example.org/item",
    );
    await user.selectOptions(screen.getByLabelText("发布日期精度"), "year");
    await user.type(screen.getByLabelText("发布日期", { exact: true }), "2020");
    const file = new File(["png"], "pasted.png", { type: "image/png" });
    fireEvent.paste(screen.getByRole("dialog"), {
      clipboardData: {
        items: [
          { kind: "file", getAsFile: () => file },
          {
            kind: "file",
            getAsFile: () =>
              new File(["mp4"], "clip.mp4", { type: "video/mp4" }),
          },
        ],
      },
    });
    await waitFor(() => assert.ok(screen.getByAltText("pasted.png")));
    await user.type(
      screen.getByPlaceholderText("例如仅自己可见的微博链接"),
      "https://weibo.com/backup",
    );
    await user.click(screen.getByRole("button", { name: "保存收藏" }));
    await waitFor(() => assert.equal(saved, 1));
    const payload = JSON.parse(
      calls.find((c) => c.url === "/api/entries").options.body,
    );
    assert.deepEqual(payload.tags, ["新标签", "旧标签"]);
    assert.equal(payload.links.length, 3);
    assert.equal(payload.published_date, "2020");
    assert.equal(payload.title, "手动标题");
    assert.equal(payload.backup_url, "https://weibo.com/backup");
    assert.equal(
      calls.filter((c) => c.url === "/api/entries/new-entry/images").length,
      2,
    );
    cleanup();
    resolveTitle = undefined;
    render(
      React.createElement(Editor, {
        entry: null,
        close() {},
        saved: async () => {},
        busy: false,
        setBusy() {},
        tagOptions: { material: [], fanwork: [] },
        knownPlatforms: [],
      }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: "微博", exact: true }),
    );
    await user.type(
      screen.getByLabelText("微博链接 1"),
      "https://weibo.com/auto",
    );
    await waitFor(() => assert.ok(resolveTitle));
    await React.act(async () => resolveTitle());
    await waitFor(() =>
      assert.equal(screen.getByLabelText(/标题 \*/).value, "自动标题"),
    );
  } finally {
    cleanup();
    dom.window.close();
  }
});
