import type { Candle, PricePoint } from "./types";

export function buildCandles(points: PricePoint[], intervalMs: number): Candle[] {
  const buckets = new Map<number, Candle>();
  for (const { t, p } of points) {
    const key = Math.floor(t / intervalMs) * intervalMs;
    const c = buckets.get(key);
    if (!c) buckets.set(key, { t: key, open: p, high: p, low: p, close: p });
    else {
      c.high = Math.max(c.high, p);
      c.low = Math.min(c.low, p);
      c.close = p;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.t - b.t);
}
