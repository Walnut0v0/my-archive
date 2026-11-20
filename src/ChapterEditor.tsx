import { useState } from "react";
import { type Chapter, countCharacters } from "./model";
export function ChapterEditor({
  chapters,
  onChange,
}: {
  chapters: Chapter[];
  onChange: (chapters: Chapter[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const selected = Math.min(index, Math.max(0, chapters.length - 1));
  const current = chapters[selected];
  const update = (key: "title" | "content", value: string) =>
    onChange(
      chapters.map((c, i) => (i === selected ? { ...c, [key]: value } : c)),
    );
  const move = (step: number) => {
    const target = selected + step;
    if (target < 0 || target >= chapters.length) return;
    const copy = [...chapters];
    [copy[selected], copy[target]] = [copy[target], copy[selected]];
    onChange(copy);
    setIndex(target);
  };
  return (
    <section className="chapter-editor">
      <div className="chapter-toolbar">
        <h3>章节正文</h3>
        <span>
          {chapters.filter((c) => c.title || c.content).length} 章 ·{" "}
          {chapters
            .reduce((n, c) => n + countCharacters(c.content), 0)
            .toLocaleString()}{" "}
          字
        </span>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            onChange([
              ...chapters,
              { id: crypto.randomUUID(), title: "", content: "" },
            ]);
            setIndex(chapters.length);
          }}
        >
          添加章节
        </button>
      </div>
      {current && (
        <>
          <div className="chapter-controls">
            <select
              aria-label="编辑章节"
              value={selected}
              onChange={(e) => setIndex(Number(e.target.value))}
            >
              {chapters.map((c, i) => (
                <option key={c.id} value={i}>
                  第 {i + 1} 章{c.title ? " · " + c.title : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={selected === 0}
              onClick={() => move(-1)}
            >
              上移
            </button>
            <button
              type="button"
              disabled={selected === chapters.length - 1}
              onClick={() => move(1)}
            >
              下移
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(chapters.filter((_, i) => i !== selected));
                setIndex(Math.max(0, selected - 1));
              }}
            >
              删除本章
            </button>
          </div>
          <label>
            章节标题
            <input
              aria-label="章节标题"
              maxLength={200}
              placeholder="章节标题（选填）"
              value={current.title}
              onChange={(e) => update("title", e.target.value)}
            />
          </label>
          <label>
            本章正文
            <textarea
              aria-label="本章正文"
              rows={12}
              maxLength={500000}
              placeholder="输入或粘贴本章正文"
              value={current.content}
              onChange={(e) => update("content", e.target.value)}
            />
          </label>
        </>
      )}
    </section>
  );
}
