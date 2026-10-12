import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, it, expect } from "vitest";
import { AttentionDB } from "../db/schema";
import { loadRange, pruneDebugTraces, DEBUG_RETENTION_MS } from "../db/query";
import { VERSION } from "../shared/config";
import type { Exposure, Read, Session } from "../shared/types";
const base = () => ({
  id: crypto.randomUUID(),
  site: "linuxdo",
  collectorVersion: VERSION,
});
const exposure = (topic: number, enteredAt: number, leftAt: number) =>
  ({
    ...base(),
    externalTopicId: topic,
    sessionId: crypto.randomUUID(),
    pageVisitId: crypto.randomUUID(),
    listSource: "latest",
    listPosition: 0,
    enteredAt,
    leftAt,
    viewportMs: leftAt - enteredAt,
    attentionZoneMs: 0,
    sharedAttentionMs: 0,
    maxVisibilityRatio: 1,
    maxAttentionZoneRatio: 1,
    avgCoVisibleCount: 1,
    avgScrollVelocity: 0,
    maxScrollVelocity: 0,
    minScrollVelocity: 0,
    entryScrollVelocity: 0,
    exitScrollVelocity: 0,
    scrollStopMs: 0,
    hoverMs: 0,
    clicked: false,
    clickId: null,
  }) as Exposure;
const read = (topic: number, openedAt: number, end: number, closed = true) =>
  ({
    ...base(),
    externalTopicId: topic,
    sessionId: crypto.randomUUID(),
    pageVisitId: crypto.randomUUID(),
    entrySource: "direct",
    clickId: null,
    visitIndex: 1,
    openedAt,
    closedAt: closed ? end : null,
    lastCheckpointAt: end,
    activeReadMs: end - openedAt,
    maxPostNumberSeen: 1,
    highestPostNumber: 1,
    activeSegments: [{ start: openedAt, end }],
  }) as Read;
const session = (startedAt: number, endedAt: number) =>
  ({
    ...base(),
    startedAt,
    endedAt,
    activeMs: endedAt - startedAt,
    activeSegments: [{ start: startedAt, end: endedAt }],
  }) as Session;
const topic = (id: number) => ({
  site: "linuxdo",
  externalTopicId: id,
  title: `t${id}`,
  category: "",
  tags: [],
  author: "",
  highestPostNumber: 1,
  firstSeenAt: 0,
  lastSeenAt: 0,
});
describe("range query", () => {
  it("returns records overlapping the range, including ones that started before it", async () => {
    const db = new AttentionDB(crypto.randomUUID());
    await db.exposures.bulkAdd([
      exposure(1, 50, 150),
      exposure(2, 120, 130),
      exposure(3, 10, 99),
      exposure(4, 200, 210),
    ]);
    await db.reads.bulkAdd([
      read(5, 0, 100),
      read(6, 190, 250, false),
      read(7, 0, 99),
    ]);
    await db.sessions.bulkAdd([
      session(0, 100),
      session(50, 99),
      session(200, 300),
    ]);
    await db.topics.bulkAdd([1, 2, 3, 4, 5, 6, 7].map(topic));
    const data = await loadRange(db, 100, 200);
    expect(data.exposures.map((e) => e.externalTopicId).sort()).toEqual([1, 2]);
    expect(data.reads.map((r) => r.externalTopicId).sort()).toEqual([5, 6]);
    expect(data.sessions.map((s) => s.startedAt)).toEqual([0]);
    expect(data.topics.map((t) => t.externalTopicId).sort()).toEqual([
      1, 2, 5, 6,
    ]);
    expect(data.debugTraces).toEqual([]);
    await db.delete();
  });
  it("upgrades a version 1 database and keeps existing records queryable", async () => {
    const name = crypto.randomUUID();
    const v1 = new Dexie(name);
    v1.version(1).stores({
      topics: "[site+externalTopicId],lastSeenAt",
      exposures: "id,sessionId,enteredAt,[site+externalTopicId]",
      clicks: "id,clickedAt,[site+externalTopicId]",
      reads: "id,openedAt,[site+externalTopicId]",
      sessions: "id,startedAt",
      debugTraces: "id,timestamp",
    });
    await v1.table("exposures").add(exposure(1, 100, 150));
    await v1.table("reads").add(read(1, 100, 150));
    await v1.table("sessions").add(session(100, 150));
    v1.close();
    const db = new AttentionDB(name);
    const data = await loadRange(db, 120, 200);
    expect(data.exposures).toHaveLength(1);
    expect(data.reads).toHaveLength(1);
    expect(data.sessions).toHaveLength(1);
    await db.delete();
  });
  it("prunes only debug traces older than the retention window", async () => {
    const db = new AttentionDB(crypto.randomUUID());
    const now = DEBUG_RETENTION_MS * 2;
    const trace = (timestamp: number) => ({
      ...base(),
      timestamp,
      scrollY: 0,
      viewportHeight: 800,
      visibleTopics: [],
      pageVisible: true,
      hasFocus: true,
    });
    await db.debugTraces.bulkAdd([
      trace(now - DEBUG_RETENTION_MS - 1),
      trace(now - DEBUG_RETENTION_MS + 1),
    ]);
    await db.exposures.add(exposure(1, 0, 1));
    expect(await pruneDebugTraces(db, now)).toBe(1);
    expect(await db.debugTraces.count()).toBe(1);
    expect(await db.exposures.count()).toBe(1);
    await db.delete();
  });
});
