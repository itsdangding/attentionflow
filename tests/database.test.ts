import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { AttentionDB } from "../db/schema";
import { exportData, importData } from "../db/transfer";
import { VERSION } from "../shared/config";
describe("data transfer", () => {
  it("exports versions and merges by compound primary key without replacing existing data", async () => {
    const db = new AttentionDB(crypto.randomUUID());
    const topic = {
      site: "linuxdo",
      externalTopicId: 1,
      title: "original",
      category: "",
      tags: [],
      author: "",
      highestPostNumber: 1,
      firstSeenAt: 1,
      lastSeenAt: 2,
    };
    await db.topics.add(topic);
    const backup = await exportData(db);
    expect(backup.schemaVersion).toBe(1);
    expect(backup.collectorVersion).toBe(VERSION);
    const copy = structuredClone(backup) as any;
    copy.topics[0].title = "replacement";
    copy.topics.push({ ...topic, externalTopicId: 2 });
    expect(await importData(db, copy)).toBe(1);
    expect((await db.topics.get(["linuxdo", 1]))?.title).toBe("original");
    expect(await importData(db, copy)).toBe(0);
    await db.delete();
  });
  it("rejects incompatible schema or malformed records before any write", async () => {
    const db = new AttentionDB(crypto.randomUUID());
    const backup = await exportData(db);
    await expect(
      importData(db, { ...backup, schemaVersion: 2 }),
    ).rejects.toThrow();
    await expect(
      importData(db, { ...backup, topics: [{ externalTopicId: 4 }] }),
    ).rejects.toThrow();
    expect(await db.topics.count()).toBe(0);
    await db.delete();
  });
});
