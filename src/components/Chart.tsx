"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  createChart,
  CrosshairMode,
  CandlestickSeries,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
  type IChartApi,
} from "lightweight-charts";
import type { Candle as CandleType } from "@/lib/types";

export function Chart({
  candles,
  height = 320,
  tvMode = false,
}: {
  candles: Array<CandleType>;
  height?: number;
  tvMode?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<{ chart: IChartApi; series: ISeriesApi<"Candlestick"> } | null>(null);
  const [chartErr, setChartErr] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const userZoomedRef = useRef(false);
  const programmaticRangeChangeRef = useRef(false);
  const [zoomed, setZoomed] = useState(false);
  const appliedInitialWindowRef = useRef(false);
  const prevSeriesStartRef = useRef<number | null>(null);
  const totalFromSecRef = useRef<number | null>(null);
  const totalToSecRef = useRef<number | null>(null);

  // Recompute whether we're in a fully zoomed-out (fit) state
  const recomputeZoomState = useCallback(() => {
    try {
      const c = chartRef.current?.chart;
      if (!c) return;
      const vr = c.timeScale().getVisibleRange();
      if (!vr) return;
      const firstSec = totalFromSecRef.current;
      const lastSec = totalToSecRef.current;
      if (firstSec == null || lastSec == null) return;
      const span = Math.max(1, lastSec - firstSec);
      const tol = Math.max(60, Math.floor(span * 0.01)); // 1% or >= 60s
      const from = (vr.from as number) ?? firstSec;
      const to = (vr.to as number) ?? lastSec;
      const isFit = from <= firstSec + tol && to >= lastSec - tol;
      setZoomed(!isFit);
    } catch {}
  }, []);

  // Observe container width to avoid initializing chart at 0px width
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      const w = Math.floor((cr?.width ?? el.clientWidth) || 0);
      setContainerWidth(w);
    });
    ro.observe(el);
    // Seed initial width
    const initialW = Math.floor(el.clientWidth || 0);
    if (initialW) setContainerWidth(initialW);
    return () => ro.disconnect();
  }, []);

  // Init or resize chart when size changes
  useLayoutEffect(() => {
    setChartErr(null);
    try {
      const el = ref.current;
      if (!el) return;
      if (containerWidth <= 0 || height <= 0) return;

      if (!chartRef.current) {
        const chart = createChart(el, {
          width: containerWidth,
          height,
          layout: { textColor: "#cbd5e1", background: { color: "transparent" } },
          rightPriceScale: { borderVisible: false },
          timeScale: { borderVisible: false },
          crosshair: { mode: CrosshairMode.Magnet },
          grid: { horzLines: { color: "#1f2937" }, vertLines: { color: "#1f2937" } },
        });
        // Official v5 API: supply series definition constant first argument
        type ChartWithAdd = IChartApi & { addSeries: (def: unknown, opts?: unknown) => ISeriesApi<"Candlestick"> };
        const cwa = chart as ChartWithAdd;
        if (typeof cwa.addSeries !== "function") {
          throw new Error("lightweight-charts addSeries API unavailable");
        }
        const series = cwa.addSeries(CandlestickSeries, {
          upColor: "#10b981",
          downColor: "#ef4444",
          wickUpColor: "#10b981",
          wickDownColor: "#ef4444",
          borderVisible: false,
        });
        // Nudge view slightly so last candle isn't flush with edge
        chart.timeScale().applyOptions({ rightOffset: 5 });

        // mark user zoom interaction to stop auto-fit until reset
        const ts = chart.timeScale();
        const handleVisibleLogicalRangeChange = () => {
          if (!programmaticRangeChangeRef.current) {
            userZoomedRef.current = true;
          }
          requestAnimationFrame(() => recomputeZoomState());
        };
        ts.subscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange);

        chartRef.current = { chart, series };
        return () => {
          try {
            ts.unsubscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange);
          } catch {}
          chart.remove();
          chartRef.current = null;
        };
      }

      chartRef.current.chart.applyOptions({ width: containerWidth, height });
      requestAnimationFrame(() => recomputeZoomState());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Chart init failed";
      console.error("[Chart] init error", e);
      setChartErr(msg);
    }
  }, [containerWidth, height, recomputeZoomState]);

  // Set data on changes
  useEffect(() => {
    if (!chartRef.current) return;
    try {
      const { series, chart } = chartRef.current;
      const mapped: CandlestickData<UTCTimestamp>[] = candles.map((c: CandleType) => ({
        time: Math.floor(c.t / 1000) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      const data: CandlestickData<UTCTimestamp>[] = [];
      let lastTime: number | null = null;
      for (const d of mapped) {
        const t = d.time as number;
        if (lastTime !== null && t <= lastTime) continue;
        data.push(d);
        lastTime = t;
      }
      if (data.length === 0) {
        console.debug("[Chart] No candles to display", { candles: candles.length });
        return;
      }
      // Detect series change (first timestamp change) and reset the initial window flag
      const firstTs = candles[0]?.t ?? null;
      if (firstTs !== prevSeriesStartRef.current) {
        prevSeriesStartRef.current = firstTs;
        appliedInitialWindowRef.current = false;
        userZoomedRef.current = false;
      }

      series.setData(data);

      // Cache total bounds for stable comparisons
      const firstSec = data[0].time as number;
      const lastSec = data[data.length - 1].time as number;
      totalFromSecRef.current = firstSec;
      totalToSecRef.current = lastSec;

      // Apply initial 4-hour view once when data arrives, unless user already interacted or we already applied
      if (!appliedInitialWindowRef.current && !userZoomedRef.current) {
        const lastSec = data[data.length - 1].time as number;
        const fourHours = 4 * 60 * 60;
        programmaticRangeChangeRef.current = true;
        try {
          chart
            .timeScale()
            .setVisibleRange({ from: (lastSec - fourHours) as UTCTimestamp, to: lastSec as UTCTimestamp });
        } finally {
          appliedInitialWindowRef.current = true;
          setTimeout(() => {
            programmaticRangeChangeRef.current = false;
            recomputeZoomState();
          }, 0);
        }
      } else {
        if (userZoomedRef.current || appliedInitialWindowRef.current) {
          recomputeZoomState();
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Chart data error";
      console.error("[Chart] data error", e);
      setChartErr(msg);
    }
  }, [candles, recomputeZoomState]);

  const hasData = candles.length > 0;
  return (
    <div ref={ref} className="relative w-full rounded-lg border border-neutral-800" style={{ height }}>
      {!hasData && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-md bg-black/60 px-3 py-2 text-sm text-neutral-400 ring-1 ring-neutral-800">
            No candles yet for this delay/timeframe
          </div>
        </div>
      )}
      {chartErr && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-md bg-red-950/70 px-3 py-2 text-sm text-red-200 ring-1 ring-red-800">
            Chart error: {chartErr}
          </div>
        </div>
      )}
      {hasData && zoomed && !chartErr && !tvMode && (
        <div className="absolute top-2 left-2 z-10">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md bg-neutral-900/80 px-2 py-1 text-xs text-neutral-200 ring-1 ring-neutral-700 hover:bg-neutral-800"
            onClick={() => {
              const c = chartRef.current?.chart;
              if (!c) return;
              userZoomedRef.current = false;
              setZoomed(false);
              programmaticRangeChangeRef.current = true;
              try {
                c.timeScale().fitContent();
              } finally {
                setTimeout(() => {
                  programmaticRangeChangeRef.current = false;
                }, 0);
              }
            }}
          >
            Reset zoom
          </button>
        </div>
      )}
    </div>
  );
}

export default Chart;
