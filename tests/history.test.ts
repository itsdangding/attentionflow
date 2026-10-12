import { describe, it, expect } from "vitest";
import { historyEntries, filterHistory, groupByDay } from "../analytics/history";
import { defaults, VERSION } from "../shared/config";
import type { Read, Topic } from "../shared/types";
const day = new Date(2026, 9, 12, 10).getTime();
const read = (topic: number, at: number, ms: number, extra: Partial<Read> = {}): Read => ({
  id: crypto.randomUUID(),
  site: "linuxdo",
  collectorVersion: VERSION,
  externalTopicId: topic,
  sessionId: crypto.randomUUID(),
  pageVisitId: crypto.randomUUID(),
  entrySource: "list_click",
  clickId: null,
  visitIndex: 1,
  openedAt: at,
  closedAt: at + ms,
  lastCheckpointAt: at + ms,
  activeReadMs: ms,
  maxPostNumberSeen: 1,
  highestPostNumber: 0,
  activeSegments: [{ start: at, end: at + ms }],
  ...extra,
});
const topic = (id: number, extra: Partial<Topic> = {}): Topic => ({
  site: "linuxdo",
  externalTopicId: id,
  title: `Topic title ${id}`,
  category: "",
  tags: [],
  author: "",
  highestPostNumber: 0,
  firstSeenAt: 0,
  lastSeenAt: 0,
  ...extra,
});
describe("reading history", () => {
  it("aggregates visits per topic and orders by most recent reading", () => {
    const entries = historyEntries(
      [
        read(1, day, 60000, { maxPostNumberSeen: 4 }),
        read(1, day + 3600000, 30000, { visitIndex: 2, maxPostNumberSeen: 9, entrySource: "direct" }),
        // 同一次访问跨 Session 续读产生的第二条记录不增加访问次数。
        read(1, day + 7200000, 5000, { visitIndex: 2 }),
        read(2, day + 1000, 5000),
      ],
      [topic(1, { highestPostNumber: 12, category: "开发调优", tags: ["AI"] }), topic(2)],
      defaults.model,
    );
    expect(entries.map((e) => e.id)).toEqual([1, 2]);
    expect(entries[0]).toMatchObject({
      ms: 95000,
      visits: 2,
      maxPostNumberSeen: 9,
      highestPostNumber: 12,
      depth: 0.75,
      sources: ["list_click", "direct"],
      read: true,
      // Deep Read 按单次访问判定，与 Dashboard 口径一致。
      deep: false,
    });
    expect(entries[1]).toMatchObject({ read: false, depth: null, deep: false });
    const deep = historyEntries(
      [read(3, day, 100000, { maxPostNumberSeen: 9 })],
      [topic(3, { highestPostNumber: 12 })],
      defaults.model,
    );
    expect(deep[0]!.deep).toBe(true);
  });
  it("filters by title, category, tag and short visits", () => {
    const entries = historyEntries(
      [read(1, day, 20000), read(2, day, 20000), read(3, day, 2000)],
      [
        topic(1, { title: "Claude Code 技巧", category: "开发调优", tags: ["AI"] }),
        topic(2, { title: "公益站", category: "资源荟萃" }),
        topic(3),
      ],
      defaults.model,
    );
    const base = { query: "", category: "", tag: "", includeShort: false };
    expect(filterHistory(entries, base).map((e) => e.id).sort()).toEqual([1, 2]);
    expect(filterHistory(entries, { ...base, includeShort: true })).toHaveLength(3);
    expect(filterHistory(entries, { ...base, query: "claude" }).map((e) => e.id)).toEqual([1]);
    expect(filterHistory(entries, { ...base, query: "2" }).map((e) => e.id)).toEqual([2]);
    expect(filterHistory(entries, { ...base, category: "资源荟萃" }).map((e) => e.id)).toEqual([2]);
    expect(filterHistory(entries, { ...base, tag: "AI" }).map((e) => e.id)).toEqual([1]);
  });
  it("groups entries by local day of the last reading", () => {
    const entries = historyEntries(
      [read(1, day, 20000), read(2, day - 86400000, 20000)],
      [topic(1), topic(2)],
      defaults.model,
    );
    expect(groupByDay(entries).map(([, items]) => items.map((e) => e.id))).toEqual([[1], [2]]);
  });
});
