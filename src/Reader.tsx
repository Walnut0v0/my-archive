import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Sun, Moon } from "lucide-react";
import { type Entry, chaptersFor, countCharacters } from "./model";
export function Reader({ entry, close }: { entry: Entry; close: () => void }) {
  const [font, setFont] = useState(19),
    [dark, setDark] = useState(false),
    [line, setLine] = useState("2"),
    [index, setIndex] = useState(0);
  const container = useRef<HTMLElement>(null),
    chapters = chaptersFor(entry),
    current = chapters[index];
  useEffect(() => {
    if (container.current) container.current.scrollTop = 0;
  }, [index]);
  const nav = (
    <div className="chapter-controls reader-navigation">
      <button disabled={index === 0} onClick={() => setIndex(index - 1)}>
        上一章
      </button>
      <select
        aria-label="阅读章节"
        value={index}
        onChange={(e) => setIndex(Number(e.target.value))}
      >
        {chapters.map((c, i) => (
          <option key={c.id} value={i}>
            第 {i + 1} 章{c.title ? " · " + c.title : ""}
          </option>
        ))}
      </select>
      <button
        disabled={index >= chapters.length - 1}
        onClick={() => setIndex(index + 1)}
      >
        下一章
      </button>
    </div>
  );
  return (
    <section
      ref={container}
      className={"reader " + (dark ? "dark" : "")}
      role="dialog"
      aria-modal="true"
      aria-label="沉浸式阅读"
    >
      <header>
        <button onClick={close}>
          <ArrowLeft size={19} />
          <span>返回收藏</span>
        </button>
        <div>
          <button
            aria-label="减小字号"
            onClick={() => setFont(Math.max(14, font - 1))}
          >
            A−
          </button>
          <span>{font}</span>
          <button
            aria-label="增大字号"
            onClick={() => setFont(Math.min(30, font + 1))}
          >
            A+
          </button>
          <select
            aria-label="阅读行距"
            value={line}
            onChange={(e) => setLine(e.target.value)}
          >
            <option value="1.6">紧凑</option>
            <option value="2">舒适</option>
            <option value="2.5">宽松</option>
          </select>
          <button onClick={() => setDark(!dark)} aria-label="切换阅读背景">
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
      </header>
      <article>
        <h1>{entry.title}</h1>
        <p className="reader-byline">
          {entry.author || "作者未注明"} · {chapters.length} 章 ·{" "}
          {chapters
            .reduce((n, c) => n + countCharacters(c.content), 0)
            .toLocaleString()}{" "}
          字
        </p>
        {chapters.length > 1 && nav}
        <h2 className="reader-chapter-title">
          {current?.title || `第 ${index + 1} 章`}
        </h2>
        <div
          className="reader-content"
          style={{ fontSize: font, lineHeight: line }}
        >
          {current?.content}
        </div>
        <div className="reader-end">
          {index < chapters.length - 1 ? "本章完" : "已读完已保存的章节"}
        </div>
        {chapters.length > 1 && (
          <div className="chapter-controls reader-navigation">
            <button disabled={index === 0} onClick={() => setIndex(index - 1)}>
              上一章
            </button>
            <span>
              {index + 1} / {chapters.length}
            </span>
            <button
              disabled={index >= chapters.length - 1}
              onClick={() => setIndex(index + 1)}
            >
              下一章
            </button>
          </div>
        )}
        <div className="reader-sources">
          {entry.links?.map((l, i) => (
            <a href={l.url} target="_blank" rel="noreferrer" key={i}>
              {l.platform}原文
            </a>
          ))}
        </div>
      </article>
    </section>
  );
}
