// @vitest-environment jsdom
import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { defaults } from "../shared/config";
import { classify } from "../core/model";
import type { Batch } from "../shared/types";
let main: (ctx: any) => void;
let batches: Batch[] = [];
let invalidated: (() => void)[] = [];
let removers: (() => void)[] = [];
let foreground = true;
let visits = 0;
let config = structuredClone(defaults);
let onMessage: (
  msg: any,
  sender: any,
  respond: (value: unknown) => void,
) => unknown;
function receive(msg: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const keepAlive = onMessage(msg, {}, (response) => {
      queueMicrotask(() => resolve(response));
    });
    if (keepAlive !== true) reject(new Error("Chrome message channel closed"));
  });
}
const observers: FakeObserver[] = [];
class FakeObserver {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  emit(element: Element, ratio: number) {
    this.callback(
      [
        {
          target: element,
          intersectionRatio: ratio,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }
}
beforeAll(async () => {
  vi.stubGlobal("defineContentScript", (options: { main: typeof main }) => {
    main = options.main;
    return options;
  });
  await import("../entrypoints/linuxdo.content");
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T09:00:00Z"));
  batches = [];
  observers.length = 0;
  invalidated = [];
  removers = [];
  foreground = true;
  visits = 0;
  config = structuredClone(defaults);
  vi.spyOn(document, "hasFocus").mockImplementation(() => foreground);
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ highest_post_number: 100 }),
    })),
  );
  vi.stubGlobal("browser", {
    runtime: {
      onMessage: {
        addListener: (fn: typeof onMessage) => {
          onMessage = fn;
        },
      },
      sendMessage: vi.fn(async (msg: any) => {
        if (msg.type === "settings") return config;
        if (msg.type === "pulse")
          return {
            sessionId: foreground
              ? "00000000-0000-4000-8000-000000000001"
              : null,
          };
        if (msg.type === "visit") {
          visits++;
          return { entrySource: "direct", clickId: null, visitIndex: visits };
        }
        if (msg.type === "batch") {
          batches.push(structuredClone(msg.batch));
          return;
        }
      }),
    },
  });
});
afterEach(() => {
  for (const fn of invalidated) fn();
  for (const fn of removers) fn();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});
