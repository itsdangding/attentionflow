import type { Snapshot } from "../shared/types";
import type { Settings } from "../shared/config";
import { classify } from "../core/model";
import { duration, localDay } from "../core/time";
export function summarize(
  data: Snapshot,
  start: number,
  end: number,
  model: Settings["model"],
) {
  const exposures = data.exposures
    .filter((e) => e.enteredAt < end && e.leftAt >= start)
    .map((e) => {
      const fraction =
        Math.max(0, Math.min(end, e.leftAt) - Math.max(start, e.enteredAt)) /
        Math.max(1, e.leftAt - e.enteredAt);
      return {
        ...e,
        viewportMs: e.viewportMs * fraction,
        attentionZoneMs: e.attentionZoneMs * fraction,
        sharedAttentionMs: e.sharedAttentionMs * fraction,
        scrollStopMs: e.scrollStopMs * fraction,
        hoverMs: e.hoverMs * fraction,
      };
    });
  const clicks = data.clicks.filter(
    (c) => c.clickedAt >= start && c.clickedAt < end,
  );
  const reads = data.reads
    .filter(
      (r) => r.openedAt < end && (r.closedAt ?? r.lastCheckpointAt) >= start,
    )
    .map((r) => ({
      ...r,
      activeReadMs: duration(r.activeSegments, start, end),
    }));
  const ids = new Set([
    ...exposures.map((e) => e.externalTopicId),
    ...clicks.map((c) => c.externalTopicId),
    ...reads
      .filter((r) => r.entrySource === "list_click")
      .map((r) => r.externalTopicId),
  ]);
  const funnel: [number, number, number, number, number, number] = [
    0, 0, 0, 0, 0, 0,
  ];
  for (const id of ids) {
    const es = exposures.filter((e) => e.externalTopicId === id);
    const rs = reads.filter(
      (r) => r.externalTopicId === id && r.entrySource === "list_click",
    );
    const stage = Math.max(
      classify(es, rs, model),
      clicks.some((c) => c.externalTopicId === id) ? 3 : -1,
    );
    for (let n = 0; n <= stage; n++) funnel[n] = (funnel[n] ?? 0) + 1;
  }
  const outside = new Set(
    reads
      .filter(
        (r) => r.entrySource !== "list_click" && r.activeReadMs >= model.readMs,
      )
      .map((r) => r.externalTopicId),
  ).size;
  const readCount = new Set(
    reads
      .filter((r) => r.activeReadMs >= model.readMs)
      .map((r) => r.externalTopicId),
  ).size;
  const deepCount = new Set(
    reads
      .filter((r) => classify([], [r], model) === 5)
      .map((r) => r.externalTopicId),
  ).size;
  const sessions = data.sessions
    .map((s) => ({ ...s, periodMs: duration(s.activeSegments, start, end) }))
    .filter((s) => s.periodMs > 0)
    .sort((a, b) => a.startedAt - b.startedAt);
  const grouped = Map.groupBy(reads, (r) => r.externalTopicId);
  const top = Array.from(grouped, ([id, rs]) => ({
    id,
    title:
      data.topics.find((t) => t.externalTopicId === id)?.title ?? `Topic ${id}`,
    ms: rs.reduce((n, r) => n + r.activeReadMs, 0),
    visits: rs.length,
    depth: Math.max(
      ...rs.map((r) =>
        r.highestPostNumber
          ? Math.min(1, r.maxPostNumberSeen / r.highestPostNumber)
          : 0,
      ),
    ),
  })).sort((a, b) => b.ms - a.ms);
  return {
    funnel,
    outside,
    readCount,
    deepCount,
    sessions,
    top,
    activeMs: sessions.reduce((n, s) => n + s.periodMs, 0),
    exposureCount: exposures.length,
    clickCount: clicks.length,
  };
}
export function sevenDays(now: number) {
  const today = localDay(now);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() - 6 + i);
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    return { start: date.getTime(), end: next.getTime() };
  });
}
