import { afterEach, describe, expect, it, vi } from "vitest";
import { sendMessage } from "../shared/runtime";

afterEach(() => vi.unstubAllGlobals());

describe("runtime responses", () => {
  it("returns successful replies, including an empty acknowledgement", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ sessionId: "session" })
      .mockResolvedValueOnce(undefined);
    vi.stubGlobal("browser", { runtime: { sendMessage: send } });
    expect(await sendMessage({ type: "pulse" })).toEqual({
      sessionId: "session",
    });
    expect(await sendMessage({ type: "batch" })).toBeUndefined();
    expect(send).toHaveBeenCalledWith({ type: "pulse" });
  });

  it("rejects a serialized background failure", async () => {
    vi.stubGlobal("browser", {
      runtime: {
        sendMessage: vi
          .fn()
          .mockResolvedValue({ __attentionflowError: "Dashboard only" }),
      },
    });
    await expect(sendMessage({ type: "export" })).rejects.toThrow(
      "Dashboard only",
    );
  });

  it("retains transport failures for the collector retry and dashboard error paths", async () => {
    vi.stubGlobal("browser", {
      runtime: {
        sendMessage: vi
          .fn()
          .mockRejectedValue(new Error("Extension context invalidated")),
      },
    });
    await expect(sendMessage({ type: "settings" })).rejects.toThrow(
      "Extension context invalidated",
    );
  });
});
