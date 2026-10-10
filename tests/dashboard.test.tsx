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
        : msg.type === "export"
          ? snapshot
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
    const find = (name: string) =>
      Array.from(host.querySelectorAll("nav button")).find((b) =>
        b.textContent?.includes(name),
      ) as HTMLButtonElement;
    await act(async () => {
      find("Last 7 Days").click();
    });
    expect(host.textContent).toContain("浏览趋势");
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
