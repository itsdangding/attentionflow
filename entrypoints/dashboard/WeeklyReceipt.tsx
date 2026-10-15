import { useEffect, useMemo, useRef, useState } from "react";
import { defaults, type Settings } from "../../shared/config";
import { sendMessage } from "../../shared/runtime";
import type { Snapshot } from "../../shared/types";
import { sevenDays, summarize } from "../../analytics/summary";

const empty: Snapshot = {
  topics: [],
  exposures: [],
  clicks: [],
  reads: [],
  sessions: [],
  debugTraces: [],
};

type WeeklySummary = ReturnType<typeof summarize>;

const compactTime = (ms: number) => {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

const pct = (value: number, total: number) =>
  total > 0 ? Math.round((value / total) * 1000) / 10 : 0;

function fitTitle(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (ctx.measureText(value).width <= maxWidth) return value;
  const chars = Array.from(value);
  while (chars.length && ctx.measureText(`${chars.join("")}…`).width > maxWidth) chars.pop();
  return `${chars.join("")}…`;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

export default function WeeklyReceipt() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [includeTopTopic, setIncludeTopTopic] = useState(false);
  const [notice, setNotice] = useState("");
  const [rangeLabel, setRangeLabel] = useState("");

  const requestId = useRef(0);

  async function load() {
    const id = ++requestId.current;
    setSummary(null);
    setLoading(true);
    setNotice("");
    try {
      const days = sevenDays(Date.now());
      const start = days[0]!.start;
      const end = days[6]!.end;
      const [snapshot, settings] = await Promise.all([
        sendMessage({ type: "range", start, end }),
        sendMessage({ type: "settings" }) as Promise<Settings>,
      ]);
      if (id !== requestId.current) return;
      setSummary(summarize(snapshot ?? empty, start, end, settings.model ?? defaults.model));
      const first = new Date(start).toLocaleDateString("zh-CN", {
        month: "numeric",
        day: "numeric",
      });
      const last = new Date(end - 1).toLocaleDateString("zh-CN", {
        month: "numeric",
        day: "numeric",
      });
      setRangeLabel(`${first} – ${last}`);
    } catch (error) {
      if (id !== requestId.current) return;
      setNotice(`生成失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      setIncludeTopTopic(false);
      void load();
    }
    return () => { requestId.current++; };
  }, [open]);

  const shareText = useMemo(() => {
    if (!summary) return "";
    const passed = summary.funnel[0] ?? 0;
    const clicked = summary.funnel[3] ?? 0;
    const ignored = passed > 0 ? Math.max(0, 100 - pct(clicked, passed)) : 0;
    const lines = [
      "我的 Linux DO 一周注意力账单",
      `${rangeLabel} · 有效浏览 ${compactTime(summary.activeMs)}`,
      `经过 ${passed} · Seen ${summary.funnel[1] ?? 0} · 注意到 ${summary.funnel[2] ?? 0} · 点击 ${clicked} · 阅读 ${summary.readCount} · 深度阅读 ${summary.deepCount}`,
      passed > 0 ? `有 ${ignored}% 的帖子从眼前经过，但我没有点开。` : "这周还没有足够的浏览数据。",
    ];
    if (includeTopTopic && summary.top[0]) {
      lines.push(`最吸引我的帖子：${summary.top[0].title}`);
    }
    lines.push("Generated locally by AttentionFlow");
    return lines.join("\n");
  }, [summary, includeTopTopic, rangeLabel]);

  async function savePng() {
    if (!summary) return;
    await document.fonts?.ready;
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const passed = summary.funnel[0] ?? 0;
    const clicked = summary.funnel[3] ?? 0;
    const ignored = passed > 0 ? Math.max(0, 100 - pct(clicked, passed)) : 0;
    const metrics = [
      ["PASSED", passed],
      ["SEEN", summary.funnel[1] ?? 0],
      ["NOTICED", summary.funnel[2] ?? 0],
      ["CLICKED", clicked],
      ["READ", summary.readCount],
      ["DEEP READ", summary.deepCount],
    ] as const;

    ctx.fillStyle = "#f7f8f5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#2f704f";
    roundedRect(ctx, 70, 70, 84, 84, 24);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 42px Inter, Arial, sans-serif";
    ctx.fillText("af", 91, 126);

    ctx.fillStyle = "#26352d";
    ctx.font = "700 42px Inter, Arial, sans-serif";
    ctx.fillText("AttentionFlow", 180, 113);
    ctx.fillStyle = "#778579";
    ctx.font = "600 20px Inter, Arial, sans-serif";
    ctx.fillText("MY WEEK ON LINUX DO", 70, 215);
    ctx.fillText(rangeLabel, 820, 215);

    ctx.fillStyle = "#275c40";
    ctx.font = "700 108px Inter, Arial, sans-serif";
    ctx.fillText(compactTime(summary.activeMs), 70, 360);
    ctx.fillStyle = "#778579";
    ctx.font = "400 27px Inter, Arial, sans-serif";
    ctx.fillText("active browsing time", 74, 405);

    metrics.forEach(([label, value], index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = 70 + col * 320;
      const y = 475 + row * 190;
      ctx.fillStyle = "#ffffff";
      roundedRect(ctx, x, y, 285, 150, 20);
      ctx.fill();
      ctx.strokeStyle = "#e1e7dc";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#7c897d";
      ctx.font = "600 18px Inter, Arial, sans-serif";
      ctx.fillText(label, x + 24, y + 39);
      ctx.fillStyle = "#304d37";
      ctx.font = "600 58px Inter, Arial, sans-serif";
      ctx.fillText(String(value), x + 24, y + 105);
    });

    ctx.fillStyle = "#eaf0e2";
    roundedRect(ctx, 70, 875, 940, 175, 24);
    ctx.fill();
    ctx.fillStyle = "#6c836f";
    ctx.font = "600 19px Inter, Arial, sans-serif";
    ctx.fillText("THE GAP", 100, 920);
    ctx.fillStyle = "#275c40";
    ctx.font = "700 47px Inter, Arial, sans-serif";
    ctx.fillText(
      passed > 0 ? `${ignored}% passed by without a click.` : "Not enough browsing data yet.",
      100,
      986,
    );

    if (includeTopTopic && summary.top[0]) {
      ctx.fillStyle = "#778579";
      ctx.font = "600 18px Inter, Arial, sans-serif";
      ctx.fillText("TOP ATTENTION", 70, 1115);
      ctx.fillStyle = "#26352d";
      ctx.font = "600 27px Inter, Arial, sans-serif";
      ctx.fillText(fitTitle(ctx, summary.top[0].title, 940), 70, 1162);
      ctx.fillStyle = "#7f8b80";
      ctx.font = "400 19px Inter, Arial, sans-serif";
      ctx.fillText(`${compactTime(summary.top[0].ms)} · ${summary.top[0].visits} visits`, 70, 1200);
    } else {
      ctx.fillStyle = "#778579";
      ctx.font = "400 22px Inter, Arial, sans-serif";
      ctx.fillText("Topic titles hidden by default for privacy.", 70, 1150);
    }

    ctx.fillStyle = "#98a399";
    ctx.font = "400 17px Inter, Arial, sans-serif";
    ctx.fillText("Local data · no account · no cloud sync", 70, 1275);
    ctx.fillText("attentionflow · github.com/itsdangding/attentionflow", 580, 1275);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attentionflow-week-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice("分享卡已导出为 PNG");
  }

  async function handleCopy() {
    if (!shareText) return;
    const copied = await copyText(shareText);
    setNotice(copied ? "分享文案已复制" : "复制失败，请手动选择卡片内容");
  }

  return (
    <>
      <button className="receipt-launcher" onClick={() => setOpen(true)}>
        <span>▤</span>
        Weekly Receipt
      </button>
      {open && (
        <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label="Weekly Attention Receipt">
          <div className="receipt-modal">
            <button className="receipt-close" onClick={() => setOpen(false)} aria-label="关闭">
              ×
            </button>
            <div className="receipt-intro">
              <span className="receipt-kicker">GROWTH EXPERIMENT</span>
              <h2>你的 Linux DO 一周注意力账单</h2>
              <p>把浏览结果变成一张可以分享的卡。默认不包含帖子标题，避免泄露浏览内容。</p>
            </div>

            {loading ? (
              <div className="receipt-loading">正在整理最近 7 天的数据…</div>
            ) : summary ? (
              <>
                <div className="receipt-card">
                  <div className="receipt-brand">
                    <strong>AttentionFlow</strong>
                    <span>{rangeLabel}</span>
                  </div>
                  <div className="receipt-time">{compactTime(summary.activeMs)}</div>
                  <div className="receipt-time-label">有效浏览时间</div>
                  <div className="receipt-grid">
                    {[
                      ["经过", summary.funnel[0] ?? 0],
                      ["Seen", summary.funnel[1] ?? 0],
                      ["Noticed", summary.funnel[2] ?? 0],
                      ["Clicked", summary.funnel[3] ?? 0],
                      ["Read", summary.readCount],
                      ["Deep Read", summary.deepCount],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="receipt-insight">
                    {(summary.funnel[0] ?? 0) > 0
                      ? `${Math.max(0, 100 - pct(summary.funnel[3] ?? 0, summary.funnel[0] ?? 0))}% 的帖子从眼前经过，但你没有点开。`
                      : "这周还没有足够的浏览数据。"}
                  </div>
                  {includeTopTopic && summary.top[0] && (
                    <div className="receipt-top">
                      <span>最吸引你的帖子</span>
                      <strong>{summary.top[0].title}</strong>
                      <small>{compactTime(summary.top[0].ms)} · {summary.top[0].visits} 次访问</small>
                    </div>
                  )}
                  <div className="receipt-foot">LOCAL DATA · NO ACCOUNT · NO CLOUD SYNC</div>
                </div>

                <label className="receipt-privacy">
                  <input
                    type="checkbox"
                    checked={includeTopTopic}
                    onChange={(event) => setIncludeTopTopic(event.target.checked)}
                  />
                  分享卡中包含“最吸引我的帖子”标题
                </label>
                <div className="receipt-actions">
                  <button onClick={() => void savePng()}>导出 PNG</button>
                  <button className="outline" onClick={() => void handleCopy()}>复制分享文案</button>
                  <button className="outline" onClick={() => void load()}>重新统计</button>
                </div>
              </>
            ) : (
              <div className="receipt-loading">
                <span>{notice || "暂时无法生成周报。"}</span>
                <button onClick={() => void load()}>重新统计</button>
              </div>
            )}
            {notice && summary && <div className="receipt-notice">{notice}</div>}
          </div>
        </div>
      )}
    </>
  );
}
