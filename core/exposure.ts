import { VERSION, defaults, type Settings } from "../shared/config";
import type { Exposure, Topic, Source } from "../shared/types";
export function newExposure(
  topic: Topic,
  source: Source,
  position: number,
  sessionId: string,
  pageVisitId: string,
  at: number,
  velocity: number,
): Exposure {
  return {
    id: crypto.randomUUID(),
    site: topic.site,
    externalTopicId: topic.externalTopicId,
    collectorVersion: VERSION,
    sessionId,
    pageVisitId,
    listSource: source,
    listPosition: position,
    enteredAt: at,
    leftAt: at,
    viewportMs: 0,
    attentionZoneMs: 0,
    sharedAttentionMs: 0,
    maxVisibilityRatio: 0,
    maxAttentionZoneRatio: 0,
    avgCoVisibleCount: 0,
    avgScrollVelocity: 0,
    maxScrollVelocity: 0,
    minScrollVelocity: velocity,
    entryScrollVelocity: velocity,
    exitScrollVelocity: velocity,
    scrollStopMs: 0,
    hoverMs: 0,
    clicked: false,
    clickId: null,
  };
}
export function accumulate(
  e: Exposure,
  dt: number,
  visibility: number,
  zone: number,
  count: number,
  velocity: number,
  hover: boolean,
  m: Settings["model"] = defaults.model,
) {
  e.viewportMs += dt;
  e.maxVisibilityRatio = Math.max(e.maxVisibilityRatio, visibility);
  e.maxAttentionZoneRatio = Math.max(e.maxAttentionZoneRatio, zone);
  e.exitScrollVelocity = velocity;
  if (zone > 0 && dt > 0) {
    const old = e.attentionZoneMs;
    e.attentionZoneMs += dt;
    e.avgCoVisibleCount =
      (e.avgCoVisibleCount * old + count * dt) / e.attentionZoneMs;
    e.avgScrollVelocity =
      (e.avgScrollVelocity * old + velocity * dt) / e.attentionZoneMs;
    e.sharedAttentionMs += dt / Math.max(1, count);
    if (velocity < m.scrollStopVelocity) e.scrollStopMs += dt;
    e.maxScrollVelocity = Math.max(e.maxScrollVelocity, velocity);
    e.minScrollVelocity = Math.min(e.minScrollVelocity, velocity);
  }
  if (hover) e.hoverMs += dt;
}
