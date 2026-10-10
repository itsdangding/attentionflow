import type { Segment } from "../shared/types";
export function appendSegment(segments: Segment[], start: number, end: number) {
  if (end <= start) return;
  const last = segments.at(-1);
  if (last && last.end === start) last.end = end;
  else segments.push({ start, end });
}
export function duration(segments: Segment[], start: number, end: number) {
  return segments.reduce(
    (n, s) => n + Math.max(0, Math.min(end, s.end) - Math.max(start, s.start)),
    0,
  );
}
export function localDay(at: number) {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
