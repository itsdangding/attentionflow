// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import WeeklyReceipt from "../entrypoints/dashboard/WeeklyReceipt";
import { defaults } from "../shared/config";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

it("reloads current data when the receipt is reopened", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const snapshot = { topics: [], exposures: [], clicks: [], reads: [], sessions: [], debugTraces: [] };
  const sendMessage = vi.fn(async (message) => message.type === "settings" ? defaults : snapshot);
  vi.stubGlobal("browser", { runtime: { sendMessage } });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<WeeklyReceipt />));
  await act(async () => host.querySelector<HTMLButtonElement>(".receipt-launcher")!.click());
  await act(async () => host.querySelector<HTMLButtonElement>(".receipt-close")!.click());
  await act(async () => host.querySelector<HTMLButtonElement>(".receipt-launcher")!.click());
  const queries = sendMessage.mock.calls.filter(([message]) => message.type === "range").length;
  await act(async () => root.unmount());
  expect(queries).toBe(2);
});

it("offers a retry when the first request fails", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let fail = true;
  vi.stubGlobal("browser", { runtime: { sendMessage: vi.fn(async message => {
    if (fail) throw new Error("temporary failure");
    return message.type === "settings" ? defaults : { topics: [], exposures: [], clicks: [], reads: [], sessions: [], debugTraces: [] };
  }) } });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<WeeklyReceipt />));
  await act(async () => host.querySelector<HTMLButtonElement>(".receipt-launcher")!.click());
  const buttons = [...host.querySelectorAll(".receipt-modal button")].map(button => button.textContent);
  expect(buttons).toContain("重新统计");
  fail = false;
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "重新统计")!.click());
  expect(host.querySelector(".receipt-card")).not.toBeNull();
  expect(host.textContent).not.toContain("temporary failure");
  await act(async () => root.unmount());
});

it("exports long Chinese titles within the PNG and includes Seen in copied text", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const now = Date.now();
  const title = "中文标题".repeat(15);
  const snapshot = {
    topics: [{ externalTopicId: 42, title }], exposures: [], clicks: [],
    reads: [{ externalTopicId: 42, entrySource: "direct", openedAt: now - 60000,
      closedAt: now, lastCheckpointAt: now, activeSegments: [{ start: now - 60000, end: now }],
      highestPostNumber: 10, maxPostNumberSeen: 10 }],
    sessions: [], debugTraces: [],
  };
  vi.stubGlobal("browser", { runtime: { sendMessage: vi.fn(async message => message.type === "settings" ? defaults : snapshot) } });
  const writeText = vi.fn(async (_value: string) => {});
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const ctx = {
    beginPath: vi.fn(), moveTo: vi.fn(), arcTo: vi.fn(), closePath: vi.fn(),
    fill: vi.fn(), stroke: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: Array.from(text).length * 27 })),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob()));
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:receipt"), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<WeeklyReceipt />));
  await act(async () => host.querySelector<HTMLButtonElement>(".receipt-launcher")!.click());
  await act(async () => host.querySelector<HTMLInputElement>("input")!.click());
  const button = (name: string) => [...host.querySelectorAll("button")].find(b => b.textContent === name)!;
  await act(async () => button("复制分享文案").click());
  expect(writeText.mock.calls[0]?.[0]).toContain("Seen 0");
  expect(writeText.mock.calls[0]?.[0]).toContain(title);
  await act(async () => button("导出 PNG").click());
  const renderedTitle = ctx.fillText.mock.calls.find(([, , y]) => y === 1162)?.[0];
  expect(renderedTitle).toBeDefined();
  expect(renderedTitle.endsWith("…")).toBe(true);
  expect(ctx.measureText(renderedTitle).width).toBeLessThanOrEqual(940);
  await act(async () => host.querySelector<HTMLButtonElement>(".receipt-close")!.click());
  snapshot.topics = [];
  snapshot.reads = [];
  await act(async () => host.querySelector<HTMLButtonElement>(".receipt-launcher")!.click());
  expect(host.textContent).not.toContain(title);
  expect(host.querySelector<HTMLInputElement>("input")!.checked).toBe(false);
  await act(async () => button("复制分享文案").click());
  expect(writeText.mock.calls.at(-1)?.[0]).not.toContain(title);
  await act(async () => root.unmount());
});