function start() {
  main({
    addEventListener: (
      target: EventTarget,
      name: string,
      fn: EventListener,
      options?: any,
    ) => {
      target.addEventListener(name, fn, options);
      removers.push(() => target.removeEventListener(name, fn, options));
    },
    onInvalidated: (fn: () => void) => invalidated.push(fn),
  });
}
describe("collector lifecycle", () => {
  it.each(["/u/name", "/notifications", "/my/messages"])("does not track excluded route %s even in Debug Mode", async (path) => {
    config.debug = true;
    history.replaceState({}, "", path);
    start();
    await vi.advanceTimersByTimeAsync(16000);
    expect(visits).toBe(0);
    expect(batches.flatMap((b) => b.debugTraces)).toHaveLength(0);
    const pulses = vi.mocked(browser.runtime.sendMessage).mock.calls
      .map(([msg]) => msg as any)
      .filter((msg) => msg.type === "pulse");
    expect(pulses.length).toBeGreaterThan(0);
    expect(pulses.every((msg) => msg.active === false)).toBe(true);
  });
  it("excludes private messages from sessions and debug traces", async () => {
    config.debug = true;
    history.replaceState({}, "", "/t/private/43");
    document.body.innerHTML =
      '<div class="private-message"><div id="topic-title"><h1>Private</h1></div><article data-post-number="1"></article></div>';
    start();
    await vi.advanceTimersByTimeAsync(16000);
    expect(visits).toBe(0);
    expect(batches.flatMap((b) => b.debugTraces)).toHaveLength(0);
    expect(batches.flatMap((b) => b.reads)).toHaveLength(0);
    const pulses = vi.mocked(browser.runtime.sendMessage).mock.calls
      .map(([msg]) => msg as any)
      .filter((msg) => msg.type === "pulse");
    expect(pulses.length).toBeGreaterThan(0);
    expect(pulses.every((msg) => msg.active === false)).toBe(true);
  });
  it("starts a new visit on a different topic and retains the latest previous URL as referrer", async () => {
    history.replaceState({}, "", "/t/first/43");
    document.body.innerHTML = '<div id="topic-title"><h1>First</h1></div>';
    start();
    await vi.advanceTimersByTimeAsync(6000);
    history.replaceState({}, "", "/t/first/43/3");
    window.dispatchEvent(new Event("wxt:locationchange"));
    await vi.advanceTimersByTimeAsync(100);
    history.replaceState({}, "", "/t/second/44");
    window.dispatchEvent(new Event("wxt:locationchange"));
    await vi.advanceTimersByTimeAsync(6000);
    const drained = (await receive({ type: "drain" })) as { batch: Batch };
    const records = [...batches.flatMap((b) => b.reads), ...drained.batch.reads];
    expect(visits).toBe(2);
    expect(new Set(records.map((r) => r.pageVisitId)).size).toBe(2);
    const visitRequests = vi.mocked(browser.runtime.sendMessage).mock.calls
      .map(([msg]) => msg as any)
      .filter((msg) => msg.type === "visit");
    expect(visitRequests.at(-1).referrer).toContain("/t/first/43/3");
  });
  it.each(["/t/reading/43", "/t/43"])("keeps one reading visit while %s follows the current floor", async (path) => {
    history.replaceState({}, "", path);
    document.body.innerHTML =
      '<div id="topic-title"><h1>Reading</h1></div><article data-post-number="70"></article>';
    start();
    await vi.advanceTimersByTimeAsync(6000);
    history.replaceState({}, "", `${path}/70?view=full#post_70`);
    window.dispatchEvent(new Event("wxt:locationchange"));
    await vi.advanceTimersByTimeAsync(6000);
    const drained = (await receive({ type: "drain" })) as { batch: Batch };
    const records = [...batches.flatMap((b) => b.reads), ...drained.batch.reads];
    expect(visits).toBe(1);
    expect(new Set(records.map((r) => r.id)).size).toBe(1);
    expect(new Set(records.map((r) => r.pageVisitId)).size).toBe(1);
    expect(records.at(-1)!.activeReadMs).toBeGreaterThan(11000);
    expect(records.at(-1)!.visitIndex).toBe(1);
  });
  it("A: persists a 93 ms exposure even between two 100 ms ticks", async () => {
    history.replaceState({}, "", "/latest");
    document.body.innerHTML =
      '<div class="topic-list-item"><a class="title" href="https://linux.do/t/42">Fast pass</a></div>';
    start();
    await vi.advanceTimersByTimeAsync(100);
    const row = document.querySelector(".topic-list-item")!;
    observers[0]!.emit(row, 1);
    observers[1]!.emit(row, 1);
    await vi.advanceTimersByTimeAsync(93);
    observers[0]!.emit(row, 0);
    foreground = false;
    window.dispatchEvent(new Event("blur"));
    await vi.advanceTimersByTimeAsync(1);
    const exposures = batches.flatMap((b) => b.exposures);
    expect(exposures).toHaveLength(1);
    expect(exposures[0]!.viewportMs).toBe(93);
    expect(classify(exposures, [])).toBe(0);
  });
  it("D/E: pauses hidden reading and resumes the same visit, retaining the latest checkpoint on settings drain", async () => {
    history.replaceState({}, "", "/t/reading/43");
    document.body.innerHTML =
      '<div id="topic-title"><h1>Reading</h1></div><article data-post-number="70"></article>';
    start();
    await vi.advanceTimersByTimeAsync(15100);
    const before = batches.flatMap((b) => b.reads).at(-1)!;
    expect(before.activeReadMs).toBeGreaterThan(14000);
    expect(before.highestPostNumber).toBe(100);
    foreground = false;
    window.dispatchEvent(new Event("blur"));
    await vi.advanceTimersByTimeAsync(1);
    const paused = batches.flatMap((b) => b.reads).at(-1)!;
    await vi.advanceTimersByTimeAsync(120000);
    const hidden = batches.flatMap((b) => b.reads).at(-1)!;
    expect(hidden.activeReadMs).toBe(paused.activeReadMs);
    foreground = true;
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(1200);
    const drained = (await receive({ type: "drain" })) as { batch: Batch };
    expect(drained.batch.reads.at(-1)!.activeReadMs).toBeGreaterThan(
      before.activeReadMs,
    );
    expect(drained.batch.reads.at(-1)!.activeReadMs).toBeLessThan(
      before.activeReadMs + 2000,
    );
    expect(visits).toBe(1);
    expect(drained.batch.reads.at(-1)!.id).toBe(before.id);
  });
  it("C: click captures every currently visible candidate and its geometry", async () => {
    history.replaceState({}, "", "/latest");
    document.body.innerHTML =
      '<div class="topic-list-item"><a class="title" href="https://linux.do/t/44">A</a></div><div class="topic-list-item"><a class="title" href="https://linux.do/t/45">B</a></div>';
    start();
    await vi.advanceTimersByTimeAsync(100);
    const rows = Array.from(document.querySelectorAll(".topic-list-item"));
    observers[0]!.emit(rows[0]!, 0.9);
    observers[1]!.emit(rows[0]!, 0.8);
    observers[0]!.emit(rows[1]!, 0.7);
    observers[1]!.emit(rows[1]!, 0.5);
    const link = rows[0]!.querySelector("a")!;
    link.addEventListener("click", (e) => e.preventDefault());
    link.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
      }),
    );
    await vi.advanceTimersByTimeAsync(1);
    const clicked = batches.flatMap((b) => b.clicks).at(-1)!;
    expect(clicked.openMode).toBe("new_tab");
    expect(clicked.externalTopicId).toBe(44);
    expect(clicked.candidates).toEqual([
      {
        externalTopicId: 44,
        listPosition: 0,
        visibilityRatio: 0.9,
        attentionZoneRatio: 0.8,
      },
      {
        externalTopicId: 45,
        listPosition: 1,
        visibilityRatio: 0.7,
        attentionZoneRatio: 0.5,
      },
    ]);
    expect(
      batches.flatMap((b) => b.exposures).find((e) => e.externalTopicId === 44)
        ?.clickId,
    ).toBe(clicked.id);
  });
});
