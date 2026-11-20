import { useEffect, useRef, useState } from "react";
import {
  X,
  Plus,
  Upload,
  Bookmark,
  LoaderCircle,
  Star,
  Copy,
} from "lucide-react";
import { api } from "./client";
import {
  type Entry,
  type Kind,
  type Photo,
  type SourceLink,
  type TagGroup,
  tagGroupFor,
  platformsFor,
  platformFor,
  publication,
  videoFile,
} from "./model";
const kinds = { material: "物料", fiction: "同人文", art: "同人图" };
export function Editor({
  entry,
  close,
  saved,
  busy,
  setBusy,
  tagOptions,
  knownPlatforms,
}: {
  entry: Entry | null;
  close: () => void;
  saved: () => Promise<void>;
  busy: boolean;
  setBusy: (b: boolean) => void;
  tagOptions: Record<TagGroup, string[]>;
  knownPlatforms: string[];
}) {
  const [draft, setDraft] = useState({
    type: "material" as Kind,
    title: "",
    author: "",
    notes: "",
    content: "",
    starred: false,
    backup_url: "",
    published_date: "",
    ...entry,
  });
  const knownTags = tagOptions[tagGroupFor(draft.type)];
  const [links, setLinks] = useState<SourceLink[]>(entry?.links || []),
    [tags, setTags] = useState<string[]>(entry?.tags || []),
    [tagInput, setTagInput] = useState(""),
    [custom, setCustom] = useState("");
  const [precision, setPrecision] = useState(
    entry?.published_date?.length === 4
      ? "year"
      : entry?.published_date?.length === 7
        ? "month"
        : "day",
  );
  const [files, setFiles] = useState<File[]>([]),
    [photos, setPhotos] = useState<Photo[]>(entry?.images || []),
    [removed, setRemoved] = useState<string[]>([]),
    [previews, setPreviews] = useState<string[]>([]);
  const [err, setErr] = useState(""),
    [progress, setProgress] = useState(""),
    [savedId, setSavedId] = useState(entry?.id || ""),
    [metadataNote, setMetadataNote] = useState(""),
    [reading, setReading] = useState(false);
  const titleRef = useRef(draft.title),
    attempted = useRef(new Set<string>()),
    readingCount = useRef(0);
  titleRef.current = draft.title;
  const field = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);
  async function getTitle(url: string) {
    if (titleRef.current.trim()) {
      setMetadataNote("标题已填写；如需自动读取，请先清空标题。");
      return;
    }
    readingCount.current++;
    setReading(true);
    setMetadataNote("正在读取网页标题…");
    try {
      const data = await api("/metadata", {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      if (data.title && !titleRef.current.trim()) {
        setDraft((d) => (d.title.trim() ? d : { ...d, title: data.title }));
        setMetadataNote("已读取标题，可以自行修改。");
      } else if (!data.title) setMetadataNote("未能读取标题，请手动填写。");
    } catch {
      setMetadataNote("未能读取标题，请手动填写。");
    } finally {
      if (--readingCount.current === 0) setReading(false);
    }
  }
  const linkKey = links.map((l) => l.url).join("\n");
  useEffect(() => {
    const url = links.find(
      (l) => /^https?:\/\//.test(l.url) && !attempted.current.has(l.url),
    )?.url;
    if (!url || draft.title.trim()) return;
    const t = setTimeout(() => {
      attempted.current.add(url);
      void getTitle(url);
    }, 650);
    return () => clearTimeout(t);
  }, [linkKey, draft.title]);
  function addTag(value: string) {
    const t = value.trim();
    if (!t) return;
    if (t.length > 40) {
      setErr("标签最多 40 个字");
      return;
    }
    if (tags.length >= 30 && !tags.includes(t)) {
      setErr("最多添加 30 个标签");
      return;
    }
    setTags((v) => (v.includes(t) ? v : [...v, t]));
    setTagInput("");
  }
  function addFiles(input: File[]) {
    if (!input.length) return;
    if (files.length + photos.length + input.length > 30) {
      setErr("每条收藏最多添加 30 个附件");
      return;
    }
    if (
      input.some(
        (f) =>
          ![
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "video/mp4",
            "video/webm",
          ].includes(f.type),
      )
    ) {
      setErr("支持 JPG、PNG、GIF、WebP 图片及 MP4、WebM 视频");
      return;
    }
    if (
      input.some((f) => f.size > (videoFile(f.type) ? 50 : 15) * 1024 * 1024)
    ) {
      setErr("图片最多 15 MB，视频最多 50 MB");
      return;
    }
    setErr("");
    setFiles((v) => [...v, ...input]);
  }
  function togglePlatform(platform: string) {
    if (links.some((l) => l.platform === platform))
      setLinks((v) => v.filter((l) => l.platform !== platform));
    else setLinks((v) => [...v, { platform, url: "" }]);
  }
  function changeLink(i: number, value: string) {
    setLinks((v) => v.map((l, j) => (j === i ? { ...l, url: value } : l)));
  }
  function addCustom() {
    const name = custom.trim();
    if (!name) return;
    if (name.length > 60) {
      setErr("平台名称最多 60 个字");
      return;
    }
    setLinks((v) => [...v, { platform: name, url: "" }]);
    setCustom("");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    let id = savedId;
    try {
      publication(draft.published_date);
      const pendingTag = tagInput.trim();
      if (pendingTag.length > 40) throw new Error("标签最多 40 个字");
      const allTags = [
        ...new Set([...tags, ...(pendingTag ? [pendingTag] : [])]),
      ];
      const payload = {
        ...draft,
        links: links.filter((l) => l.url.trim()),
        tags: allTags,
      };
      if (id)
        await api("/entries/" + id, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      else {
        id = (
          await api("/entries", {
            method: "POST",
            body: JSON.stringify(payload),
          })
        ).id;
        setSavedId(id);
      }
      for (const imageId of removed) {
        await api("/images/" + imageId, { method: "DELETE" });
        setRemoved((v) => v.filter((x) => x !== imageId));
      }
      const remaining = [...files];
      for (let i = 0; i < files.length; i++) {
        setProgress(`上传附件 ${i + 1} / ${files.length}`);
        const form = new FormData();
        form.set("file", files[i]);
        const photo = await api("/entries/" + id + "/images", {
          method: "POST",
          body: form,
        });
        setPhotos((v) => [...v, photo]);
        remaining.shift();
        setFiles([...remaining]);
      }
      await saved();
    } catch (e) {
      setErr(
        (e as Error).message +
          (id ? "（记录已保存，重试可继续更新或上传）" : ""),
      );
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  const platforms = [
    ...new Set([
      ...platformsFor(draft.type),
      ...knownPlatforms,
      ...links.map((l) => l.platform),
    ]),
  ];
  return (
    <div className="overlay">
      <form
        className="modal editor"
        role="dialog"
        aria-modal="true"
        aria-label={entry ? "编辑收藏" : "新增收藏"}
        onSubmit={submit}
        onPaste={(e) => {
          if (busy) return;
          const items = Array.from(e.clipboardData.items)
            .filter((i) => i.kind === "file")
            .map((i) => i.getAsFile())
            .filter((f): f is File => !!f);
          if (items.length) {
            e.preventDefault();
            addFiles(items);
          }
        }}
      >
        <header>
          <h2>{entry ? "编辑收藏" : "新增收藏"}</h2>
          <button
            type="button"
            className="icon-button"
            disabled={busy}
            onClick={close}
            aria-label="关闭"
          >
            <X />
          </button>
        </header>
        <fieldset disabled={busy}>
          <div className="kind-picker">
            {Object.entries(kinds).map(([kind, name]) => (
              <button
                type="button"
                key={kind}
                className={draft.type === kind ? "active" : ""}
                onClick={() => field("type", kind)}
              >
                {name}
              </button>
            ))}
          </div>
          <section className="source-editor">
            <h3>原帖平台与链接</h3>
            <div className="platform-options">
              {platforms.map((p) => (
                <label key={p}>
                  <input
                    type="checkbox"
                    checked={links.some((l) => l.platform === p)}
                    onChange={() => togglePlatform(p)}
                  />
                  {p}
                </label>
              ))}
            </div>
            <div className="custom-platform">
              <input
                aria-label="自定义平台名称"
                placeholder="其他平台名称"
                maxLength={60}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    addCustom();
                  }
                }}
              />
              <button type="button" className="secondary" onClick={addCustom}>
                添加平台
              </button>
            </div>
            {links.map((l, i) => (
              <div className="source-input" key={i}>
                <span>{l.platform}</span>
                <input
                  aria-label={l.platform + "链接 " + (i + 1)}
                  type="url"
                  required
                  maxLength={3000}
                  placeholder="https://…"
                  value={l.url}
                  onChange={(e) => changeLink(i, e.target.value)}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData("text").trim();
                    if (/^https?:\/\//.test(text)) changeLink(i, text);
                  }}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={"再添加一个" + l.platform + "链接"}
                  onClick={() =>
                    setLinks((v) => [...v, { platform: l.platform, url: "" }])
                  }
                >
                  <Plus size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="删除此链接"
                  onClick={() => setLinks((v) => v.filter((_, j) => i !== j))}
                >
                  <X size={16} />
                </button>
                <button
                  type="button"
                  className="title-fetch"
                  disabled={reading || !l.url}
                  onClick={() => void getTitle(l.url)}
                >
                  读取标题
                </button>
              </div>
            ))}
            {metadataNote && (
              <p className="metadata-note" role="status">
                {metadataNote}
              </p>
            )}
          </section>
          <label>
            标题 <span>*</span>
            <input
              autoFocus
              required
              maxLength={200}
              value={draft.title}
              onChange={(e) => field("title", e.target.value)}
              placeholder="输入标题，或先粘贴链接自动读取"
            />
          </label>
          <div className="form-row">
            <label>
              原作者 / 发布者
              <input
                maxLength={200}
                value={draft.author}
                onChange={(e) => field("author", e.target.value)}
                placeholder="作者名称（选填）"
              />
            </label>
            <label>
              备份链接
              <input
                type="url"
                maxLength={3000}
                value={draft.backup_url}
                onChange={(e) => field("backup_url", e.target.value)}
                placeholder="例如仅自己可见的微博链接"
              />
            </label>
          </div>
          <div className="publication-input">
            <label>
              发布日期精度
              <select
                aria-label="发布日期精度"
                value={precision}
                onChange={(e) => {
                  setPrecision(e.target.value);
                  field("published_date", "");
                }}
              >
                <option value="day">年月日</option>
                <option value="month">年月</option>
                <option value="year">年</option>
              </select>
            </label>
            <label>
              发布日期（选填）
              <input
                key={precision}
                aria-label="发布日期"
                type={
                  precision === "year"
                    ? "text"
                    : precision === "month"
                      ? "month"
                      : "date"
                }
                inputMode={precision === "year" ? "numeric" : undefined}
                pattern={precision === "year" ? "[0-9]{4}" : undefined}
                maxLength={precision === "year" ? 4 : undefined}
                value={draft.published_date}
                onChange={(e) => field("published_date", e.target.value)}
                placeholder={precision === "year" ? "例如 2020" : undefined}
              />
            </label>
          </div>
          <label>
            标签
            <input
              aria-label="新增标签"
              maxLength={40}
              placeholder="输入标签后按回车添加"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
            />
          </label>
          <div className="tag-chips">
            {tags.map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setTags((v) => v.filter((x) => x !== t))}
                aria-label={"删除标签 " + t}
              >
                {t}
                <X size={13} />
              </button>
            ))}
          </div>
          {knownTags.filter(
            (t) =>
              !tags.includes(t) &&
              (!tagInput || t.toLowerCase().includes(tagInput.toLowerCase())),
          ).length > 0 && (
            <div className="tag-suggestions">
              <span>已有标签</span>
              {knownTags
                .filter(
                  (t) =>
                    !tags.includes(t) &&
                    (!tagInput ||
                      t.toLowerCase().includes(tagInput.toLowerCase())),
                )
                .map((t) => (
                  <button type="button" key={t} onClick={() => addTag(t)}>
                    {t}
                  </button>
                ))}
            </div>
          )}
          <label>
            备注 / 简介
            <textarea
              rows={3}
              maxLength={10000}
              value={draft.notes}
              onChange={(e) => field("notes", e.target.value)}
              placeholder="备注或简介（选填）"
            />
          </label>
          {draft.type === "fiction" && (
            <div>
              <label>
                文稿正文
                <textarea
                  rows={9}
                  maxLength={1000000}
                  value={draft.content}
                  onChange={(e) => field("content", e.target.value)}
                  placeholder="粘贴正文（选填）"
                />
              </label>
              <label className="text-import">
                <Upload size={14} />
                导入 TXT
                <input
                  type="file"
                  accept=".txt,text/plain"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 3000000) {
                      setErr("TXT 文件过大");
                      return;
                    }
                    const text = await f.text();
                    if (text.length > 1000000) {
                      setErr("正文最多 100 万字");
                      return;
                    }
                    field("content", text);
                  }}
                />
              </label>
            </div>
          )}
          <label>
            图片 / 视频{" "}
            <span className="optional">
              可直接 Ctrl+V 粘贴；图片 ≤15 MB，视频 ≤50 MB
            </span>
          </label>
          <div
            className="paste-zone"
            tabIndex={0}
            aria-label="粘贴图片或视频区域"
          >
            <Copy size={17} /> 点击此处后按 Ctrl+V 粘贴剪贴板中的图片或视频文件
          </div>
          <div className="upload-grid">
            {photos.map((p) => (
              <div key={p.id}>
                {videoFile(p.mime) ? (
                  <video
                    src={"/api/images/" + p.id}
                    controls
                    preload="metadata"
                    playsInline
                  />
                ) : (
                  <img src={"/api/images/" + p.id} alt={p.name} />
                )}
                <button
                  type="button"
                  aria-label="移除附件"
                  onClick={() => {
                    setRemoved((v) => [...v, p.id]);
                    setPhotos((v) => v.filter((x) => x.id !== p.id));
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {previews.map((url, i) => (
              <div key={url}>
                {videoFile(files[i]?.type || "") ? (
                  <video src={url} muted preload="metadata" />
                ) : (
                  <img src={url} alt={files[i]?.name} />
                )}
                <button
                  type="button"
                  aria-label="移除待上传附件"
                  onClick={() => setFiles((v) => v.filter((_, j) => j !== i))}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <label className="upload-button">
              <Plus size={24} />
              <span>选择文件</span>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files || []));
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.starred}
              onChange={(e) => field("starred", e.target.checked)}
            />
            <Star size={15} />
            标为特别喜欢
          </label>
        </fieldset>
        {err && (
          <p className="form-error" role="alert">
            {err}
          </p>
        )}
        <footer className="modal-footer">
          <span>{progress}</span>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={close}
          >
            取消
          </button>
          <button className="primary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Bookmark size={16} />
            )}{" "}
            {busy ? "正在保存…" : "保存收藏"}
          </button>
        </footer>
      </form>
    </div>
  );
}
