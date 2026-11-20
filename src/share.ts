import { platformFor } from "./model";

function unescapeUrlText(text: string) {
  return text.replace(/\\([:/?.&=_#%+\-])/g, "$1");
}
/** Extract one URL without decoding or dropping signed query parameters. */
export function extractSharedUrl(raw: string) {
  const text = unescapeUrlText(raw);
  const matches = text.match(/https?:\/\/[^\s<>"“”‘’【】《》]+/gi) || [];
  for (let value of matches) {
    value = value.replace(/[，。！？、；：）】》」』,;!.]+$/u, "");
    for (const [open, close] of [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ])
      while (
        value.endsWith(close) &&
        value.split(close).length > value.split(open).length
      )
        value = value.slice(0, -1);
    try {
      const url = new URL(value);
      if (["http:", "https:"].includes(url.protocol) && url.hostname)
        return value;
    } catch {
      /* Continue to the next candidate. */
    }
  }
  return "";
}
export function parseSharedText(raw: string) {
  const text = unescapeUrlText(raw),
    url = extractSharedUrl(text),
    platform = platformFor(url);
  let title = "",
    author = "";
  const bracket = /【([^】]+)】/.exec(text);
  if (bracket && platform === "小红书") {
    const parts = /^([\s\S]*)\s+-\s+([^|]+?)\s*\|\s*小红书/.exec(bracket[1]);
    if (parts) {
      title = parts[1].trim();
      author = parts[2].trim();
    }
  } else if (bracket && platform === "抖音") {
    const creator = /^(.+?)的(?:图文|视频)?作品$/.exec(bracket[1]);
    if (creator) {
      author = creator[1].trim();
      const tail = text.slice(bracket.index + bracket[0].length);
      const stop = tail.search(/https?:\/\//i);
      if (stop >= 0)
        title = tail
          .slice(0, stop)
          .trim()
          .replace(/^[，,:：\s-]+/, "");
    }
  }
  return {
    url,
    platform,
    title: title.slice(0, 200),
    author: author.slice(0, 200),
  };
}
