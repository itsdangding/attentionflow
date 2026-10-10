import { describe, it, expect } from "vitest";
import { defaults, VERSION } from "../shared/config";
import { classify } from "../core/model";
import { newExposure, accumulate } from "../core/exposure";
import { pulse, type SessionState } from "../core/session";
import { summarize, sevenDays } from "../analytics/summary";
import { appendSegment, duration, localDay } from "../core/time";
import { topicId, detect } from "../adapters/linuxdo/parser";
import type { Read, Snapshot, Topic } from "../shared/types";
const topic: Topic = {
  site: "linuxdo",
  externalTopicId: 1,
  title: "Test",
  category: "",
  tags: [],
  author: "",
  highestPostNumber: 100,
  firstSeenAt: 0,
  lastSeenAt: 0,
};
function exposure(ms = 100) {
  const e = newExposure(topic, "latest", 0, "session", "page", 0, 0);
  accumulate(e, ms, 1, 1, 10, 0, false);
  e.leftAt = ms;
  return e;
}
function read(ms: number, source: Read["entrySource"] = "list_click"): Read {
  return {
    id: "read",
    site: "linuxdo",
    collectorVersion: VERSION,
    externalTopicId: 1,
    sessionId: "session",
    pageVisitId: "page",
    entrySource: source,
    clickId: null,
    visitIndex: 1,
    openedAt: 0,
    closedAt: ms,
    lastCheckpointAt: ms,
    activeReadMs: ms,
    maxPostNumberSeen: 70,
    highestPostNumber: 100,
    activeSegments: [{ start: 0, end: ms }],
  };
}
const snapshot = (): Snapshot => ({
  topics: [topic],
  exposures: [],
  reads: [],
  clicks: [],
  sessions: [],
  debugTraces: [],
});
describe("attention model", () => {
  it("keeps same-timestamp exposure samples finite before accumulating time", () => {
    const e = newExposure(topic, "latest", 0, "session", "page", 0, 0);
    accumulate(e, 0, 1, 1, 10, 0, false);
    expect(e.avgCoVisibleCount).toBe(0);
    expect(e.avgScrollVelocity).toBe(0);
    expect(e.maxAttentionZoneRatio).toBe(1);
    accumulate(e, 1000, 1, 1, 10, 0, false);
    expect(e.avgCoVisibleCount).toBe(10);
    expect(e.avgScrollVelocity).toBe(0);
    expect(classify([e], [])).toBe(1);
  });
  it("A: fast pass is not Seen", () => {
    for (const ms of [93, 116, 82, 144])
      expect(classify([exposure(ms)], [])).toBe(0);
  });
  it("B: one stationary second shared by ten rows does not make all Noticed", () => {
    const e = exposure(2000);
    expect(e.sharedAttentionMs).toBe(200);
    expect(classify([e], [])).toBe(1);
  });
  it("qualifies hovered titles", () => {
    const e = exposure(1000);
    e.hoverMs = 800;
    expect(classify([e], [])).toBe(2);
  });
  it("aggregates repeated exposure within the same session only", () => {
    const a = exposure(300),
      b = exposure(300);
    expect(classify([a, b], [])).toBe(1);
    b.sessionId = "other";
    expect(classify([a, b], [])).toBe(0);
  });
  it("does not count fast scrolling even with sufficient elapsed time", () => {
    const e = exposure(1000);
    e.avgScrollVelocity = 2;
    expect(classify([e], [])).toBe(0);
  });
  it("Read, Bounce and floor depth thresholds", () => {
    expect(classify([], [read(9999)])).toBe(-1);
    expect(classify([], [read(10000)])).toBe(4);
    expect(classify([], [read(90000)])).toBe(5);
    expect(classify([], [{ ...read(90000), maxPostNumberSeen: 69 }])).toBe(4);
    expect(classify([], [{ ...read(180000), highestPostNumber: 0 }])).toBe(5);
  });
  it("F: repeated exposures count one topic; high stages contain low stages", () => {
    const d = snapshot();
    d.exposures = [exposure(700), exposure(700)];
    d.reads = [read(10000)];
    expect(summarize(d, 0, 20000, defaults.model).funnel).toEqual([
      1, 1, 1, 1, 1, 0,
    ]);
  });
  it("external reads are outside the funnel", () => {
    const d = snapshot();
    d.reads = [read(20000, "external")];
    const s = summarize(d, 0, 30000, defaults.model);
    expect(s.outside).toBe(1);
    expect(s.readCount).toBe(1);
    expect(s.funnel).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
describe("sessions and time", () => {
  const state = (): SessionState => ({
    session: null,
    lastPulse: 0,
    lastActive: 0,
    owner: null,
    active: false,
  });
  it("D: inactive time is excluded and sessions restore from serialized state", () => {
    const s = state();
    pulse(s, 1, 1000, true, 180000);
    pulse(s, 1, 2000, true, 180000);
    pulse(s, 1, 2100, false, 180000);
    const restored = JSON.parse(JSON.stringify(s));
    pulse(restored, 1, 100000, true, 180000);
    expect(restored.session.id).toBe(s.session?.id);
    expect(restored.session.activeMs).toBe(1100);
  });
  it("timeout is strictly greater than three minutes", () => {
    const a = state();
    pulse(a, 1, 1000, true, 180000);
    const id = a.session?.id;
    pulse(a, 1, 181000, true, 180000);
    expect(a.session?.id).toBe(id);
    const b = state();
    pulse(b, 1, 1000, true, 180000);
    const old = b.session?.id;
    pulse(b, 1, 181001, true, 180000);
    expect(b.session?.id).not.toBe(old);
  });
  it("G: inactive background tabs cannot change the active owner", () => {
    const s = state();
    pulse(s, 1, 1000, true, 180000);
    pulse(s, 2, 1500, false, 180000);
    pulse(s, 1, 2000, true, 180000);
    expect(s.session?.activeMs).toBe(1000);
    expect(s.owner).toBe(1);
  });
  it("does not accrue huge intervals when a worker wakes up", () => {
    const s = state();
    pulse(s, 1, 1000, true, 180000);
    pulse(s, 1, 100000, true, 180000);
    expect(s.session?.activeMs).toBe(0);
  });
  it("splits active segments at midnight without splitting raw records", () => {
    const midnight = localDay(Date.now());
    const segments = [{ start: midnight - 1000, end: midnight + 2000 }];
    expect(duration(segments, midnight - 86400000, midnight)).toBe(1000);
    expect(duration(segments, midnight, midnight + 86400000)).toBe(2000);
  });
  it("merges contiguous intervals, preserves inactive gaps", () => {
    const segments: { start: number; end: number }[] = [];
    appendSegment(segments, 1, 2);
    appendSegment(segments, 2, 3);
    appendSegment(segments, 4, 5);
    expect(segments).toEqual([
      { start: 1, end: 3 },
      { start: 4, end: 5 },
    ]);
  });
  it("seven-day range ends at next local midnight", () => {
    const days = sevenDays(Date.now());
    expect(days).toHaveLength(7);
    expect(days[6]!.start).toBe(localDay(Date.now()));
    expect(new Date(days[6]!.end).getHours()).toBe(0);
  });
});
describe("Linux DO route adapter", () => {
  it("parses slug and slugless topic routes", () => {
    expect(topicId("/t/title/123/4")).toBe(123);
    expect(topicId("/t/123")).toBe(123);
    expect(topicId("/u/123")).toBeNull();
  });
  it("includes every P0 source and excludes private pages", () => {
    for (const p of [
      "/latest",
      "/new",
      "/unread",
      "/top",
      "/hot",
      "/c/a/1",
      "/tag/test",
      "/search",
    ])
      expect(detect(p).kind).toBe("list");
    for (const p of ["/u/name", "/notifications", "/my/messages"])
      expect(detect(p).kind).toBe("excluded");
    expect(detect("/t/test/42").source).toBe("suggested");
  });
});
