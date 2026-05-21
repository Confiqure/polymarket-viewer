"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  createChart,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
  type IChartApi,
  TickMarkType,
} from "lightweight-charts";
import type { Candle as CandleType } from "@/lib/types";

export function Chart({
  candles,
  height = 320,
  tvMode = false,
  showMidpoint = true,
  historyLoading = false,
  historyError = null,
  onRetryHistory,
}: {
  candles: Array<CandleType>;
  height?: number;
  tvMode?: boolean;
  showMidpoint?: boolean;
  historyLoading?: boolean;
  historyError?: string | null;
  onRetryHistory?: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<{
    chart: IChartApi;
    series: ISeriesApi<"Candlestick">;
    midpointSeries: ISeriesApi<"Line">;
  } | null>(null);
  const [chartErr, setChartErr] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
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
      const h = Math.floor((cr?.height ?? el.clientHeight) || 0);
      setContainerWidth(w);
      setContainerHeight(h);
    });
    ro.observe(el);
    // Seed initial size
    const initialW = Math.floor(el.clientWidth || 0);
    const initialH = Math.floor(el.clientHeight || 0);
    if (initialW) setContainerWidth(initialW);
    if (initialH) setContainerHeight(initialH);
    return () => ro.disconnect();
  }, []);

  // Init or resize chart when size changes
  useLayoutEffect(() => {
    setChartErr(null);
    try {
      const el = ref.current;
      if (!el) return;
      const targetHeight = tvMode ? containerHeight : height;
      if (containerWidth <= 0 || targetHeight <= 0) return;

      if (!chartRef.current) {
        const chart = createChart(el, {
          width: containerWidth,
          height: targetHeight,
          layout: { textColor: "#cbd5e1", background: { color: "transparent" } },
          rightPriceScale: { borderVisible: false },
          timeScale: {
            borderVisible: false,
            timeVisible: true,
            secondsVisible: false,
            tickMarkFormatter: (time: number, tickMarkType: TickMarkType, locale: string) => {
              const date = new Date(time * 1000);
              switch (tickMarkType) {
                case TickMarkType.Year:
                  return date.getFullYear().toString();
                case TickMarkType.Month:
                  return date.toLocaleDateString(locale, { month: "short" });
                case TickMarkType.DayOfMonth:
                  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
                case TickMarkType.Time:
                  return date.toLocaleTimeString(locale, { hour: "numeric", minute: "numeric" });
                case TickMarkType.TimeWithSeconds:
                  return date.toLocaleTimeString(locale, { hour: "numeric", minute: "numeric", second: "numeric" });
                default:
                  return "";
              }
            },
          },
          localization: { timeFormatter: (t: number) => new Date(t * 1000).toLocaleString() },
          crosshair: { mode: CrosshairMode.Magnet },
          grid: { horzLines: { color: "#1f2937" }, vertLines: { color: "#1f2937" } },
        });
        // Official v5 API: supply series definition constant first argument
        type ChartWithAdd = IChartApi & {
          addSeries: <T extends "Candlestick" | "Line">(def: unknown, opts?: unknown) => ISeriesApi<T>;
        };
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
        }) as ISeriesApi<"Candlestick">;

        // Add midpoint line series
        const midpointSeries = cwa.addSeries(LineSeries, {
          color: "#64748b", // slate-500
          lineWidth: 1,
          lineStyle: 2, // Dashed
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        }) as ISeriesApi<"Line">;

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

        chartRef.current = { chart, series, midpointSeries };
        return () => {
          try {
            ts.unsubscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange);
          } catch {}
          chart.remove();
          chartRef.current = null;
        };
      }

      chartRef.current.chart.applyOptions({ width: containerWidth, height: targetHeight });
      requestAnimationFrame(() => recomputeZoomState());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Chart init failed";
      console.error("[Chart] init error", e);
      setChartErr(msg);
    }
  }, [containerWidth, containerHeight, height, tvMode, recomputeZoomState]);

  // Set data on changes
  useEffect(() => {
    if (!chartRef.current) return;
    try {
      const { series, midpointSeries, chart } = chartRef.current;
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
      if (data.length === 0) return;
      // Detect series change (first timestamp change) and reset the initial window flag
      const firstTs = candles[0]?.t ?? null;
      if (firstTs !== prevSeriesStartRef.current) {
        prevSeriesStartRef.current = firstTs;
        appliedInitialWindowRef.current = false;
        userZoomedRef.current = false;
      }

      series.setData(data);

      // Update midpoint series
      if (showMidpoint) {
        const midpointData = data.map((d) => ({
          time: d.time,
          value: 0.5,
        }));
        midpointSeries.setData(midpointData);
      } else {
        midpointSeries.setData([]);
      }

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
  }, [candles, recomputeZoomState, showMidpoint]);

  const hasData = candles.length > 0;
  return (
    <div
      ref={ref}
      className={`relative w-full overflow-hidden rounded-xl bg-neutral-950/40 ring-1 ring-neutral-800 ${tvMode ? "h-full" : ""}`}
      style={!tvMode ? { height } : undefined}
    >
      {!hasData && historyError && (
        <div role="alert" className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 rounded-md bg-black/60 px-4 py-3 text-sm text-red-200 ring-1 ring-red-800">
            <span>Couldn&apos;t load price history</span>
            {onRetryHistory && (
              <button
                type="button"
                onClick={onRetryHistory}
                className="rounded-md bg-red-950 px-3 py-1 text-xs text-red-200 ring-1 ring-red-700 hover:bg-red-900"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}
      {!hasData && !historyError && historyLoading && (
        <div
          role="status"
          aria-label="Loading price history"
          className="pointer-events-none absolute inset-0 animate-pulse overflow-hidden p-4"
        >
          {/* faint horizontal gridlines */}
          <div className="absolute inset-4 flex flex-col justify-between">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-px w-full bg-neutral-700/50" />
            ))}
          </div>
          {/* candlestick-shaped placeholder bars */}
          <div className="relative flex h-full items-end gap-1 sm:gap-1.5">
            {Array.from({ length: 28 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-neutral-800"
                style={{ height: `${30 + ((i * 13 + 7) % 50)}%` }}
              />
            ))}
          </div>
        </div>
      )}
      {!hasData && !historyError && !historyLoading && (
        <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center">
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
