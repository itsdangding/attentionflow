import { useEffect, useState } from "react";
import { defaults, VERSION, type Settings } from "../../shared/config";
import { sendMessage } from "../../shared/runtime";
import type { Snapshot } from "../../shared/types";
import { summarize, sevenDays } from "../../analytics/summary";
import { stages } from "../../core/model";
import { localDay } from "../../core/time";
import History from "./History";
const empty: Snapshot = {
  topics: [],
  exposures: [],
  clicks: [],
  reads: [],
  sessions: [],
  debugTraces: [],
};
interface Stats {
  counts: Record<string, number>;
  usage: number | null;
}
const time = (ms: number) =>
  ms < 60000
    ? `${Math.floor(ms / 1000)} 秒`
    : `${Math.floor(ms / 60000)} 分 ${Math.floor(ms / 1000) % 60} 秒`;
const clock = (at: number) =>
  new Date(at).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
export default function App() {
  const [page, setPage] = useState("today"),
    [data, setData] = useState<Snapshot>(empty),
    [settings, setSettings] = useState<Settings>(defaults),
    [message, setMessage] = useState(""),
    [ready, setReady] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    [stats, setStats] = useState<Stats | null>(null),
    [version, setVersion] = useState(0);
  const send = sendMessage;
  async function load() {
    try {
      const week = sevenDays(Date.now());
      const [snapshot, config] = await Promise.all([
        send({ type: "range", start: week[0]!.start, end: week[6]!.end }),
        send({ type: "settings" }),
      ]);
      setData(snapshot);
      setSettings(config);
      setVersion((v) => v + 1);
      if (page === "settings") setStats(await send({ type: "stats" }));
      setReady(true);
    } catch (e) {
      setMessage(`加载失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      void load();
    }, 15000);
    return () => clearInterval(interval);
  }, [page]);
  const now = Date.now(),
    days = sevenDays(now),
    start = page === "week" ? days[0]!.start : localDay(now),
    end = days[6]!.end;
  const summary = summarize(data, start, end, settings.model);
  async function update(config: Settings) {
    try {
      await send({ type: "configure", settings: config });
      setSettings(config);
      setMessage("设置已应用到所有 Linux DO 标签页");
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function download() {
    try {
      const payload = await send({ type: "export" });
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `attentionflow-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("已导出全部数据（含 Debug Trace）");
    } catch (e) {
      setMessage(String(e));
    }
  }
  return (
    <div className="layout">
      <aside>
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setPage("today");
          }}
        >
          <span className="logo">
            a<span>f</span>
          </span>
          AttentionFlow<small>YOUR ATTENTION, RECONSTRUCTED</small>
        </a>
        <div className="nav-label">OVERVIEW</div>
        <nav>
          {(
            [
              ["today", "◉", "Today"],
              ["week", "▥", "Last 7 Days"],
              ["history", "☰", "History"],
              ["settings", "⚙", "Settings"],
            ] as const
          ).map(([id, icon, label]) => (
            <button
              key={id}
              className={page === id ? "selected" : ""}
              onClick={() => setPage(id)}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="aside-bottom">
          <span className={`dot ${settings.tracking ? "on" : ""}`} />
          {settings.tracking ? "Tracking is on" : "Tracking is off"}
          <p>
            仅存储于此浏览器
            <br />
            Linux DO · v{VERSION}
          </p>
        </div>
      </aside>
      <main>
        <header>
          <div className="eyebrow">ATTENTION JOURNAL</div>
          <div className="heading">
            <h1>
              {page === "today"
                ? "Today"
                : page === "week"
                  ? "Last 7 Days"
                  : page === "history"
                    ? "History"
                    : "Settings"}
            </h1>
            <span>
              {new Date().toLocaleDateString("zh-CN", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
            <button className="outline" onClick={() => void load()}>
              刷新
            </button>
          </div>
          <p>
            {page === "settings"
              ? "所有数据留在本地。采集行为由你控制。"
              : page === "history"
                ? "读过的帖子，按最近一次阅读排列。点击回到上次读到的楼层。"
              : "看见、停留、选择与阅读。回顾你的注意力去了哪里。"}
          </p>
        </header>
        {message && (
          <div role="status" className="notice">
            {message}
            <button onClick={() => setMessage("")} aria-label="关闭消息">
              ×
            </button>
          </div>
        )}
        {!ready ? (
          <div className="card">正在加载本地数据…</div>
        ) : page === "history" ? (
          <History
            model={settings.model}
            version={version}
            onError={setMessage}
          />
        ) : page === "settings" ? (
          <>
            <section className="card">
              <h2>采集设置</h2>
              {(
                [
                  ["tracking", "Tracking", "自动采集 Linux DO 浏览行为"],
                  ["debug", "Debug Mode", "显示调试面板并记录 10Hz 原始时间线"],
                ] as const
              ).map(([key, title, detail]) => (
                <label className="setting" key={key}>
                  <span>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings[key as "tracking" | "debug"]}
                    onChange={(e) =>
                      void update({ ...settings, [key]: e.target.checked })
                    }
                  />
                </label>
              ))}
            </section>
            <section className="card">
              <h2>数据管理</h2>
              <p>
                JSON 包含版本、帖子、曝光、点击候选集、阅读、Session
                与调试记录。导入按主键合并，保留已有记录。
              </p>
              {stats && (
                <p>
                  {stats.usage !== null &&
                    `本地占用约 ${(stats.usage / 1048576).toFixed(1)} MB · `}
                  曝光 {stats.counts.exposures ?? 0} · 阅读{" "}
                  {stats.counts.reads ?? 0} · 点击 {stats.counts.clicks ?? 0} ·
                  Session {stats.counts.sessions ?? 0} · Debug Trace{" "}
                  {stats.counts.debugTraces ?? 0}（自动保留 7 天）
                </p>
              )}
              <div className="actions">
                <button onClick={() => void download()}>导出 JSON</button>
                <label className="file-button">
                  导入 JSON
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const added = await send({
                          type: "import",
                          data: JSON.parse(await file.text()),
                        });
                        await load();
                        setMessage(`导入成功，新增 ${added} 条记录`);
                      } catch (error) {
                        setMessage(
                          `导入失败：${error instanceof Error ? error.message : String(error)}`,
                        );
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  className="outline"
                  onClick={async () => {
                    await send({ type: "clearDebug" });
                    await load();
                    setMessage("Debug Trace 已清空");
                  }}
                >
                  清空 Debug Trace
                </button>
              </div>
              <div className="danger">
                <h3>删除全部数据</h3>
                <p>永久删除此浏览器中的全部行为记录，设置保留。</p>
                {confirmDelete ? (
                  <div className="actions">
                    <button
                      className="red"
                      onClick={async () => {
                        await send({ type: "delete" });
                        await load();
                        setConfirmDelete(false);
                        setMessage("全部数据已删除");
                      }}
                    >
                      确认永久删除
                    </button>
                    <button
                      className="outline"
                      onClick={() => setConfirmDelete(false)}
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    className="outline red"
                    onClick={() => setConfirmDelete(true)}
                  >
                    删除全部数据
                  </button>
                )}
              </div>
            </section>
            <section className="card">
              <h2>Attention Model · Alpha</h2>
              <p>阈值集中管理。修改后会对历史原始数据重新计算分类。</p>
              <div className="parameters">
                {Object.entries(settings.model).map(([key, value]) => (
                  <label key={key}>
                    {key}
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={value}
                      onChange={(e) => {
                        const number = Number(e.target.value);
                        if (Number.isFinite(number) && number >= 0)
                          void update({
                            ...settings,
                            model: { ...settings.model, [key]: number },
                          });
                      }}
                    />
                  </label>
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="hero">
              <div>
                <span className="eyebrow">有效浏览时间</span>
                <div className="big-time">
                  {Math.floor(summary.activeMs / 60000)}
                  <span>min</span>
                  <small>{Math.floor(summary.activeMs / 1000) % 60}s</small>
                </div>
                <p>{summary.sessions.length} 个 Session · 前台且有活动的时间</p>
              </div>
              <div className="hero-note">
                Attention is a choice.
                <br />
                <span>记录行为，理解选择。</span>
              </div>
            </section>
            <section className="metrics">
              {[
                ["经过", summary.funnel[0]],
                ["Seen", summary.funnel[1]],
                ["Noticed", summary.funnel[2]],
                ["Clicked", summary.funnel[3]],
                ["Read", summary.readCount],
                ["Deep Read", summary.deepCount],
              ].map(([label, value]) => (
                <div className="metric" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small>去重 Topic</small>
                </div>
              ))}
            </section>
            {summary.activeMs === 0 && summary.funnel[0] === 0 && (
              <div className="empty">
                还没有浏览记录。打开{" "}
                <a
                  href="https://linux.do/latest"
                  target="_blank"
                  rel="noreferrer"
                >
                  Linux DO
                </a>{" "}
                正常浏览，AttentionFlow 会自动开始记录。
              </div>
            )}
            {page === "week" && (
              <section className="card">
                <h2>
                  浏览趋势 <small>本地时区 · 最近七天</small>
                </h2>
                <div className="trend">
                  {days.map((day) => {
                    const s = summarize(
                      data,
                      day.start,
                      day.end,
                      settings.model,
                    );
                    const max = Math.max(
                      1,
                      ...days.map(
                        (d) =>
                          summarize(data, d.start, d.end, settings.model)
                            .activeMs,
                      ),
                    );
                    return (
                      <div key={day.start}>
                        <span>{Math.round(s.activeMs / 60000)}m</span>
                        <div className="bar-track">
                          <div
                            style={{ height: `${(s.activeMs / max) * 100}%` }}
                          />
                        </div>
                        <small>
                          {new Date(day.start).toLocaleDateString("zh-CN", {
                            month: "numeric",
                            day: "numeric",
                          })}
                        </small>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
            <div className="columns">
              <section className="card">
                <h2>
                  Attention Funnel <small>按 Topic 去重</small>
                </h2>
                <p>高阶段包含低阶段，仅统计列表路径。</p>
                <div className="funnel">
                  {stages.map((stage, i) => (
                    <div key={stage}>
                      <span>{stage}</span>
                      <div className="funnel-track">
                        <div
                          style={{
                            width: `${((summary.funnel[i] ?? 0) / Math.max(1, summary.funnel[0])) * 100}%`,
                            opacity: 1 - i * 0.1,
                          }}
                        />
                      </div>
                      <strong>{summary.funnel[i]}</strong>
                    </div>
                  ))}
                </div>
                <div className="footnote">
                  漏斗外阅读 <strong>{summary.outside}</strong> ·
                  通知、外部链接与直接访问
                </div>
              </section>
              <section className="card">
                <h2>
                  Top Attention <small>有效阅读时长</small>
                </h2>
                {summary.top.length ? (
                  summary.top.slice(0, 8).map((topic, i) => (
                    <a
                      className="topic"
                      key={topic.id}
                      href={`https://linux.do/t/${topic.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="rank">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <strong>{topic.title}</strong>
                        <small>
                          {topic.visits} 次访问 · 阅读深度{" "}
                          {Math.round(topic.depth * 100)}%
                        </small>
                      </span>
                      <b>{time(topic.ms)}</b>
                    </a>
                  ))
                ) : (
                  <div className="empty small">
                    阅读一个帖子后，在这里查看你的注意力去向。
                  </div>
                )}
              </section>
            </div>
            <section className="card">
              <h2>
                Session Timeline <small>{summary.sessions.length} 次浏览</small>
              </h2>
              {summary.sessions.length ? (
                summary.sessions
                  .sort((a, b) => b.startedAt - a.startedAt)
                  .map((s) => (
                    <div className="session" key={s.id}>
                      <span className="session-dot" />
                      <span>
                        {new Date(s.startedAt).toLocaleDateString("zh-CN")}
                        <strong>
                          {clock(s.startedAt)} — {clock(s.endedAt)}
                        </strong>
                      </span>
                      <div className="session-track">
                        <div
                          style={{
                            width: `${Math.max(1, (s.periodMs / Math.max(1, summary.activeMs)) * 100)}%`,
                          }}
                        />
                      </div>
                      <b>{time(s.periodMs)}</b>
                    </div>
                  ))
              ) : (
                <div className="empty small">
                  你的下一次浏览，将从这里开始。
                </div>
              )}
            </section>
            <footer>
              本地数据 · 无账号 · 无云同步
              <span>
                {summary.exposureCount} 次原始曝光 · {summary.clickCount}{" "}
                个点击候选集{" "}
                <button onClick={() => void download()}>导出数据 ↗</button>
              </span>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
