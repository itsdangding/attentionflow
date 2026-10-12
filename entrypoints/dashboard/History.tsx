import { useEffect, useMemo, useState } from "react";
import type { Settings } from "../../shared/config";
import type { Read, Topic } from "../../shared/types";
import { sendMessage } from "../../shared/runtime";
import { localDay } from "../../core/time";
import {
  historyEntries,
  filterHistory,
  groupByDay,
  type HistoryEntry,
} from "../../analytics/history";
const ranges = [
  ["7", "7 天"],
  ["30", "30 天"],
  ["all", "全部"],
] as const;
const sourceLabel: Record<Read["entrySource"], string> = {
  list_click: "列表",
  notification: "通知",
  search: "搜索",
  external: "外部链接",
  direct: "直接访问",
};
const duration = (ms: number) =>
  ms < 60000
    ? `${Math.floor(ms / 1000)} 秒`
    : `${Math.floor(ms / 60000)} 分 ${Math.floor(ms / 1000) % 60} 秒`;
const clock = (at: number) =>
  new Date(at).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
function dayLabel(day: number, today: number) {
  if (day === today) return "今天";
  if (day === localDay(today - 1)) return "昨天";
  return new Date(day).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}
function depthLabel(e: HistoryEntry) {
  if (e.depth === null)
    return e.maxPostNumberSeen ? `读到 #${e.maxPostNumberSeen}` : "";
  return `读到 ${e.maxPostNumberSeen}/${e.highestPostNumber} 楼 · ${Math.round(e.depth * 100)}%`;
}
export default function History({
  model,
  version,
  onError,
}: {
  model: Settings["model"];
  version: number;
  onError: (message: string) => void;
}) {
  const [range, setRange] = useState<(typeof ranges)[number][0]>("30"),
    [data, setData] = useState<{ reads: Read[]; topics: Topic[] } | null>(
      null,
    ),
    [query, setQuery] = useState(""),
    [tag, setTag] = useState(""),
    [includeShort, setIncludeShort] = useState(false);
  useEffect(() => {
    const today = localDay(Date.now());
    const since =
      range === "all"
        ? 0
        : new Date(today).setDate(new Date(today).getDate() - Number(range) + 1);
    sendMessage({ type: "history", since }).then(setData, (e: unknown) =>
      onError(`加载历史失败：${e instanceof Error ? e.message : String(e)}`),
    );
  }, [range, version]);
  const entries = useMemo(
    () => (data ? historyEntries(data.reads, data.topics, model) : []),
    [data, model],
  );
  const tags = useMemo(
    () => [...new Set(entries.flatMap((e) => e.tags).filter(Boolean))].sort(),
    [entries],
  );
  const visible = filterHistory(entries, {
    query,
    tag,
    includeShort,
  });
  const today = localDay(Date.now());
  if (!data) return <div className="card">正在加载阅读历史…</div>;
  return (
    <>
      <section className="card history-filters">
        <div className="segmented" role="group" aria-label="时间范围">
          {ranges.map(([id, label]) => (
            <button
              key={id}
              className={range === id ? "selected" : ""}
              onClick={() => setRange(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="搜索标题或 Topic ID"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="搜索标题"
        />
        <select
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          aria-label="标签"
        >
          <option value="">全部标签</option>
          {tags.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={includeShort}
            onChange={(e) => setIncludeShort(e.target.checked)}
          />
          包含不足 {Math.round(model.readMs / 1000)} 秒的访问
        </label>
      </section>
      <section className="card">
        <h2>
          阅读历史{" "}
          <small>
            {visible.length} 个帖子 ·{" "}
            {duration(visible.reduce((n, e) => n + e.ms, 0))}
          </small>
        </h2>
        {visible.length ? (
          groupByDay(visible).map(([day, items]) => (
            <div key={day} className="history-day">
              <h3>{dayLabel(day, today)}</h3>
              {items.map((e) => (
                <a
                  className="topic"
                  key={e.id}
                  href={`https://linux.do/t/${e.id}${
                    e.maxPostNumberSeen > 1 ? `/${e.maxPostNumberSeen}` : ""
                  }`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="rank">{clock(e.lastReadAt)}</span>
                  <span>
                    <strong>
                      {e.deep && <em className="badge">深读</em>}
                      {e.title}
                    </strong>
                    <small>
                      {[
                        e.category,
                        e.tags.slice(0, 3).join(" "),
                        `${e.visits} 次访问`,
                        depthLabel(e),
                        e.sources.map((s) => sourceLabel[s]).join("/"),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                  <b>{duration(e.ms)}</b>
                </a>
              ))}
            </div>
          ))
        ) : (
          <div className="empty small">
            {entries.length ? "没有符合条件的帖子。" : "这段时间还没有阅读记录。"}
          </div>
        )}
      </section>
    </>
  );
}
