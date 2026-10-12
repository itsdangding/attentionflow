export const VERSION = "0.1.2";
export const SCHEMA_VERSION = 1;
export const defaults = {
  tracking: true,
  debug: false,
  model: {
    seenMs: 500,
    zoneRatio: 0.6,
    seenVelocity: 1.5,
    sharedMs: 600,
    decelerationEntry: 1,
    decelerationExit: 0.3,
    stopMs: 1500,
    stopCount: 4,
    hoverMs: 800,
    readMs: 10000,
    deepMs: 180000,
    deepDepthMs: 90000,
    deepRatio: 0.7,
    readIdleMs: 90000,
    sessionTimeoutMs: 180000,
    scrollStopVelocity: 0.05,
  },
};
export type Settings = typeof defaults;
