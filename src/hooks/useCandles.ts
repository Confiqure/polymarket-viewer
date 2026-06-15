"use client";
import { useMemo } from "react";
import { buildCandles, extendCandlesForward } from "@/lib/candles";
import { countAtOrBefore, TimeSeries } from "@/lib/buffer";
import type { PricePoint } from "@/lib/types";
import type { TF } from "@/lib/timeframes";
import { tfToMs } from "@/lib/timeframes";

/**
 * Build spoiler-delayed OHLC candles from static history (`backfill`) plus the live polling
 * `series`. Recomputed on every ~1 Hz ticker tick, so it's split for cheapness:
 *  - The heavy `buildCandles` pass is keyed on the *count of visible points* per side, not on
 *    `nowTs`. Identical visible data → cached result; no re-sort/re-bucket of the full history.
 *  - The forward-fill returns a stable reference when no new bucket is due, so the chart can
 *    skip all work on quiet ticks.
 */
export function useCandles(series: TimeSeries, backfill: PricePoint[], nowTs: number, delayMs: number, tf: TF) {
  const intervalMs = tfToMs(tf);
  const displayCutoff = nowTs - delayMs;

  // Static between loads; sort once so the visible prefix is a binary-search away.
  const sortedBackfill = useMemo(() => {
    const copy = [...backfill];
    copy.sort((a, b) => a.t - b.t);
    return copy;
  }, [backfill]);

  // Only points at or before the spoiler cutoff are visible; their visible *counts* are the
  // sole inputs that change the candle set, so we key the rebuild on them rather than on nowTs.
  const liveArr = series.toArray();
  const visibleBackfill = countAtOrBefore(sortedBackfill, displayCutoff);
  const visibleLive = series.indexAtOrBefore(displayCutoff) + 1;

  const baseCandles = useMemo(() => {
    const points = [...sortedBackfill.slice(0, visibleBackfill), ...liveArr.slice(0, visibleLive)];
    return buildCandles(points, intervalMs);
    // `liveArr` is deliberately omitted: its (append-only) growth is captured by `visibleLive`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedBackfill, visibleBackfill, visibleLive, intervalMs]);

  return useMemo(
    () => extendCandlesForward(baseCandles, displayCutoff, intervalMs),
    [baseCandles, displayCutoff, intervalMs],
  );
}
