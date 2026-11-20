import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  Bookmark,
  Plus,
  Search,
  LayoutList,
  Image as ImageIcon,
  BookOpen,
  Layers,
  Star,
  Settings,
  ArrowUpRight,
  Copy,
  MoreHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Check,
  Lock,
  Tag,
  SlidersHorizontal,
  Trash2,
  Pencil,
  Cloud,
  LoaderCircle,
  Upload,
  Sun,
  Moon,
  ArrowLeft,
} from "lucide-react";
import { zipSync, strToU8 } from "fflate";
import "./style.css";
import {
  type Kind,
  type Photo,
  type Entry,
  publicationLabel,
  videoFile,
  type TagGroup,
  tagGroupFor,
} from "./model";
import { api } from "./client";
import { Editor } from "./Editor";
import { Reader } from "./Reader";
interface Stats {
  total: number;
  starred: number;
  bytes: number;
  limit: number;
  counts: { type: Kind; count: number }[];
  tags: { name: string; count: number; tag_group: TagGroup }[];
  platforms: string[];
}
const kinds = {
  material: { name: "物料", icon: Layers },
  fiction: { name: "同人文", icon: BookOpen },
  art: { name: "同人图", icon: ImageIcon },
};
const date = (s: string) =>
  new Date(s).toLocaleString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const size = (n: number) =>
  n > 1e9
    ? (n / 1e9).toFixed(2) + " GB"
    : n > 1e6
      ? (n / 1e6).toFixed(1) + " MB"
      : (n / 1e3).toFixed(0) + " KB";
