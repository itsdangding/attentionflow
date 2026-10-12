import type { Read, Topic } from "../shared/types";
import type { Settings } from "../shared/config";
import { classify } from "../core/model";
import { localDay } from "../core/time";
export interface HistoryEntry {
  id: number;
  title: string;
  category: string;
  tags: string[];
  ms: number;
  visits: number;
  lastReadAt: number;
  maxPostNumberSeen: number;
  highestPostNumber: number;
  depth: number | null;
  sources: Read["entrySource"][];
  read: boolean;
  deep: boolean;
}
export interface HistoryFilter {
  query: string;
  category: string;
  tag: string;
  includeShort: boolean;
}
export function historyEntries(
  reads: Read[],
  topics: Topic[],
  model: Settings["model"],
): HistoryEntry[] {
  const meta = new Map(topics.map((t) => [t.externalTopicId, t]));
  return Array.from(Map.groupBy(reads, (r) => r.externalTopicId), ([id, rs]) => {
    const topic = meta.get(id);
    const highest = Math.max(
      topic?.highestPostNumber ?? 0,
      ...rs.map((r) => r.highestPostNumber),
    );
    const seen = Math.max(...rs.map((r) => r.maxPostNumberSeen));
    const ms = rs.reduce((n, r) => n + r.activeReadMs, 0);
    return {
      id,
      title: topic?.title || `Topic ${id}`,
      category: topic?.category ?? "",
      tags: topic?.tags ?? [],
      ms,
      visits: new Set(rs.map((r) => r.visitIndex)).size,
      lastReadAt: Math.max(...rs.map((r) => r.closedAt ?? r.lastCheckpointAt)),
      maxPostNumberSeen: seen,
      highestPostNumber: highest,
      depth: highest > 0 ? Math.min(1, seen / highest) : null,
      sources: [...new Set(rs.map((r) => r.entrySource))],
      read: ms >= model.readMs,
      deep: classify([], rs.map((r) => ({ ...r, highestPostNumber: Math.max(r.highestPostNumber, highest) })), model) === 5,
    };
  }).sort((a, b) => b.lastReadAt - a.lastReadAt);
}
export function filterHistory(entries: HistoryEntry[], f: HistoryFilter) {
  const query = f.query.trim().toLowerCase();
  return entries.filter(
    (e) =>
      (f.includeShort || e.read) &&
      (!f.category || e.category === f.category) &&
      (!f.tag || e.tags.includes(f.tag)) &&
      (!query ||
        e.title.toLowerCase().includes(query) ||
        String(e.id) === query),
  );
}
export function groupByDay(entries: HistoryEntry[]) {
  return Array.from(Map.groupBy(entries, (e) => localDay(e.lastReadAt)));
}
