import type { PricePoint } from "./types";

export class TimeSeries {
  private buf: PricePoint[] = [];
  private maxPoints: number;
  private maxAgeMs?: number;

  constructor(opts?: { maxPoints?: number; maxAgeMs?: number }) {
    this.maxPoints = opts?.maxPoints ?? 50000;
    this.maxAgeMs = opts?.maxAgeMs;
  }

  push(p: PricePoint) {
    this.buf.push(p);
    // Trim by age first (if configured)
    if (this.maxAgeMs != null) {
      const cutoff = p.t - this.maxAgeMs;
      // Find first index with t >= cutoff (lower_bound)
      let lo = 0, hi = this.buf.length - 1, idx = this.buf.length;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (this.buf[mid].t >= cutoff) {
          idx = mid;
          hi = mid - 1;
        } else lo = mid + 1;
      }
      if (idx > 0) this.buf = this.buf.slice(idx);
    }
    // Trim by max points
    if (this.buf.length > this.maxPoints) {
      this.buf = this.buf.slice(this.buf.length - this.maxPoints);
    }
  }

  // Returns the last point with t <= ts
  atOrBefore(ts: number): PricePoint | undefined {
    const arr = this.buf;
    if (arr.length === 0) return undefined;
    let lo = 0, hi = arr.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const mt = arr[mid].t;
      if (mt <= ts) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans >= 0 ? arr[ans] : undefined;
  }

  // Returns the index of the last point with t <= ts, or -1 if none
  indexAtOrBefore(ts: number): number {
    const arr = this.buf;
    if (arr.length === 0) return -1;
    let lo = 0, hi = arr.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const mt = arr[mid].t;
      if (mt <= ts) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }

  // Returns all points with t >= fromTs
  range(fromTs: number): PricePoint[] {
    const arr = this.buf;
    if (arr.length === 0) return [];
    let lo = 0, hi = arr.length - 1, idx = arr.length;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].t >= fromTs) {
        idx = mid;
        hi = mid - 1;
      } else lo = mid + 1;
    }
    return idx < arr.length ? arr.slice(idx) : [];
  }

  // Access to raw buffer (read-only intent)
  toArray(): PricePoint[] {
    return this.buf;
  }
}

export function lerpAt(series: TimeSeries, ts: number): PricePoint | undefined {
  const arr = series.toArray();
  if (arr.length === 0) return undefined;
  const i = series.indexAtOrBefore(ts);
  if (i < 0) return undefined;
  const prev = arr[i];
  if (i === arr.length - 1) return prev;
  const next = arr[i + 1];
  if (!next || next.t <= prev.t) return prev;
  if (ts <= prev.t) return prev;
  if (ts >= next.t) return next;
  const a = (ts - prev.t) / (next.t - prev.t);
  return { t: ts, p: prev.p + a * (next.p - prev.p) };
}
