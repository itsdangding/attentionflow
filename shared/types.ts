import type { Settings } from "./config";
export type Source =
  | "latest"
  | "new"
  | "unread"
  | "top"
  | "hot"
  | "category"
  | "tag"
  | "search"
  | "suggested";
export interface Topic {
  site: string;
  externalTopicId: number;
  title: string;
  category: string;
  tags: string[];
  author: string;
  highestPostNumber: number;
  firstSeenAt: number;
  lastSeenAt: number;
}
export interface Base {
  id: string;
  site: string;
  collectorVersion: string;
}
export interface Exposure extends Base {
  externalTopicId: number;
  sessionId: string;
  pageVisitId: string;
  listSource: Source;
  listPosition: number;
  enteredAt: number;
  leftAt: number;
  viewportMs: number;
  attentionZoneMs: number;
  sharedAttentionMs: number;
  maxVisibilityRatio: number;
  maxAttentionZoneRatio: number;
  avgCoVisibleCount: number;
  avgScrollVelocity: number;
  maxScrollVelocity: number;
  minScrollVelocity: number;
  entryScrollVelocity: number;
  exitScrollVelocity: number;
  scrollStopMs: number;
  hoverMs: number;
  clicked: boolean;
  clickId: string | null;
}
export interface Candidate {
  externalTopicId: number;
  listPosition: number;
  visibilityRatio: number;
  attentionZoneRatio: number;
}
export interface Click extends Base {
  externalTopicId: number;
  sessionId: string;
  pageVisitId: string;
  clickedAt: number;
  listSource: Source;
  listPosition: number;
  openMode: "same_tab" | "new_tab";
  candidates: Candidate[];
  targetUrl: string;
  sourceTabId?: number;
}
export interface Segment {
  start: number;
  end: number;
}
export interface Read extends Base {
  externalTopicId: number;
  sessionId: string;
  pageVisitId: string;
  entrySource: "list_click" | "notification" | "search" | "external" | "direct";
  clickId: string | null;
  visitIndex: number;
  openedAt: number;
  closedAt: number | null;
  lastCheckpointAt: number;
  activeReadMs: number;
  maxPostNumberSeen: number;
  highestPostNumber: number;
  activeSegments: Segment[];
}
export interface Session extends Base {
  startedAt: number;
  endedAt: number;
  activeMs: number;
  activeSegments: Segment[];
}
export interface Trace extends Base {
  timestamp: number;
  scrollY: number;
  viewportHeight: number;
  visibleTopics: Candidate[];
  pageVisible: boolean;
  hasFocus: boolean;
}
export interface Batch {
  topics: Topic[];
  exposures: Exposure[];
  clicks: Click[];
  reads: Read[];
  debugTraces: Trace[];
}
export interface Snapshot extends Batch {
  sessions: Session[];
}
export type Request =
  | { type: "settings" }
  | {
      type: "notificationEntry";
      topicId: number;
      openMode: "same_tab" | "new_tab";
    }
  | { type: "configure"; settings: Settings }
  | { type: "pulse"; at: number; active: boolean; lastActivity: number }
  | {
      type: "visit";
      topicId: number;
      url: string;
      pageVisitId: string;
      referrer: string;
    }
  | { type: "batch"; batch: Batch }
  | { type: "export" }
  | { type: "import"; data: unknown }
  | { type: "delete" }
  | { type: "clearDebug" };
