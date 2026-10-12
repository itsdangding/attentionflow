import { settingsSchema } from "../shared/settings";
import { db } from "../db/schema";
import { exportData, importData, schemas } from "../db/transfer";
import {
  loadHistory,
  loadRange,
  pruneDebugTraces,
  storageStats,
} from "../db/query";
import { defaults, type Settings } from "../shared/config";
import type { Request, Batch } from "../shared/types";
import { pulse, type SessionState } from "../core/session";
export default defineBackground(() => {
  let queue = Promise.resolve();
  const settings = async (): Promise<Settings> =>
    settingsSchema.parse(
      (await browser.storage.local.get("settings")).settings ??
        structuredClone(defaults),
    );
  async function broadcast() {
    const tabs = await browser.tabs.query({ url: "https://linux.do/*" });
    await Promise.allSettled(
      tabs.map((t) =>
        t.id === undefined
          ? Promise.resolve()
          : browser.tabs.sendMessage(t.id, { type: "reset" }),
      ),
    );
  }
  async function persist(
    batch: Batch,
    tabId: number | undefined,
    debug: boolean,
  ) {
    await db.transaction(
      "rw",
      db.topics,
      db.exposures,
      db.clicks,
      db.reads,
      db.debugTraces,
      async () => {
        for (const t of batch.topics) {
          const topic = schemas.topics.parse(t);
          const prev = await db.topics.get([topic.site, topic.externalTopicId]);
          await db.topics.put({
            ...topic,
            title: topic.title || prev?.title || "",
            category: topic.category || prev?.category || "",
            tags: topic.tags.length ? topic.tags : (prev?.tags ?? []),
            author: topic.author || prev?.author || "",
            firstSeenAt: prev?.firstSeenAt ?? topic.firstSeenAt,
            highestPostNumber: Math.max(
              prev?.highestPostNumber ?? 0,
              topic.highestPostNumber,
            ),
          });
        }
        for (const key of [
          "exposures",
          "clicks",
          "reads",
          "debugTraces",
        ] as const) {
          if (key === "debugTraces" && !debug) continue;
          for (const record of batch[key])
            await db
              .table(key)
              .put(
                schemas[key].parse(
                  key === "clicks" ? { ...record, sourceTabId: tabId } : record,
                ),
              );
        }
      },
    );
  }
  async function handle(
    msg: Request,
    sender: { tab?: { id?: number }; url?: string },
  ) {
    const fromSite = sender.url?.startsWith("https://linux.do/");
    const privileged = sender.url?.startsWith(browser.runtime.getURL("/"));
    if (!fromSite && !privileged) throw Error("Unauthorized sender");
    const config = await settings();
    if (msg.type === "settings") return config;
    if (msg.type === "pulse") {
      if (!fromSite || !config.tracking) return { sessionId: null };
      const at = Date.now();
      const tab = sender.tab?.id;
      if (tab === undefined) return { sessionId: null };
      const current = await browser.tabs.get(tab);
      const win = await browser.windows.get(current.windowId);
      const active =
        msg.active &&
        current.active &&
        win.focused &&
        at - msg.lastActivity < config.model.readIdleMs;
      const saved = await browser.storage.session.get("sessionState");
      const state: SessionState = (saved.sessionState as
        | SessionState
        | undefined) ?? {
        session: null,
        lastPulse: at,
        lastActive: 0,
        owner: null,
        active: false,
      };
      const previous = state.session;
      if (
        state.owner === tab &&
        at - msg.lastActivity >= config.model.readIdleMs
      )
        state.lastActive = Math.min(state.lastActive, msg.lastActivity);
      if (
        active &&
        previous &&
        at - state.lastActive > config.model.sessionTimeoutMs
      )
        await db.sessions.put(previous);
      pulse(state, tab, at, active, config.model.sessionTimeoutMs);
      if (state.session) await db.sessions.put(state.session);
      await browser.storage.session.set({ sessionState: state });
      return { sessionId: active ? state.session?.id : null };
    }
    if (msg.type === "batch") {
      if (!fromSite || !config.tracking) return;
      await persist(msg.batch, sender.tab?.id, config.debug);
      if (config.debug && msg.batch.debugTraces.length)
        await pruneDebugTraces(db, Date.now());
      return;
    }
    if (msg.type === "notificationEntry") {
      if (!fromSite || !config.tracking || sender.tab?.id === undefined) return;
      const stored = await browser.storage.session.get("notificationEntries");
      const entries =
        (stored.notificationEntries as
          | Array<{
              topicId: number;
              sourceTabId: number;
              openMode: string;
              at: number;
            }>
          | undefined) ?? [];
      entries.push({
        topicId: msg.topicId,
        sourceTabId: sender.tab.id,
        openMode: msg.openMode,
        at: Date.now(),
      });
      await browser.storage.session.set({
        notificationEntries: entries.filter(
          (e) => Date.now() - e.at < 86400000,
        ),
      });
      return;
    }
    if (msg.type === "visit") {
      if (!fromSite || !config.tracking) return null;
      const stored = await browser.storage.session.get("clickClaims");
      const claims: Record<string, boolean> =
        (stored.clickClaims as Record<string, boolean> | undefined) ?? {};
      const candidates = await db.clicks
        .where("[site+externalTopicId]")
        .equals(["linuxdo", msg.topicId])
        .sortBy("clickedAt");
      const tab =
        sender.tab?.id === undefined
          ? null
          : await browser.tabs.get(sender.tab.id);
      const click = candidates
        .reverse()
        .find(
          (c) =>
            !claims[c.id] &&
            (c.openMode === "new_tab"
              ? c.sourceTabId === tab?.openerTabId &&
                Date.now() - c.clickedAt < 86400000
              : c.sourceTabId === tab?.id &&
                Date.now() - c.clickedAt < 180000) &&
            c.pageVisitId !== msg.pageVisitId,
        );
      if (click) {
        claims[click.id] = true;
        await browser.storage.session.set({ clickClaims: claims });
      }
      const notifications = await browser.storage.session.get(
        "notificationEntries",
      );
      const entries =
        (notifications.notificationEntries as
          | Array<{
              topicId: number;
              sourceTabId: number;
              openMode: string;
              at: number;
            }>
          | undefined) ?? [];
      const entryIndex = entries.findLastIndex(
        (e) =>
          e.topicId === msg.topicId &&
          (e.openMode === "new_tab"
            ? e.sourceTabId === tab?.openerTabId && Date.now() - e.at < 86400000
            : e.sourceTabId === tab?.id && Date.now() - e.at < 180000),
      );
      const fromNotification = entryIndex >= 0;
      if (fromNotification) {
        entries.splice(entryIndex, 1);
        await browser.storage.session.set({ notificationEntries: entries });
      }
      const previousVisits = await db.reads
        .where("[site+externalTopicId]")
        .equals(["linuxdo", msg.topicId])
        .toArray();
      const samePage = previousVisits.find(
        (r) => r.pageVisitId === msg.pageVisitId,
      );
      return {
        clickId: samePage?.clickId ?? click?.id ?? null,
        entrySource:
          samePage?.entrySource ??
          (click
            ? "list_click"
            : fromNotification || msg.referrer.includes("/notifications")
              ? "notification"
              : msg.referrer.includes("/search")
                ? "search"
                : msg.referrer && !msg.referrer.startsWith("https://linux.do")
                  ? "external"
                  : "direct"),
        visitIndex:
          samePage?.visitIndex ??
          1 + Math.max(0, ...previousVisits.map((r) => r.visitIndex)),
      };
    }
    if (!privileged) throw Error("Dashboard only");
    if (msg.type === "configure") {
      const next = settingsSchema.parse(msg.settings);
      const tabs = await browser.tabs.query({ url: "https://linux.do/*" });
      const drained = await Promise.allSettled(
        tabs.map(async (tab) => {
          if (tab.id === undefined) return;
          const reply = await browser.tabs.sendMessage(tab.id, {
            type: "drain",
          });
          if (reply?.batch) await persist(reply.batch, tab.id, config.debug);
        }),
      );
      if (drained.some((result) => result.status === "rejected"))
        console.warn(
          "[AttentionFlow] Some tabs could not flush before settings changed",
        );
      const restored = await browser.storage.session.get("sessionState");
      const currentState = restored.sessionState as SessionState | undefined;
      if (currentState?.session && currentState.owner !== null) {
        pulse(
          currentState,
          currentState.owner,
          Date.now(),
          false,
          config.model.sessionTimeoutMs,
        );
        await db.sessions.put(currentState.session);
        await browser.storage.session.set({ sessionState: currentState });
      }
      await browser.storage.local.set({ settings: next });
      await Promise.allSettled(
        tabs.map((tab) =>
          tab.id === undefined
            ? Promise.resolve()
            : browser.tabs.sendMessage(tab.id, {
                type: "settingsChanged",
                settings: next,
              }),
        ),
      );
      return;
    }
    if (msg.type === "export") return exportData(db);
    if (msg.type === "range") {
      if (
        !Number.isFinite(msg.start) ||
        !Number.isFinite(msg.end) ||
        msg.end < msg.start
      )
        throw Error("Invalid range");
      await pruneDebugTraces(db, Date.now());
      return loadRange(db, msg.start, msg.end);
    }
    if (msg.type === "stats") return storageStats(db);
    if (msg.type === "history") {
      if (!Number.isFinite(msg.since)) throw Error("Invalid range");
      return loadHistory(db, msg.since);
    }
    if (msg.type === "import") return importData(db, msg.data);
    if (msg.type === "clearDebug") {
      await db.debugTraces.clear();
      return;
    }
    if (msg.type === "delete") {
      await db.transaction("rw", db.tables, async () => {
        for (const table of db.tables) await table.clear();
      });
      await browser.storage.session.clear();
      await broadcast();
    }
  }
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const result = queue.then(() => handle(message as Request, sender));
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    void result.then(
      (response) => sendResponse(response),
      (error: unknown) =>
        sendResponse({
          __attentionflowError:
            error instanceof Error ? error.message : "Request failed",
        }),
    );
    return true;
  });
  browser.action.onClicked.addListener(async () => {
    const url = browser.runtime.getURL("/dashboard.html");
    const tabs = await browser.tabs.query({});
    const existing = tabs.find((t) => t.url?.split(/[?#]/)[0] === url);
    if (existing?.id) {
      await browser.tabs.update(existing.id, { active: true });
      await browser.windows.update(existing.windowId, { focused: true });
    } else await browser.tabs.create({ url });
  });
});
