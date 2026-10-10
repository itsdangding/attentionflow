import { z } from "zod";
import { defaults } from "./config";
const entries = Object.fromEntries(
  Object.keys(defaults.model).map((key) => [
    key,
    z.number().finite().nonnegative(),
  ]),
) as { [K in keyof typeof defaults.model]: z.ZodNumber };
export const settingsSchema = z.object({
  tracking: z.boolean(),
  debug: z.boolean(),
  model: z
    .object(entries)
    .refine(
      (m) =>
        m.zoneRatio <= 1 &&
        m.deepRatio <= 1 &&
        m.readIdleMs > 0 &&
        m.sessionTimeoutMs >= m.readIdleMs,
      "Invalid model thresholds",
    ),
});
