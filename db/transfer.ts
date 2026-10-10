import { z } from "zod";
import { VERSION, SCHEMA_VERSION } from "../shared/config";
import type { AttentionDB } from "./schema";
const time = z.number().finite().nonnegative(),
  ratio = z.number().min(0).max(1),
  id = z.string().uuid();
const base = {
  id,
  site: z.literal("linuxdo"),
  collectorVersion: z.string().min(1),
};
const ref = {
  ...base,
  externalTopicId: z.number().int().positive(),
  sessionId: id,
  pageVisitId: id,
};
const segment = z
  .object({ start: time, end: time })
  .refine((s) => s.end >= s.start);
const candidate = z.object({
  externalTopicId: z.number().int().positive(),
  listPosition: time,
  visibilityRatio: ratio,
  attentionZoneRatio: ratio,
});
const source = z.enum([
  "latest",
  "new",
  "unread",
  "top",
  "hot",
  "category",
  "tag",
  "search",
  "suggested",
]);
export const schemas = {
  topics: z.object({
    site: z.literal("linuxdo"),
    externalTopicId: z.number().int().positive(),
    title: z.string(),
    category: z.string(),
    tags: z.array(z.string()),
    author: z.string(),
    highestPostNumber: time,
    firstSeenAt: time,
    lastSeenAt: time,
  }),
  exposures: z.object({
    ...ref,
    listSource: source,
    listPosition: time,
    enteredAt: time,
    leftAt: time,
    viewportMs: time,
    attentionZoneMs: time,
    sharedAttentionMs: time,
    maxVisibilityRatio: ratio,
    maxAttentionZoneRatio: ratio,
    avgCoVisibleCount: time,
    avgScrollVelocity: time,
    maxScrollVelocity: time,
    minScrollVelocity: time,
    entryScrollVelocity: time,
    exitScrollVelocity: time,
    scrollStopMs: time,
    hoverMs: time,
    clicked: z.boolean(),
    clickId: id.nullable(),
  }),
  clicks: z.object({
    ...ref,
    clickedAt: time,
    listSource: source,
    listPosition: time,
    openMode: z.enum(["same_tab", "new_tab"]),
    candidates: z.array(candidate),
    targetUrl: z.string().url(),
    sourceTabId: z.number().int().nonnegative().optional(),
  }),
  reads: z.object({
    ...ref,
    entrySource: z.enum([
      "list_click",
      "notification",
      "search",
      "external",
      "direct",
    ]),
    clickId: id.nullable(),
    visitIndex: z.number().int().positive(),
    openedAt: time,
    closedAt: time.nullable(),
    lastCheckpointAt: time,
    activeReadMs: time,
    maxPostNumberSeen: time,
    highestPostNumber: time,
    activeSegments: z.array(segment),
  }),
  sessions: z.object({
    ...base,
    startedAt: time,
    endedAt: time,
    activeMs: time,
    activeSegments: z.array(segment),
  }),
  debugTraces: z.object({
    ...base,
    timestamp: time,
    scrollY: z.number().finite(),
    viewportHeight: time,
    visibleTopics: z.array(candidate),
    pageVisible: z.boolean(),
    hasFocus: z.boolean(),
  }),
};
export const exportSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  collectorVersion: z.string(),
  exportedAt: time,
  ...Object.fromEntries(
    Object.entries(schemas).map(([k, s]) => [k, z.array(s)]),
  ),
});
export async function exportData(database: AttentionDB) {
  const data: Record<string, unknown> = {
    schemaVersion: SCHEMA_VERSION,
    collectorVersion: VERSION,
    exportedAt: Date.now(),
  };
  for (const key of Object.keys(schemas))
    data[key] = await database.table(key).toArray();
  return data;
}
export async function importData(database: AttentionDB, input: unknown) {
  const data = exportSchema.parse(input) as Record<string, unknown>;
  let added = 0;
  await database.transaction("rw", database.tables, async () => {
    for (const key of Object.keys(schemas))
      for (const item of data[key] as Array<Record<string, unknown>>) {
        const primary =
          key === "topics"
            ? [String(item.site), Number(item.externalTopicId)]
            : String(item.id);
        if (!(await database.table(key).get(primary))) {
          await database.table(key).add(item);
          added++;
        }
      }
  });
  return added;
}
