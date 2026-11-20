export type SourceLink = { platform: string; url: string };
export const platformsFor = (kind: string) =>
  kind === "fiction"
    ? ["微博", "Lofter", "AO3", "小红书"]
    : ["小红书", "微博", "bilibili", "豆瓣"];
export function platformFor(url: string) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    for (const [domains, name] of [
      ["weibo.com,weibo.cn", "微博"],
      ["xiaohongshu.com,xhslink.com", "小红书"],
      ["bilibili.com,b23.tv", "bilibili"],
      ["douban.com", "豆瓣"],
      ["lofter.com", "Lofter"],
      ["archiveofourown.org,ao3.org", "AO3"],
    ]) {
      if (domains.split(",").some((d) => h === d || h.endsWith("." + d)))
        return name;
    }
    return h;
  } catch {
    return "";
  }
}
export function publication(value: string) {
  if (!value) return { value: "", start: "", end: "" };
  if (!/^\d{4}(-\d{2})?(-\d{2})?$/.test(value))
    throw new Error("发布日期应为年、年月或年月日");
  const [y, m, d] = value.split("-").map(Number);
  if (y < 1 || y > 9999 || (m !== undefined && (m < 1 || m > 12)))
    throw new Error("发布日期无效");
  const days = new Date(Date.UTC(y === 1 ? 2001 : y, m || 12, 0)).getUTCDate();
  // Gregorian leap-year handling also works for years below 100.
  const last =
    m === 2
      ? y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
        ? 29
        : 28
      : days;
  if (d !== undefined && (d < 1 || d > last)) throw new Error("发布日期无效");
  return {
    value,
    start: value + (m === undefined ? "-01-01" : d === undefined ? "-01" : ""),
    end:
      value +
      (m === undefined
        ? "-12-31"
        : d === undefined
          ? "-" + String(last).padStart(2, "0")
          : ""),
  };
}
export function publicationLabel(v: string) {
  if (!v) return "发布日期未填写";
  const [y, m, d] = v.split("-");
  return y + "年" + (m ? Number(m) + "月" : "") + (d ? Number(d) + "日" : "");
}
export const videoFile = (mime: string) => mime.startsWith("video/");

export type Kind = "material" | "fiction" | "art";
export interface Photo {
  id: string;
  name: string;
  mime: string;
  size: number;
}
export interface Entry {
  id: string;
  type: Kind;
  title: string;
  author: string;
  url: string;
  links: SourceLink[];
  backup_url: string;
  published_date: string;
  notes: string;
  content: string;
  tags: string[];
  starred: boolean;
  created_at: string;
  images: Photo[];
}

export type TagGroup = "material" | "fanwork";
export const tagGroupFor = (kind: string): TagGroup =>
  kind === "material" ? "material" : "fanwork";
