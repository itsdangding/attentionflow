import { VERSION } from "../shared/config";
import type { Session } from "../shared/types";
import { appendSegment } from "./time";
export interface SessionState {
  session: Session | null;
  lastPulse: number;
  lastActive: number;
  owner: number | null;
  active: boolean;
}
export function pulse(
  state: SessionState,
  tab: number,
  at: number,
  active: boolean,
  timeout: number,
): SessionState {
  if (state.owner !== tab && !active) return state;
  if (active && (!state.session || at - state.lastActive > timeout))
    state.session = {
      id: crypto.randomUUID(),
      site: "linuxdo",
      collectorVersion: VERSION,
      startedAt: at,
      endedAt: at,
      activeMs: 0,
      activeSegments: [],
    };
  if (
    state.session &&
    state.active &&
    state.owner === tab &&
    at - state.lastPulse <= 2000
  ) {
    appendSegment(state.session.activeSegments, state.lastPulse, at);
    state.session.activeMs += Math.max(0, at - state.lastPulse);
    state.session.endedAt = at;
  }
  state.lastPulse = at;
  state.active = active;
  state.owner = active ? tab : state.owner;
  if (active) state.lastActive = at;
  return state;
}