function saveFile(data: Blob, name: string) {
  const url = URL.createObjectURL(data),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function App() {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const lock = () => setLocked(true);
    window.addEventListener("archive-locked", lock);
    return () => window.removeEventListener("archive-locked", lock);
  }, []);
  const [items, setItems] = useState<Entry[]>([]),
    [stats, setStats] = useState<Stats | null>(null),
    [category, setCategory] = useState("all"),
    [tag, setTag] = useState(""),
    [tagGroup, setTagGroup] = useState<TagGroup>("material"),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [order, setOrder] = useState("newest"),
    [basis, setBasis] = useState("created"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [filters, setFilters] = useState(false);
  const [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editor, setEditor] = useState<Entry | "new" | null>(null),
    [reader, setReader] = useState<Entry | null>(null),
    [viewer, setViewer] = useState<{ images: Photo[]; index: number } | null>(
      null,
    ),
    [settings, setSettings] = useState(false),
    [exporting, setExporting] = useState(false),
    [busy, setBusy] = useState(false),
    [remove, setRemove] = useState<Entry | null>(null),
    [menu, setMenu] = useState("");
  const toast = useCallback((s: string) => setNotice(s), []);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 3500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    const t = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(t);
  }, [query]);
  const params = useCallback(
    (offset = 0) => {
      const p = new URLSearchParams({ offset: String(offset), order, basis });
      if (category === "starred") p.set("starred", "1");
      else if (category !== "all") p.set("type", category);
      if (tag) {
        p.set("tag", tag);
        p.set("tag_group", tagGroup);
      }
      if (search) p.set("q", search);
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      return p;
    },
    [category, tag, search, order, from, to, basis, tagGroup],
  );
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [data, s] = await Promise.all([
        api<{ items: Entry[]; more: boolean }>("/entries?" + params()),
        api<Stats>("/stats"),
      ]);
      setItems(data.items);
      setMore(data.more);
      setStats(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [params]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    const f = () => void reload();
    window.addEventListener("focus", f);
    return () => window.removeEventListener("focus", f);
  }, [reload]);
  useEffect(() => {
    const modal = !!editor || !!reader || !!viewer || settings || !!remove;
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('[role="dialog"] button')?.focus(),
    );
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (viewer) setViewer(null);
        else if (editor && !busy) setEditor(null);
        else if (reader) setReader(null);
        else if (settings) setSettings(false);
        else if (remove && !busy) setRemove(null);
      }
      if (e.key === "Tab") {
        const dialog = Array.from(
          document.querySelectorAll('[role="dialog"]'),
        ).at(-1);
        if (!dialog) return;
        const focusables = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select,a[href]",
          ),
        ).filter((el) => el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0],
          last = focusables.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [editor, reader, viewer, settings, remove, busy]);
  async function loadMore() {
    setBusy(true);
    try {
      const data = await api("/entries?" + params(items.length));
      setItems((v) => [...v, ...data.items]);
      setMore(data.more);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openEntry(e: Entry, mode: "edit" | "read") {
    if (busy) return;
    setBusy(true);
    try {
      const full = await api<Entry>("/entries/" + e.id);
      if (mode === "edit") setEditor(full);
      else setReader(full);
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function star(e: Entry) {
    try {
      await api("/entries/" + e.id, {
        method: "PATCH",
        body: JSON.stringify({ starred: !e.starred }),
      });
      await reload();
    } catch (err) {
      toast((err as Error).message);
    }
  }
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast("链接已复制");
    } catch {
      toast("复制失败，请打开原帖后复制地址");
    }
  }
  async function deleteEntry() {
    if (!remove) return;
    setBusy(true);
    try {
      await api("/entries/" + remove.id, { method: "DELETE" });
      setRemove(null);
      await reload();
      toast("收藏已删除");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportAll(images: boolean) {
    setExporting(true);
    try {
      const data = await api("/export");
      if (!images) {
        saveFile(
          new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
          }),
          "拾藏-文字与索引.json",
        );
        toast("文字与索引已导出（不含图片文件）");
        return;
      }
      if ((stats?.bytes || 0) > 300_000_000)
        throw new Error(
          "图片超过 300 MB，请先导出文字索引，并使用设置中的 Wrangler 指令备份 R2，避免浏览器内存不足。",
        );
      const files: Record<string, Uint8Array> = {
        "archive.json": strToU8(JSON.stringify(data, null, 2)),
      };
      for (const entry of data.entries as Entry[])
        for (const photo of entry.images) {
          const r = await fetch("/api/images/" + photo.id);
          if (!r.ok) throw new Error("图片下载失败，导出已停止，请重试");
          files[
            "images/" + photo.id + "." + (photo.mime.split("/")[1] || "bin")
          ] = new Uint8Array(await r.arrayBuffer());
        }
      files["说明.txt"] = strToU8(
        "archive.json 保存全部收藏、正文和图片索引。images 目录中的文件以图片 ID 命名。请妥善保管私人档案。",
      );
      saveFile(
        new Blob([zipSync(files, { level: 0 }) as Uint8Array<ArrayBuffer>], {
          type: "application/zip",
        }),
        "拾藏-完整备份.zip",
      );
      toast("完整备份已导出");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  const choose = (c: string) => {
    setCategory(c);
    setTag("");
    setMenu("");
  };
  const title = tag
    ? "# " + tag
    : category === "all"
      ? "全部收藏"
      : category === "starred"
        ? "特别喜欢"
        : kinds[category as Kind].name;
  if (locked)
    return (
      <Login
        unlocked={() => {
          setLocked(false);
          void reload();
        }}
      />
    );
  return (
    <>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="拾藏首页">
          <span className="brand-icon">
            <Bookmark size={24} />
          </span>
          <span>拾藏</span>
        </a>
        <p className="sidebar-label">收藏夹</p>
        <nav>
          {[
            {
              id: "all",
              name: "全部收藏",
              icon: LayoutList,
              count: stats?.total,
            },
            ...Object.entries(kinds).map(([id, k]) => ({
              id,
              ...k,
              count: stats?.counts.find((c) => c.type === id)?.count || 0,
            })),
            {
              id: "starred",
              name: "特别喜欢",
              icon: Star,
              count: stats?.starred || 0,
            },
          ].map((n) => (
            <button
              key={n.id}
              className={
                "nav-item " + (category === n.id && !tag ? "active" : "")
              }
              onClick={() => choose(n.id)}
            >
              <n.icon size={19} />
              <span>{n.name}</span>
              <small>{n.count ?? "—"}</small>
            </button>
          ))}
        </nav>
        <div className="tags-heading">
          <p className="sidebar-label">我的标签</p>
          <Tag size={14} />
        </div>
        <div className="side-tags">
          {(["material", "fanwork"] as TagGroup[])
            .filter((group) =>
              category === "material"
                ? group === "material"
                : category === "fiction" || category === "art"
                  ? group === "fanwork"
                  : true,
            )
            .map((group) => (
              <section key={group} className="tag-group">
                <h3>{group === "material" ? "物料标签" : "同人标签"}</h3>
                {stats?.tags.filter((t) => t.tag_group === group).length ? (
                  stats.tags
                    .filter((t) => t.tag_group === group)
                    .map((t) => (
                      <button
                        key={t.name}
                        className={
                          tag === t.name && tagGroup === group ? "selected" : ""
                        }
                        onClick={() => {
                          setTag(
                            tag === t.name && tagGroup === group ? "" : t.name,
                          );
                          setTagGroup(group);
                          setCategory("all");
                        }}
                      >
                        <span># {t.name}</span>
                        <small>{t.count}</small>
                      </button>
                    ))
                ) : (
                  <p className="muted tiny">暂无标签</p>
                )}
              </section>
            ))}
        </div>
        <div className="sidebar-bottom">
          <div className="private">
            <Lock size={14} />
            <span>私人档案</span>
          </div>
          <button className="settings-link" onClick={() => setSettings(true)}>
            <Settings size={17} /> 设置与备份 <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            我的档案 <ChevronRight size={14} />
            <span>{title}</span>
          </div>
          <div className="top-actions">
            <span className="cloud-status">
              <Cloud size={16} />
              {stats ? "云端已连接" : "私人云端档案"}
            </span>
            <button
              className="icon-button mobile-settings"
              onClick={() => setSettings(true)}
              aria-label="设置"
            >
              <Settings size={20} />
            </button>
            <span className="avatar">我</span>
          </div>
        </header>
        <div className="workspace">
          <section className="page-heading">
            <div>
              <h1>
                {title}
                <span>
                  {tag
                    ? ""
                    : stats
                      ? category === "all"
                        ? stats.total
                        : category === "starred"
                          ? stats.starred
                          : stats.counts.find((c) => c.type === category)
                              ?.count || 0
                      : "—"}
                </span>
              </h1>
            </div>
            <button className="primary" onClick={() => setEditor("new")}>
              <Plus size={19} /> 新增收藏
            </button>
          </section>
          <div className="mobile-nav">
            {[
              { id: "all", name: "全部" },
              ...Object.entries(kinds).map(([id, k]) => ({ id, name: k.name })),
              { id: "starred", name: "喜欢" },
            ].map((c) => (
              <button
                className={category === c.id ? "active" : ""}
                key={c.id}
                onClick={() => choose(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="toolbar">
            <label className="search">
              <Search size={19} />
              <input
                aria-label="搜索收藏"
                placeholder="搜索标题、作者、标签或正文…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  className="icon-button"
                  onClick={() => setQuery("")}
                  aria-label="清除搜索"
                >
                  <X size={16} />
                </button>
              )}
            </label>
            <button
              className={"filter-button " + (filters ? "selected" : "")}
              onClick={() => setFilters(!filters)}
            >
              <SlidersHorizontal size={17} />
              <span>筛选</span>
            </button>
            <button
              className="icon-button refresh"
              onClick={() => void reload()}
              aria-label="刷新收藏"
            >
              <RefreshCw size={17} className={loading ? "spin" : ""} />
            </button>
          </div>
          {filters && (
            <div className="filters">
              <label>
                起始日期{" "}
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                结束日期{" "}
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <button
                onClick={() => {
                  setFrom("");
                  setTo("");
                  setTag("");
                  setQuery("");
                }}
              >
                清除筛选
              </button>
            </div>
          )}
          {tag && (
            <button className="tag-filter" onClick={() => setTag("")}>
              {tagGroup === "material" ? "物料" : "同人"} · # {tag}{" "}
              <X size={13} />
            </button>
          )}
          <div className="list-heading">
            <label className="timeline-basis">
              时间线{" "}
              <select
                aria-label="时间线依据"
                value={basis}
                onChange={(e) => setBasis(e.target.value)}
              >
                <option value="created">收藏时间</option>
                <option value="published">发布日期</option>
              </select>
            </label>
            <span>
              <span className="status-dot" />{" "}
              {search
                ? "搜索结果"
                : basis === "published"
                  ? "发布日期时间线"
                  : "收藏时间线"}
            </span>
            <select
              aria-label="排列顺序"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            >
              <option value="newest">从新到旧</option>
              <option value="oldest">从旧到新</option>
            </select>
          </div>
          {error ? (
            <section className="empty error">
              <Lock size={34} />
              <h2>档案暂时无法打开</h2>
              <p>{error}</p>
              <button className="secondary" onClick={() => void reload()}>
                重新连接
              </button>
            </section>
          ) : loading ? (
            <div className="loading">
              <LoaderCircle className="spin" size={25} />
              正在加载…
            </div>
          ) : !items.length ? (
            <section className="empty">
              <div className="empty-illustration">
                <Bookmark size={42} strokeWidth={1.3} />
                <span>✦</span>
              </div>
              <h2>
                {search || tag || from || to ? "没有匹配的收藏" : "暂无收藏"}
              </h2>
              <p>
                {search || tag || from || to
                  ? "换一个关键词，或清除筛选再看看。"
                  : "点击下方按钮添加收藏。"}
              </p>
              <button className="primary" onClick={() => setEditor("new")}>
                <Plus size={17} /> 新增收藏
              </button>
              <div className="empty-hint">
                <Lock size={13} /> 云端保存 · 私人访问 · 多设备同步
              </div>
            </section>
          ) : (
            <div className="feed">
              {items.map((e, index) => {
                const K = kinds[e.type];
                return (
                  <React.Fragment key={e.id}>
                    {basis === "published" &&
                      (index === 0 ||
                        items[index - 1].published_date.slice(0, 4) !==
                          e.published_date.slice(0, 4)) && (
                        <h2 className="timeline-year">
                          {e.published_date
                            ? e.published_date.slice(0, 4) + "年"
                            : "发布日期未填写"}
                        </h2>
                      )}
                    <article className="card">
                      <div className="card-meta">
                        <span className={"type-icon " + e.type}>
                          <K.icon size={19} />
                        </span>
                        <div>
                          <strong>{e.author || "我的收藏"}</strong>
                          <small>{date(e.created_at)} · 收藏</small>
                          {e.published_date && (
                            <time
                              className="published-date"
                              dateTime={e.published_date}
                            >
                              发布于 {publicationLabel(e.published_date)}
                            </time>
                          )}
                        </div>
                        <span className={"type-label " + e.type}>{K.name}</span>
                        <div className="card-menu">
                          <button
                            className="icon-button"
                            aria-label="更多操作"
                            onClick={() => setMenu(menu === e.id ? "" : e.id)}
                          >
                            <MoreHorizontal size={20} />
                          </button>
                          {menu === e.id && (
                            <div className="dropdown">
                              <button
                                onClick={() => {
                                  void openEntry(e, "edit");
                                  setMenu("");
                                }}
                              >
                                <Pencil size={15} />
                                编辑收藏
                              </button>
                              <button
                                onClick={() => {
                                  setRemove(e);
                                  setMenu("");
                                }}
                              >
                                <Trash2 size={15} />
                                删除收藏
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <h2>{e.title}</h2>
                      {e.type === "fiction" && !e.chapter_count && (
                        <p className="fiction-stats">
                          0 章 · 0 字（未保存正文）
                        </p>
                      )}
                      {e.notes && <p className="card-notes">{e.notes}</p>}
                      {e.type === "fiction" && e.chapter_count > 0 && (
                        <button
                          className="article-preview"
                          onClick={() => void openEntry(e, "read")}
                        >
                          <div className="book-cover">
                            <BookOpen size={27} />
                          </div>
                          <div>
                            <span>
                              {e.chapter_count} 章 ·{" "}
                              {e.word_count.toLocaleString()} 字
                            </span>
                            <strong>{e.title}</strong>
                            <p>{e.content.slice(0, 100)}</p>
                          </div>
                          <ChevronRight size={20} />
                        </button>
                      )}
                      {e.images.length > 0 && (
                        <div
                          className={
                            "photo-grid " +
                            (e.images.length === 1 ? "single" : "")
                          }
                        >
                          {e.images.slice(0, 9).map((img, i) => (
                            <button
                              key={img.id}
                              onClick={() =>
                                setViewer({ images: e.images, index: i })
                              }
                              aria-label={"查看附件 " + (i + 1)}
                            >
                              {videoFile(img.mime) ? (
                                <span className="video-thumb">
                                  <video
                                    src={"/api/images/" + img.id}
                                    preload="metadata"
                                    muted
                                    playsInline
                                  />
                                  <span>播放视频</span>
                                </span>
                              ) : (
                                <img
                                  loading="lazy"
                                  src={"/api/images/" + img.id}
                                  alt={img.name}
                                />
                              )}
                              {i === 8 && e.images.length > 9 && (
                                <span>+{e.images.length - 9}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      {e.tags.length > 0 && (
                        <div className="card-tags">
                          {e.tags.map((t) => (
                            <button
                              key={t}
                              onClick={() => {
                                setTag(t);
                                setTagGroup(tagGroupFor(e.type));
                                setCategory("all");
                              }}
                            >
                              # {t}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="source-links">
                        {e.links.map((link, i) => (
                          <div className="source-link" key={i}>
                            <a href={link.url} target="_blank" rel="noreferrer">
                              {link.platform}{" "}
                              {e.links.filter(
                                (l) => l.platform === link.platform,
                              ).length > 1
                                ? e.links
                                    .slice(0, i + 1)
                                    .filter((l) => l.platform === link.platform)
                                    .length
                                : ""}
                            </a>
                            <button
                              onClick={() => void copy(link.url)}
                              aria-label={"复制" + link.platform + "链接"}
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                        ))}
                        {e.backup_url && (
                          <div className="source-link backup">
                            <a
                              href={e.backup_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              备份链接
                            </a>
                            <button
                              onClick={() => void copy(e.backup_url)}
                              aria-label="复制备份链接"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                      <footer>
                        <div>
                          {e.type === "fiction" && e.chapter_count > 0 && (
                            <button onClick={() => void openEntry(e, "read")}>
                              <BookOpen size={15} />
                              阅读
                            </button>
                          )}
                        </div>
                        <button
                          className={e.starred ? "starred" : ""}
                          onClick={() => void star(e)}
                          aria-label={
                            e.starred ? "取消特别喜欢" : "标为特别喜欢"
                          }
                        >
                          <Star
                            size={17}
                            fill={e.starred ? "currentColor" : "none"}
                          />
                          <span>{e.starred ? "特别喜欢" : "喜欢"}</span>
                        </button>
                      </footer>
                    </article>
                  </React.Fragment>
                );
              })}
              {more && (
                <button
                  disabled={busy}
                  className="load-more secondary"
                  onClick={() => void loadMore()}
                >
                  {busy ? "正在加载…" : "加载更多收藏"}
                </button>
              )}
              <p className="endnote">{more ? "" : "没有更多收藏"}</p>
            </div>
          )}
        </div>
        <footer className="page-footer">拾藏</footer>
      </main>
      {notice && (
        <div role="status" className="toast">
          <Check size={17} />
          {notice}
        </div>
      )}
      {editor && (
        <Editor
          entry={editor === "new" ? null : editor}
          close={() => {
            if (!busy) setEditor(null);
          }}
          saved={async () => {
            setEditor(null);
            await reload();
            toast("收藏已保存到云端");
          }}
          setBusy={setBusy}
          busy={busy}
          tagOptions={{
            material:
              stats?.tags
                .filter((t) => t.tag_group === "material")
                .map((t) => t.name) || [],
            fanwork:
              stats?.tags
                .filter((t) => t.tag_group === "fanwork")
                .map((t) => t.name) || [],
          }}
          knownPlatforms={stats?.platforms || []}
        />
      )}
      {reader && <Reader entry={reader} close={() => setReader(null)} />}
      {viewer && (
        <Lightbox
          state={viewer}
          close={() => setViewer(null)}
          change={(i) => setViewer({ ...viewer, index: i })}
        />
      )}
      {remove && (
        <div className="overlay">
          <section
            className="modal confirm"
            role="dialog"
            aria-modal="true"
            aria-label="删除收藏"
          >
            <button
              className="modal-close icon-button"
              disabled={busy}
              onClick={() => setRemove(null)}
              aria-label="关闭"
            >
              <X />
            </button>
            <Trash2 size={28} />
            <h2>删除这份收藏？</h2>
            <p>“{remove.title}”及其云端附件将被删除。此操作无法撤销。</p>
            <div className="modal-footer">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setRemove(null)}
              >
                取消
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={() => void deleteEntry()}
              >
                {busy ? "正在删除…" : "确认删除"}
              </button>
            </div>
          </section>
        </div>
      )}
      {settings && (
        <div className="overlay">
          <section
            className="modal settings"
            role="dialog"
            aria-modal="true"
            aria-label="设置与备份"
          >
            <button
              className="modal-close icon-button"
              onClick={() => setSettings(false)}
              aria-label="关闭"
            >
              <X />
            </button>
            <h2>设置与备份</h2>
            <div className="setting-block">
              <h3>
                <Cloud size={18} /> 云端附件空间
              </h3>
              <p>{size(stats?.bytes || 0)} / 8 GB</p>
              <progress value={stats?.bytes || 0} max={8e9} />
              <small>
                达到 8 GB 后停止上传。图片最多 15 MB，视频最多 50 MB。
              </small>
            </div>
            <div className="setting-block">
              <h3>
                <Download size={18} /> 数据备份
              </h3>
              <p>
                导出包含正文、标签、原始链接的 JSON 索引，或打包图片和全部记录。
              </p>
              <div className="backup-actions">
                <button
                  className="secondary"
                  disabled={exporting}
                  onClick={() => void exportAll(false)}
                >
                  导出文字与索引
                </button>
                <button
                  className="primary"
                  disabled={exporting}
                  onClick={() => void exportAll(true)}
                >
                  {exporting ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  完整 ZIP 备份
                </button>
              </div>
              <small>
                ZIP 适合图片总量 300 MB 以内。更大的档案可先导出索引，再按仓库
                README 的 R2 备份说明保存原图。
              </small>
            </div>
            <div className="setting-block">
              <h3>
                <Lock size={18} /> 私人访问
              </h3>
              <p>
                输入密码即可打开全部收藏。同一设备会保持登录，无须反复输入。
              </p>
              <button
                className="secondary"
                onClick={async () => {
                  await api("/logout", { method: "POST" });
                  setSettings(false);
                  setLocked(true);
                }}
              >
                锁定收藏 <Lock size={14} />
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
function Lightbox({
  state,
  close,
  change,
}: {
  state: { images: Photo[]; index: number };
  close: () => void;
  change: (i: number) => void;
}) {
  const { images, index } = state;
  const prev = () => change((index - 1 + images.length) % images.length),
    next = () => change((index + 1) % images.length);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index]);
  return (
    <section
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="附件查看器"
    >
      <header>
        <span>
          {index + 1} / {images.length}
        </span>
        <div>
          <a
            href={"/api/images/" + images[index].id}
            download={images[index].name}
            aria-label="下载原图"
          >
            <Download size={22} />
          </a>
          <button onClick={close} aria-label="关闭图片">
            <X size={25} />
          </button>
        </div>
      </header>
      {images.length > 1 && (
        <button className="image-prev" onClick={prev} aria-label="上一张">
          <ChevronLeft size={30} />
        </button>
      )}
      {videoFile(images[index].mime) ? (
        <video
          key={images[index].id}
          src={"/api/images/" + images[index].id}
          controls
          playsInline
          autoPlay
        />
      ) : (
        <img src={"/api/images/" + images[index].id} alt={images[index].name} />
      )}
      {images.length > 1 && (
        <button className="image-next" onClick={next} aria-label="下一张">
          <ChevronRight size={30} />
        </button>
      )}
      <footer>{images[index].name}</footer>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
function Login({ unlocked }: { unlocked: () => void }) {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      unlocked();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-icon">
          <Bookmark size={29} />
        </div>
        <h1>拾藏</h1>
        <label>
          输入密码，打开我的档案
          <input
            autoFocus
            aria-label="解锁密码"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <Lock size={16} />
          )}{" "}
          {busy ? "正在打开…" : "打开收藏"}
        </button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
