import "fake-indexeddb/auto";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { db } from "../db/schema";
import { defaults, VERSION } from "../shared/config";
import type { Request, Batch, Click } from "../shared/types";
import { unwrapResponse } from "../shared/runtime";
let onMessage: (
  msg: Request,
  sender: any,
  respond: (value: unknown) => void,
) => unknown;
function listener(msg: Request, sender: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const keepAlive = onMessage(msg, sender, (response) => {
      try {
        resolve(unwrapResponse(response));
      } catch (error) {
        reject(error);
      }
    });
    if (keepAlive !== true) reject(new Error("Chrome message channel closed"));
  });
}
let local: Record<string, unknown> = {},
  session: Record<string, unknown> = {};
const area = (store: () => Record<string, unknown>) => ({
  get: async (key: string) => ({ [key]: structuredClone(store()[key]) }),
  set: async (value: Record<string, unknown>) =>
    Object.assign(store(), structuredClone(value)),
  remove: async (key: string) => {
    delete store()[key];
  },
  clear: async () => {
    for (const key in store()) delete store()[key];
  },
});
let tabs: Record<number, any> = {};
const sendMessage = vi.fn(
  async (_id: number, _message: any) => undefined as any,
);
const site = (id = 1) => ({ url: "https://linux.do/latest", tab: { id } });
const dashboard = { url: "chrome-extension://test/dashboard.html" };
const batch = (): Batch => ({
  topics: [],
  exposures: [],
  clicks: [],
  reads: [],
  debugTraces: [],
});
const click = (
  topicId: number,
  mode: "same_tab" | "new_tab" = "new_tab",
): Click => ({
  id: crypto.randomUUID(),
  site: "linuxdo",
  collectorVersion: VERSION,
  externalTopicId: topicId,
  sessionId: crypto.randomUUID(),
  pageVisitId: crypto.randomUUID(),
  clickedAt: Date.now(),
  listSource: "latest",
  listPosition: 0,
  openMode: mode,
  candidates: [
    {
      externalTopicId: topicId,
      listPosition: 0,
      visibilityRatio: 1,
      attentionZoneRatio: 1,
    },
  ],
  targetUrl: `https://linux.do/t/${topicId}`,
});
beforeAll(async () => {
  vi.stubGlobal("defineBackground", (fn: () => void) => fn());
  vi.stubGlobal("browser", {
    runtime: {
      getURL: (path: string) => "chrome-extension://test" + path,
      onMessage: {
        addListener: (fn: typeof onMessage) => {
          onMessage = fn;
        },
      },
    },
    storage: { local: area(() => local), session: area(() => session) },
    tabs: {
      get: async (id: number) => tabs[id],
      query: async () => Object.values(tabs),
      sendMessage,
    },
    windows: { get: async () => ({ focused: true }) },
    action: { onClicked: { addListener: vi.fn() } },
  });
  await import("../entrypoints/background");
});
beforeEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  local = {};
  session = {};
  tabs = {
    1: { id: 1, active: true, windowId: 1 },
    2: { id: 2, active: false, windowId: 1, openerTabId: 1 },
    3: { id: 3, active: false, windowId: 1, openerTabId: 1 },
  };
  sendMessage.mockReset();
  sendMessage.mockResolvedValue(undefined);
  await db.transaction("rw", db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
});
afterAll(() => {
  db.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("background contracts", () => {
  it("keeps Chrome's callback channel open for an asynchronous response", async () => {
    let responded = false;
    const response = new Promise<unknown>((resolve) => {
      expect(
        onMessage({ type: "settings" }, dashboard, (value) => {
          responded = true;
          resolve(value);
        }),
      ).toBe(true);
    });
    expect(responded).toBe(false);
    expect(await response).toEqual(defaults);
  });
  it("serializes handler failures and processes the next message", async () => {
    const failure = new Promise<unknown>((resolve) => {
      expect(onMessage({ type: "export" }, site(), resolve)).toBe(true);
    });
    expect(await failure).toEqual({ __attentionflowError: "Dashboard only" });
    expect(await listener({ type: "settings" }, dashboard)).toEqual(defaults);
  });
  it("validates the actual foreground tab and restores one global Session", async () => {
    const now = Date.now();
    const first = await listener(
      { type: "pulse", at: now, active: true, lastActivity: now },
      site(),
    );
    const hidden = await listener(
      { type: "pulse", at: now, active: true, lastActivity: now },
      site(2),
    );
    expect(first.sessionId).toBeTruthy();
    expect(hidden.sessionId).toBeNull();
    const again = await listener(
      { type: "pulse", at: now, active: true, lastActivity: now },
      site(),
    );
    expect(again.sessionId).toBe(first.sessionId);
    expect(await db.sessions.count()).toBe(1);
  });
  it("C/G: records Choice Sets and matches three background clicks to the correct opener and Topic", async () => {
    const payload = batch();
    payload.clicks = [click(11), click(12), click(13)];
    await listener({ type: "batch", batch: payload }, site());
    expect(
      (await db.clicks.get(payload.clicks[0]!.id))?.candidates,
    ).toHaveLength(1);
    const visit = async (topicId: number, tabId: number) =>
      listener(
        {
          type: "visit",
          topicId,
          url: `https://linux.do/t/${topicId}`,
          pageVisitId: crypto.randomUUID(),
          referrer: "https://linux.do/latest",
        },
        site(tabId),
      );
    const unrelated = await visit(11, 1);
    expect(unrelated.clickId).toBeNull();
    const read = await visit(11, 2);
    expect(read.clickId).toBe(payload.clicks[0]!.id);
    expect(read.entrySource).toBe("list_click");
    expect((await visit(12, 3)).clickId).toBe(payload.clicks[1]!.id);
    expect((await visit(11, 2)).clickId).toBeNull();
  });
  it("drains pending records before disabling tracking and broadcasts settings to every open tab", async () => {
    const payload = batch();
    payload.clicks = [click(22, "same_tab")];
    sendMessage.mockImplementation(async (id, msg) =>
      msg.type === "drain" && id === 1 ? { batch: payload } : undefined,
    );
    await listener(
      { type: "configure", settings: { ...defaults, tracking: false } },
      dashboard,
    );
    expect(await db.clicks.count()).toBe(1);
    expect(
      sendMessage.mock.calls.filter(
        ([, msg]) => msg.type === "settingsChanged",
      ),
    ).toHaveLength(3);
    const ignored = batch();
    ignored.clicks = [click(23)];
    await listener({ type: "batch", batch: ignored }, site());
    expect(await db.clicks.count()).toBe(1);
  });
  it("rejects website requests to export or delete extension data", async () => {
    await expect(listener({ type: "export" }, site())).rejects.toThrow(
      "Dashboard only",
    );
    await expect(listener({ type: "delete" }, site())).rejects.toThrow(
      "Dashboard only",
    );
    await expect(
      listener({ type: "settings" }, { url: "https://example.com" }),
    ).rejects.toThrow("Unauthorized");
  });
  it("deletes every table and clears restored Session state", async () => {
    const payload = batch();
    payload.clicks = [click(24)];
    await listener({ type: "batch", batch: payload }, site());
    await listener(
      { type: "pulse", at: Date.now(), active: true, lastActivity: Date.now() },
      site(),
    );
    await listener({ type: "delete" }, dashboard);
    expect(await db.clicks.count()).toBe(0);
    expect(await db.sessions.count()).toBe(0);
    expect(session).toEqual({});
    expect(sendMessage).toHaveBeenCalledWith(1, { type: "reset" });
  });
  it("background idle tabs do not expire the foreground Session", async () => {
    const started = Date.now();
    let fakeNow = started;
    vi.spyOn(Date, "now").mockImplementation(() => fakeNow);
    const first = await listener(
      { type: "pulse", at: started, active: true, lastActivity: started },
      site(),
    );
    fakeNow = started + 181000;
    await listener(
      { type: "pulse", at: Date.now(), active: true, lastActivity: Date.now() },
      site(),
    );
    const active = await listener(
      { type: "pulse", at: Date.now(), active: true, lastActivity: Date.now() },
      site(),
    );
    await listener(
      { type: "pulse", at: Date.now(), active: false, lastActivity: started },
      site(2),
    );
    const after = await listener(
      { type: "pulse", at: Date.now(), active: true, lastActivity: Date.now() },
      site(),
    );
    expect(after.sessionId).toBe(active.sessionId);
    expect(after.sessionId).not.toBe(first.sessionId);
  });
  it("inactivity timeout starts at last user activity rather than the 90-second pause", async () => {
    const started = Date.now();
    let fakeNow = started;
    vi.spyOn(Date, "now").mockImplementation(() => fakeNow);
    const first = await listener(
      { type: "pulse", at: started, active: true, lastActivity: started },
      site(),
    );
    fakeNow = started + 90000;
    await listener(
      { type: "pulse", at: Date.now(), active: false, lastActivity: started },
      site(),
    );
    fakeNow = started + 180001;
    const resumed = await listener(
      { type: "pulse", at: Date.now(), active: true, lastActivity: Date.now() },
      site(),
    );
    expect(resumed.sessionId).not.toBe(first.sessionId);
  });
  it("notification popovers retain entry source when opening a background tab", async () => {
    await listener(
      { type: "notificationEntry", topicId: 25, openMode: "new_tab" },
      site(),
    );
    const visit = await listener(
      {
        type: "visit",
        topicId: 25,
        url: "https://linux.do/t/25",
        pageVisitId: crypto.randomUUID(),
        referrer: "https://linux.do/latest",
      },
      site(2),
    );
    expect(visit.entrySource).toBe("notification");
    expect(visit.clickId).toBeNull();
  });
  it("a resumed page in a new Session preserves visit index and original click provenance", async () => {
    const pageVisitId = crypto.randomUUID(),
      clickId = crypto.randomUUID();
    await db.reads.add({
      id: crypto.randomUUID(),
      site: "linuxdo",
      externalTopicId: 26,
      sessionId: crypto.randomUUID(),
      pageVisitId,
      collectorVersion: VERSION,
      entrySource: "list_click",
      clickId,
      visitIndex: 3,
      openedAt: 1,
      closedAt: 2,
      lastCheckpointAt: 2,
      activeReadMs: 1,
      maxPostNumberSeen: 1,
      highestPostNumber: 1,
      activeSegments: [{ start: 1, end: 2 }],
    });
    const visit = await listener(
      {
        type: "visit",
        topicId: 26,
        url: "https://linux.do/t/26",
        pageVisitId,
        referrer: "https://linux.do/t/26",
      },
      site(),
    );
    expect(visit.visitIndex).toBe(3);
    expect(visit.clickId).toBe(clickId);
    expect(visit.entrySource).toBe("list_click");
    const again = await listener(
      {
        type: "visit",
        topicId: 26,
        url: "https://linux.do/t/26",
        pageVisitId: crypto.randomUUID(),
        referrer: "",
      },
      site(),
    );
    expect(again.visitIndex).toBe(4);
  });
});
