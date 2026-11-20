import { type Chapter, countCharacters } from "./model";
function plain(node: Node): string {
  if (node.nodeType === 3) return node.textContent || "";
  if (node.nodeType !== 1) return "";
  const element = node as Element,
    name = element.tagName.toLowerCase();
  if (
    [
      "script",
      "style",
      "iframe",
      "object",
      "svg",
      "noscript",
      "template",
    ].includes(name)
  )
    return "";
  if (name === "br") return "\n";
  if (name === "hr") return "\n\n";
  const text = Array.from(node.childNodes).map(plain).join("");
  return [
    "p",
    "div",
    "li",
    "blockquote",
    "h1",
    "h2",
    "h3",
    "h4",
    "section",
  ].includes(name)
    ? "\n" + text + "\n"
    : text;
}
const textOf = (node: Node | null) =>
  node
    ? plain(node)
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    : "";
export function parseAo3Html(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.querySelector("#chapters");
  if (!root)
    throw new Error(
      "没有找到 AO3 下载文件的正文，请选择从 AO3 下载的 HTML 文件。",
    );
  const preface = doc.querySelector("#preface");
  const title =
    textOf(preface?.querySelector("h1") || null) ||
    doc.title.split(" - ")[0].trim();
  const authors = Array.from(
    preface?.querySelectorAll("a[rel~=author]") || [],
  ).map(textOf);
  const author = [...new Set(authors)].join("、");
  let notes = "";
  for (const p of Array.from(preface?.querySelectorAll(".meta > p") || [])) {
    if (
      /^Summary:?$/i.test(p.textContent?.trim() || "") &&
      p.nextElementSibling?.matches("blockquote")
    ) {
      notes = textOf(p.nextElementSibling);
      break;
    }
  }
  const stats = preface?.querySelector("dl.tags")?.textContent || "";
  const published_date =
    /Published:\s*(\d{4}-\d{2}-\d{2})/.exec(stats)?.[1] || "";
  let url = "";
  for (const a of Array.from(preface?.querySelectorAll("a[href]") || [])) {
    try {
      const u = new URL(
        a.getAttribute("href") || "",
        "https://archiveofourown.org",
      );
      if (
        u.protocol === "https:" &&
        /^(?:www\.)?archiveofourown\.org$/.test(u.hostname) &&
        /^\/works\/\d+/.test(u.pathname)
      ) {
        url = u.origin + u.pathname;
        break;
      }
    } catch {}
  }
  const chapters: Chapter[] = [];
  for (const element of Array.from(root.querySelectorAll(".userstuff"))) {
    if (element.closest(".meta,.notes")) continue;
    const ancestor = element.parentElement?.closest(".userstuff");
    if (ancestor && ancestor !== root) continue;
    let heading = "";
    let sibling = element.previousElementSibling;
    while (sibling && !heading) {
      heading = textOf(
        sibling.matches(".heading")
          ? sibling
          : sibling.querySelector("h2.heading,h3.title"),
      );
      sibling = sibling.previousElementSibling;
    }
    const content = textOf(element);
    if (content)
      chapters.push({
        id: crypto.randomUUID(),
        title: heading || "正文",
        content,
      });
  }
  // A single-chapter download can put its paragraphs directly in #chapters.
  if (!chapters.length) {
    const copy = root.cloneNode(true) as Element;
    copy
      .querySelectorAll(".meta,.notes,.toc-heading")
      .forEach((e) => e.remove());
    const content = textOf(copy);
    if (content)
      chapters.push({ id: crypto.randomUUID(), title: "正文", content });
  }
  if (!chapters.length) throw new Error("文件中没有找到可导入的章节正文。");
  if (
    chapters.length > 200 ||
    chapters.reduce((n, c) => n + c.content.length, 0) > 1_000_000
  )
    throw new Error("文稿超过当前上限：200 章、总计 100 万字符。");
  return {
    title,
    author,
    url,
    published_date,
    notes,
    chapters,
    word_count: chapters.reduce((n, c) => n + countCharacters(c.content), 0),
  };
}
