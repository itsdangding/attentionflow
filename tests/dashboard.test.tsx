// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi } from "vitest";
import App from "../entrypoints/dashboard/App";
import { defaults } from "../shared/config";
describe("Dashboard", () => {
  it("loads empty local data, changes range and immediately applies tracking settings", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const snapshot = {
      topics: [],
      exposures: [],
      reads: [],
      clicks: [],
      sessions: [],
      debugTraces: [],
    };
    const sendMessage = vi.fn(async (msg) =>
      msg.type === "settings"
        ? structuredClone(defaults)
        : msg.type === "range"
          ? snapshot
          : msg.type === "history"
            ? {
                reads: [
                  {
                    id: "r1",
                    site: "linuxdo",
                    collectorVersion: "0.1.1",
                    externalTopicId: 42,
                    sessionId: "s",
                    pageVisitId: "p",
                    entrySource: "list_click",
                    clickId: null,
                    visitIndex: 1,
                    openedAt: Date.now() - 60000,
                    closedAt: Date.now(),
                    lastCheckpointAt: Date.now(),
                    activeReadMs: 60000,
                    maxPostNumberSeen: 3,
                    highestPostNumber: 10,
                    activeSegments: [],
                  },
                ],
                topics: [
                  {
                    site: "linuxdo",
                    externalTopicId: 42,
                    title: "History topic",
                    category: "开发调优",
                    tags: [],
                    author: "",
                    highestPostNumber: 10,
                    firstSeenAt: 0,
                    lastSeenAt: 0,
                  },
                ],
              }
            : undefined,
    );
    vi.stubGlobal("browser", { runtime: { sendMessage } });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<App />);
    });
    expect(host.textContent).toContain("还没有浏览记录");
    expect(sendMessage).not.toHaveBeenCalledWith({ type: "export" });
    const find = (name: string) =>
      Array.from(host.querySelectorAll("nav button")).find((b) =>
        b.textContent?.includes(name),
      ) as HTMLButtonElement;
    await act(async () => {
      find("Last 7 Days").click();
    });
    expect(host.textContent).toContain("浏览趋势");
    await act(async () => {
      find("History").click();
    });
    expect(host.textContent).toContain("History topic");
    expect(host.textContent).toContain("读到 3/10 楼 · 30%");
    expect(
      host.querySelector<HTMLAnchorElement>(".history-day a")!.href,
    ).toBe("https://linux.do/t/42/3");
    await act(async () => {
      find("Settings").click();
    });
    const checkbox = host.querySelector<HTMLInputElement>(
      "input[type=checkbox]",
    )!;
    await act(async () => {
      checkbox.click();
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: "configure",
      settings: { ...defaults, tracking: false },
    });
    expect(host.textContent).toContain("设置已应用");
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.unstubAllGlobals();
  });
});
