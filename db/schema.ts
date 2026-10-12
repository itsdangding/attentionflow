import Dexie, { type Table } from "dexie";
import type {
  Topic,
  Exposure,
  Click,
  Read,
  Session,
  Trace,
} from "../shared/types";
export class AttentionDB extends Dexie {
  topics!: Table<Topic, [string, number]>;
  exposures!: Table<Exposure, string>;
  clicks!: Table<Click, string>;
  reads!: Table<Read, string>;
  sessions!: Table<Session, string>;
  debugTraces!: Table<Trace, string>;
  constructor(name = "attentionflow") {
    super(name);
    this.version(1).stores({
      topics: "[site+externalTopicId],lastSeenAt",
      exposures: "id,sessionId,enteredAt,[site+externalTopicId]",
      clicks: "id,clickedAt,[site+externalTopicId]",
      reads: "id,openedAt,[site+externalTopicId]",
      sessions: "id,startedAt",
      debugTraces: "id,timestamp",
    });
    this.version(2).stores({
      exposures: "id,sessionId,enteredAt,leftAt,[site+externalTopicId]",
      reads: "id,openedAt,lastCheckpointAt,[site+externalTopicId]",
      sessions: "id,startedAt,endedAt",
    });
  }
}
export const db = new AttentionDB();
