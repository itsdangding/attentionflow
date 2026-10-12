import type { AttentionDB } from "./schema";
import type { Snapshot } from "../shared/types";
export const DEBUG_RETENTION_MS = 7 * 86400000;
// 读取与 [start, end) 有交集的记录；索引只按结束时间收窄，开始时间在内存中过滤。
export async function loadRange(
  database: AttentionDB,
  start: number,
  end: number,
): Promise<Snapshot> {
  return database.transaction(
    "r",
    [
      database.topics,
      database.exposures,
      database.clicks,
      database.reads,
      database.sessions,
    ],
    async () => {
      const [exposures, clicks, reads, sessions] = await Promise.all([
        database.exposures
          .where("leftAt")
          .aboveOrEqual(start)
          .filter((e) => e.enteredAt < end)
          .toArray(),
        database.clicks
          .where("clickedAt")
          .between(start, end, true, false)
          .toArray(),
        database.reads
          .where("lastCheckpointAt")
          .aboveOrEqual(start)
          .filter(
            (r) =>
              r.openedAt < end && (r.closedAt ?? r.lastCheckpointAt) >= start,
          )
          .toArray(),
        database.sessions
          .where("endedAt")
          .aboveOrEqual(start)
          .filter((s) => s.startedAt < end)
          .toArray(),
      ]);
      const keys = new Map<string, [string, number]>();
      for (const r of [...exposures, ...clicks, ...reads])
        keys.set(`${r.site}:${r.externalTopicId}`, [
          r.site,
          r.externalTopicId,
        ]);
      const topics = (await database.topics.bulkGet([...keys.values()])).filter(
        (t) => t !== undefined,
      );
      return { topics, exposures, clicks, reads, sessions, debugTraces: [] };
    },
  );
}
// 阅读记录体积小，历史页按最近一次阅读时间查询，不加载曝光。
export async function loadHistory(database: AttentionDB, since: number) {
  return database.transaction(
    "r",
    [database.topics, database.reads],
    async () => {
      const reads = await database.reads
        .where("lastCheckpointAt")
        .aboveOrEqual(since)
        .toArray();
      const keys = new Map<string, [string, number]>();
      for (const r of reads)
        keys.set(`${r.site}:${r.externalTopicId}`, [r.site, r.externalTopicId]);
      const topics = (await database.topics.bulkGet([...keys.values()])).filter(
        (t) => t !== undefined,
      );
      return { reads, topics };
    },
  );
}
export async function pruneDebugTraces(database: AttentionDB, now: number) {
  return database.debugTraces
    .where("timestamp")
    .below(now - DEBUG_RETENTION_MS)
    .delete();
}
export async function storageStats(database: AttentionDB) {
  const counts: Record<string, number> = {};
  for (const table of database.tables) counts[table.name] = await table.count();
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  return { counts, usage: estimate?.usage ?? null };
}
