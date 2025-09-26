import type { Candle, PricePoint } from "./types";

// Build OHLC candles from raw price points. Assumptions:
// - points are in ms timestamps, unsorted allowed (we'll sort)
// - intervalMs > 0
// Enhancements over naive version:
//   * If first trade in a bucket isn't at exact bucket start, we still derive OPEN from first trade inside bucket.
//   * If there is a gap (no trades) between buckets we create a synthetic doji candle that carries forward last close
//     so the chart shows continuity rather than temporal holes (optional: enabled by default via fillGaps).
//   * Buckets returned sorted by time.
export function buildCandles(points: PricePoint[], intervalMs: number, opts?: { fillGaps?: boolean }): Candle[] {
  if (!intervalMs || intervalMs <= 0) return [];
  if (!points.length) return [];
  const fillGaps = opts?.fillGaps !== false; // default true
  // Sort by time ascending
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const bucketMap = new Map<number, Candle>();
  // Track candles per bucket
  for (const { t, p } of sorted) {
    const bucketStart = Math.floor(t / intervalMs) * intervalMs;
    let candle = bucketMap.get(bucketStart);
    if (!candle) {
      candle = { t: bucketStart, open: p, high: p, low: p, close: p };
      bucketMap.set(bucketStart, candle);
    } else {
      candle.high = Math.max(candle.high, p);
      candle.low = Math.min(candle.low, p);
      candle.close = p;
    }
  }
  const candles = Array.from(bucketMap.values()).sort((a, b) => a.t - b.t);
  if (!fillGaps || candles.length === 0) return candles;
  // Fill any missing buckets with synthetic flat candles
  const filled: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    filled.push(candles[i]);
    if (i === candles.length - 1) break;
    const cur = candles[i];
    const next = candles[i + 1];
    let expected = cur.t + intervalMs;
    while (expected < next.t) {
      // carry forward last close
      const price = cur.close;
      filled.push({ t: expected, open: price, high: price, low: price, close: price });
      expected += intervalMs;
    }
  }
  return filled;
}
