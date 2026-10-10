import { defaults, type Settings } from "../shared/config";
import type { Exposure, Read } from "../shared/types";
export const stages = [
  "Passed",
  "Seen",
  "Noticed",
  "Clicked",
  "Read",
  "Deep Read",
] as const;
export function classify(
  exposures: Exposure[],
  reads: Read[],
  m: Settings["model"] = defaults.model,
): number {
  let stage = exposures.length ? 0 : -1;
  const groups = Map.groupBy(exposures, (e) => e.sessionId);
  for (const es of groups.values()) {
    const sum = (
      key: "attentionZoneMs" | "sharedAttentionMs" | "scrollStopMs" | "hoverMs",
    ) => es.reduce((n, e) => n + e[key], 0);
    const zone = sum("attentionZoneMs");
    const weighted = (key: "avgScrollVelocity" | "avgCoVisibleCount") =>
      es.reduce((n, e) => n + e[key] * e.attentionZoneMs, 0) / (zone || 1);
    const seen =
      zone >= m.seenMs &&
      Math.max(...es.map((e) => e.maxAttentionZoneRatio)) >= m.zoneRatio &&
      weighted("avgScrollVelocity") < m.seenVelocity;
    if (seen) stage = Math.max(stage, 1);
    if (
      seen &&
      (sum("sharedAttentionMs") >= m.sharedMs ||
        es.some(
          (e) =>
            e.entryScrollVelocity >= m.decelerationEntry &&
            e.exitScrollVelocity <= m.decelerationExit,
        ) ||
        (sum("scrollStopMs") >= m.stopMs &&
          weighted("avgCoVisibleCount") <= m.stopCount) ||
        sum("hoverMs") >= m.hoverMs)
    )
      stage = Math.max(stage, 2);
  }
  if (exposures.some((e) => e.clicked)) stage = Math.max(stage, 3);
  for (const r of reads) {
    if (r.activeReadMs >= m.readMs) stage = Math.max(stage, 4);
    if (
      r.activeReadMs >= m.deepMs ||
      (r.activeReadMs >= m.deepDepthMs &&
        r.highestPostNumber > 0 &&
        r.maxPostNumberSeen / r.highestPostNumber >= m.deepRatio)
    )
      stage = 5;
  }
  return stage;
}
