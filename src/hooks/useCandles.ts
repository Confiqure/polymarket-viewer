"use client";
import { useMemo } from "react";
import { buildCandles } from "@/lib/candles";
import { TimeSeries } from "@/lib/buffer";
import type { PricePoint } from "@/lib/types";
import type { TF } from "@/lib/timeframes";
import { tfToMs } from "@/lib/timeframes";

export function useCandles(series: TimeSeries, backfill: PricePoint[], nowTs: number, delayMs: number, tf: TF) {
  const intervalMs = tfToMs(tf);
  return useMemo(() => {
    const displayCutoff = nowTs - delayMs;
    // Filter both historical and live points so none newer than cutoff leak.
    const filteredBackfill = backfill.filter((p) => p.t <= displayCutoff);
    const filteredLive = series.toArray().filter((p) => p.t <= displayCutoff);
    const candlesAll = buildCandles([...filteredBackfill, ...filteredLive], intervalMs);
    // Extend with synthetic candles up to the current (delayed) bucket so the chart
    // continues to update even when there's a gap in ticks. Uses last known price only.
    if (candlesAll.length === 0) return candlesAll;
    const currentBucketStart = Math.floor(displayCutoff / intervalMs) * intervalMs;
    const extended = [...candlesAll];
    let last = extended[extended.length - 1];
    // fill forward one or more buckets with doji candles carrying forward last close
    let t = last.t + intervalMs;
    while (t <= currentBucketStart) {
      const price = last.close;
      extended.push({ t, open: price, high: price, low: price, close: price });
      last = extended[extended.length - 1];
      t += intervalMs;
    }
    return extended;
  }, [series, backfill, nowTs, delayMs, intervalMs]);
}
