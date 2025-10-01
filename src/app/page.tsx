"use client";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CrosshairMode,
  CandlestickSeries,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
  type IChartApi,
} from "lightweight-charts";
import axios from "axios";
import { z } from "zod";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MarketRef, PricePoint } from "@/lib/types";
import { buildCandles } from "@/lib/candles";
import { TimeSeries } from "@/lib/buffer";
import { useMarketWS } from "@/lib/useMarketWS";
import type { Candle as CandleType } from "@/lib/types";
import { TIMEFRAME_MINUTES, TIMEFRAME_SET, type TF, tfToMs } from "@/lib/timeframes";

// Minimal types for the Wake Lock API to avoid strict any
type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
};
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<unknown> };
};

const HistorySchema = z
  .object({ history: z.array(z.object({ t: z.number(), p: z.number() })) })
  .or(z.array(z.object({ t: z.number(), p: z.number() })));

// Format a duration like 1d 2h, 3h 15m, 5m 2s, or 12s
function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  let s = totalSeconds;
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  // Limit granularity: if days exist, show d h; else if hours exist, show h m s; else show m s
  if (d) return parts.slice(0, 2).join(" ");
  if (h) return parts.slice(0, 3).join(" ");
  return parts.slice(Math.max(0, parts.length - 2)).join(" ");
}

function useCandles(series: TimeSeries, backfill: PricePoint[], nowTs: number, delayMs: number, tf: TF) {
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

function BigPercent({
  series,
  nowTs,
  delayMs,
  label,
  tvMode,
}: {
  series: TimeSeries;
  nowTs: number;
  delayMs: number;
  label?: string;
  tvMode?: boolean;
}) {
  const displayTs = nowTs - delayMs;
  // Spoiler-safe: only use last point at or before displayTs (no forward interpolation).
  const pt = series.atOrBefore(displayTs as number);
  if (!pt) {
    const arr = series.toArray();
    const secs = (() => {
      if (arr.length === 0) return null;
      const earliest = arr[0]?.t ?? 0;
      const remainingMs = earliest + delayMs - nowTs;
      if (remainingMs <= 0) return 0;
      return Math.ceil(remainingMs / 1000);
    })();
    return (
      <div className="my-6 text-center">
        <div className={`font-extrabold tracking-tight ${tvMode ? "text-[clamp(3rem,10vw,10rem)]" : "text-7xl"}`}>
          {secs != null ? `${secs}s` : "…"}
        </div>
        <div className={`${tvMode ? "text-xl sm:text-2xl" : "text-sm sm:text-base"} text-neutral-400`}>
          {label ? `${label} to win • ` : ""}
          {secs != null ? "data available soon" : "waiting for market data"}
        </div>
      </div>
    );
  }
  const pct = (pt.p * 100).toFixed(1);
  return (
    <div className="my-6 text-center">
      <div className={`font-extrabold tracking-tight ${tvMode ? "text-[clamp(3rem,10vw,10rem)]" : "text-7xl"}`}>
        {pct}%
      </div>
      <div className={`${tvMode ? "text-2xl sm:text-3xl" : "text-base sm:text-lg"} text-neutral-300`}>
        {label ?? "Outcome"} to win
      </div>
    </div>
  );
}

function Chart({
  candles,
  height = 320,
  tvMode = false,
}: {
  candles: ReturnType<typeof buildCandles>;
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
        // Enable wheel and pinch zoom by default; track when the user interacts
        // Nudge view slightly so last candle isn't flush with edge
        chart.timeScale().applyOptions({ rightOffset: 5 });

        // mark user zoom interaction to stop auto-fit until reset
        const ts = chart.timeScale();
        const handleVisibleLogicalRangeChange = () => {
          // Mark user interaction when not programmatic, but always recompute zoom state
          if (!programmaticRangeChangeRef.current) {
            userZoomedRef.current = true;
          }
          // Debounce recompute slightly to avoid rapid toggling
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
      // Recompute zoom state on resize (throttled by rAF)
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
        // Recompute zoom state after data updates
        // Avoid thrash: only recompute if user has interacted or we previously applied initial window
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
      {/* Reset zoom button (hidden in TV mode) */}
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

function HomeContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQS = searchParams?.toString() ?? "";
  const [mounted, setMounted] = useState(false);
  const [nowTs, setNowTs] = useState(0);
  useEffect(() => {
    setMounted(true);
    setNowTs(Date.now());
    const id = setInterval(() => setNowTs(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const [marketUrl, setMarketUrl] = useState("");
  const [market, setMarket] = useState<MarketRef | null>(null);
  const [delaySec, setDelaySec] = useState(30);
  const [tf, setTf] = useState<TF>(5);
  const [pov, setPov] = useState<"YES" | "NO">("YES");
  const delayMs = delaySec * 1000;
  const [tvMode, setTvMode] = useState(false);
  const [tvHintRender, setTvHintRender] = useState(false);
  const [tvHintVisible, setTvHintVisible] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Auto keep screen awake in TV mode
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const interactionRetryRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function requestWakeLock() {
      try {
        const nav = navigator as NavigatorWithWakeLock;
        if (!nav.wakeLock) return; // unsupported
        const sentinel = (await nav.wakeLock.request("screen")) as unknown as WakeLockSentinelLike;
        if (cancelled) {
          try {
            await sentinel.release();
          } catch {}
          return;
        }
        wakeLockRef.current = sentinel;
        sentinel.addEventListener?.("release", () => {
          // auto re-acquire if desired; we'll re-acquire on visibility change below
        });
      } catch (e) {
        console.warn("[WakeLock] request failed", e);
        // Safari often requires a user gesture. Set up a one-time retry on next interaction.
        if (!interactionRetryRef.current) {
          const retry = async () => {
            interactionRetryRef.current = null;
            document.removeEventListener("click", retry);
            document.removeEventListener("touchend", retry);
            await requestWakeLock();
          };
          interactionRetryRef.current = retry;
          document.addEventListener("click", retry, { once: true });
          document.addEventListener("touchend", retry, { once: true });
        }
      }
    }

    function handleVisibility() {
      if (document.visibilityState === "visible" && tvMode) {
        requestWakeLock();
      }
    }

    if (tvMode) {
      requestWakeLock();
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (interactionRetryRef.current) {
        const fn = interactionRetryRef.current;
        interactionRetryRef.current = null;
        document.removeEventListener("click", fn);
        document.removeEventListener("touchend", fn);
      }
      const s = wakeLockRef.current;
      wakeLockRef.current = null;
      if (s) s.release().catch(() => {});
    };
  }, [tvMode]);

  // TV mode: keyboard shortcut to toggle fullscreen and small hint
  useEffect(() => {
    if (!tvMode) return;
    setTvHintRender(true);
    setTvHintVisible(true);
    const hideTimer = setTimeout(() => setTvHintVisible(false), 5000);

    const isFs = () => Boolean(document.fullscreenElement);
    const toggleFs = async () => {
      try {
        if (isFs()) {
          await document.exitFullscreen?.();
        } else {
          await document.documentElement.requestFullscreen?.();
        }
      } catch {}
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setTvHintVisible(false);
        toggleFs();
      }
    };
    const onPointer = () => setTvHintVisible(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      clearTimeout(hideTimer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [tvMode]);

  // Unmount the hint after fade-out
  useEffect(() => {
    if (!tvMode) {
      setTvHintRender(false);
      setTvHintVisible(false);
      return;
    }
    if (!tvHintRender) return;
    if (tvHintVisible) return;
    const t = setTimeout(() => setTvHintRender(false), 300);
    return () => clearTimeout(t);
  }, [tvMode, tvHintRender, tvHintVisible]);

  // Track fullscreen state globally
  useEffect(() => {
    const updateFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    updateFs();
    document.addEventListener("fullscreenchange", updateFs);
    return () => document.removeEventListener("fullscreenchange", updateFs);
  }, []);

  // Allow exiting fullscreen with 'F' even when TV mode is off
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key && e.key.toLowerCase() === "f") {
        if (!tvMode) {
          e.preventDefault();
          document.exitFullscreen?.();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen, tvMode]);

  // Global: toggle TV mode with 't' (ignore when typing or with modifiers)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.key || e.key.toLowerCase() !== "t") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName || "").toLowerCase();
      const editing = tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
      if (editing) return;
      e.preventDefault();
      setTvMode((prev) => !prev);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { seriesYes, seriesNo } = useMarketWS(market?.yesTokenId, market?.noTokenId);
  const [backfillYes, setBackfillYes] = useState<PricePoint[]>([]);
  const [backfillNo, setBackfillNo] = useState<PricePoint[]>([]);
  const activeSeries = pov === "YES" ? seriesYes : seriesNo;
  const activeBackfill = pov === "YES" ? backfillYes : backfillNo;
  const candles = useCandles(activeSeries, activeBackfill, nowTs, delayMs, tf);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const lastResolvedRef = useRef<string>("");
  const isLikelyUrl = useCallback((u: string) => {
    try {
      const parsed = new URL(u);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, []);

  const resolveUrl = useCallback(
    async (u?: string) => {
      setError(null);
      const target = (u ?? marketUrl).trim();
      if (!target) return;
      try {
        setResolving(true);
        console.debug("[Resolve] POST /api/resolve", { url: target });
        const { data } = await axios.post("/api/resolve", { url: target });
        console.debug("[Resolve] Response:", data);
        const m = data as MarketRef;
        setMarket(m);
        setBackfillYes([]);
        setBackfillNo([]);
        lastResolvedRef.current = target;
      } catch (e: unknown) {
        let message = "Failed to resolve market";
        if (e instanceof Error) message = e.message;
        console.error("[Resolve] Error:", e);
        setError(message);
        setMarket(null);
        setBackfillYes([]);
        setBackfillNo([]);
      } finally {
        setResolving(false);
      }
    },
    [marketUrl],
  );

  // Sync state from URL params
  useEffect(() => {
    if (!mounted) return;
    const qs = new URLSearchParams(currentQS);
    const nextUrl = qs.get("url") ?? "";
    setMarketUrl((prev) => (prev !== nextUrl ? nextUrl : prev));

    const dStr = qs.get("delay");
    const d = dStr != null ? Number.parseInt(dStr) : NaN;
    if (!Number.isNaN(d)) {
      const clamped = Math.max(0, Math.min(600, d));
      setDelaySec((prev) => (prev !== clamped ? clamped : prev));
    }

    const tfStr = qs.get("tf");
    const tfNum = tfStr != null ? Number.parseInt(tfStr) : NaN;
    if (!Number.isNaN(tfNum) && TIMEFRAME_SET.has(tfNum)) {
      setTf((prev) => (prev !== tfNum ? (tfNum as TF) : prev));
    }

    const povStr = (qs.get("pov") ?? "").toUpperCase();
    if (povStr === "YES" || povStr === "NO") {
      setPov((prev) => (prev !== povStr ? (povStr as "YES" | "NO") : prev));
    }

    const mode = (qs.get("mode") ?? "").toLowerCase();
    const tv = mode === "tv" || mode === "1" || mode === "true";
    setTvMode((prev) => (prev !== tv ? tv : prev));
  }, [mounted, currentQS]);

  // Push state to URL params (without reload)
  useEffect(() => {
    if (!mounted) return;
    const params = new URLSearchParams(currentQS);
    const prevUrl = params.get("url") ?? "";
    if (marketUrl) params.set("url", marketUrl);
    else params.delete("url");
    params.set("delay", String(delaySec));
    params.set("tf", String(tf));
    params.set("pov", pov.toLowerCase());
    if (tvMode) params.set("mode", "tv");
    else params.delete("mode");
    const next = params.toString();
    const current = currentQS;
    if (next !== current) {
      const t = setTimeout(() => {
        // Avoid writing while the user is mid-change: if url param equals the input, or empty changes.
        const shouldWrite = (marketUrl || prevUrl) && next !== current;
        if (shouldWrite) router.replace(`${pathname}?${next}`, { scroll: false });
      }, 300);
      return () => clearTimeout(t);
    }
  }, [mounted, marketUrl, delaySec, tf, pov, tvMode, pathname, router, currentQS]);

  // Autoload market if URL contains one
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (!mounted || autoLoadedRef.current) return;
    const url = new URLSearchParams(currentQS).get("url") ?? "";
    if (url && !market) {
      autoLoadedRef.current = true;
      // do not reset input if user has already started typing something else
      setMarketUrl((prev) => (prev ? prev : url));
      resolveUrl(url);
    }
  }, [mounted, currentQS, market, resolveUrl]);

  // Auto-resolve when the input URL changes (debounced)
  useEffect(() => {
    if (!mounted) return;
    const target = marketUrl.trim();
    if (!target) return;
    if (!isLikelyUrl(target)) return; // avoid 500 from /api/resolve on non-URL text
    if (target === lastResolvedRef.current) return;
    const id = setTimeout(() => {
      // ensure still current and not already resolved
      if (marketUrl.trim() === target && target !== lastResolvedRef.current) {
        resolveUrl(target);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [mounted, marketUrl, isLikelyUrl, resolveUrl]);

  // Fetch YES and NO history whenever market or timeframe changes
  useEffect(() => {
    if (!market) return;
    (async () => {
      try {
        const yesId = market.yesTokenId;
        const noId = market.noTokenId;
        console.debug("[History] batch fetch", { yesId, noId, fidelity: String(tf) });
        // Always request highest available fidelity (1m) then aggregate locally for chosen timeframe
        const [yesRes, noRes] = await Promise.allSettled([
          axios.get("/api/history", { params: { tokenId: yesId, fidelity: "1" } }),
          axios.get("/api/history", { params: { tokenId: noId, fidelity: "1" } }),
        ]);
        if (yesRes.status === "fulfilled") {
          try {
            const parsed = HistorySchema.parse(yesRes.value.data);
            const history = Array.isArray(parsed) ? parsed : parsed.history;
            setBackfillYes(history.map((h) => ({ t: h.t * 1000, p: h.p })));
          } catch (e) {
            console.warn("[History] YES parse failed", e);
            setBackfillYes([]);
          }
        } else {
          console.warn("[History] YES fetch failed", yesRes.reason);
          setBackfillYes([]);
        }
        if (noRes.status === "fulfilled") {
          try {
            const parsed = HistorySchema.parse(noRes.value.data);
            const history = Array.isArray(parsed) ? parsed : parsed.history;
            setBackfillNo(history.map((h) => ({ t: h.t * 1000, p: h.p })));
          } catch (e) {
            console.warn("[History] NO parse failed", e);
            setBackfillNo([]);
          }
        } else {
          console.warn("[History] NO fetch failed", noRes.reason);
          setBackfillNo([]);
        }
      } catch (err) {
        console.error("[History] batch fetch unexpected error", err);
        setBackfillYes([]);
        setBackfillNo([]);
      }
    })();
  }, [market, tf]);

  // Relative countdown to market end (if available)
  const endsDeltaMs = useMemo(() => {
    if (!market?.endDateIso) return null;
    const t = Date.parse(market.endDateIso);
    if (Number.isNaN(t)) return null;
    return t - nowTs;
  }, [market?.endDateIso, nowTs]);

  if (!mounted) {
    return (
      <main className="min-h-screen bg-black text-slate-200">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <h1 className="text-2xl font-semibold">Polymarket Viewer</h1>
          <div className="mt-4 flex items-center gap-2">
            <input
              className="flex-1 rounded-md bg-neutral-900 px-3 py-2 ring-1 ring-neutral-800 outline-none"
              placeholder="Paste Polymarket URL (event or market)"
              value={marketUrl}
              onChange={(e) => setMarketUrl(e.target.value)}
            />
            {resolving && (
              <span className="inline-flex items-center gap-2 text-xs text-slate-300">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
                Resolving...
              </span>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-slate-200">
      <div className={`mx-auto ${tvMode ? "max-w-6xl" : "max-w-4xl"} px-4 py-6`}>
        <div className="flex items-center justify-between gap-4">
          <h1
            className={`font-semibold ${tvMode && market ? "line-clamp-2 text-base text-slate-300 sm:text-lg md:text-xl" : "text-xl sm:text-2xl"}`}
          >
            {tvMode && market ? market.question || "" : "Polymarket Viewer"}
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`inline-flex items-center gap-2 rounded-md bg-neutral-900 px-3 py-1.5 text-xs ring-1 transition sm:text-sm ${shareStatus === "copied" ? "text-emerald-200 ring-emerald-600" : "text-neutral-300 ring-neutral-700 hover:ring-neutral-500"}`}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  setShareStatus("copied");
                  setTimeout(() => setShareStatus("idle"), 1200);
                } catch {
                  setShareStatus("failed");
                  setTimeout(() => setShareStatus("idle"), 1200);
                }
              }}
              aria-label="Copy shareable link"
              title="Copy shareable link"
            >
              {shareStatus === "idle" && "Share"}
              {shareStatus === "copied" && "✅ Copied"}
              {shareStatus === "failed" && "❌ Failed"}
            </button>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tvMode}
                onChange={(e) => setTvMode(e.target.checked)}
                className="h-4 w-4 accent-neutral-500"
              />
              TV mode
            </label>
          </div>
        </div>
        {tvMode && tvHintRender && (
          <div
            className={`pointer-events-none fixed inset-x-0 top-2 z-50 flex justify-center transition-opacity duration-300 ${tvHintVisible ? "opacity-100" : "opacity-0"}`}
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-neutral-900/95 px-3 py-1 text-xs text-neutral-200 shadow-lg ring-1 ring-neutral-700">
              Press F to toggle fullscreen
            </span>
          </div>
        )}
        {!tvMode && (
          <div className="mt-4 flex items-center gap-3">
            <input
              className="flex-1 rounded-md bg-neutral-900 px-3 py-2 ring-1 ring-neutral-800 outline-none focus:ring-indigo-500"
              placeholder="Paste Polymarket URL (event or market)"
              value={marketUrl}
              onChange={(e) => setMarketUrl(e.target.value)}
            />
            {resolving && (
              <span className="inline-flex items-center gap-2 text-xs text-slate-300">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
                Resolving...
              </span>
            )}
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-red-200">{error}</div>
        )}
        {market && (
          <div className="mt-4">
            {!tvMode && (
              <div className="line-clamp-2 text-base text-slate-300 sm:text-lg md:text-xl">{market.question}</div>
            )}
            {!tvMode && (
              <div className="relative mt-3 flex flex-wrap items-center gap-3 pl-3 before:absolute before:top-1/2 before:left-0 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-neutral-700">
                <div className="flex items-center gap-2 text-sm">
                  <span>Outcome</span>
                  <div className="inline-flex overflow-hidden rounded-md bg-neutral-900 ring-1 ring-neutral-800">
                    <button
                      type="button"
                      className={`px-4 py-2 text-sm font-semibold ${pov === "YES" ? "bg-neutral-700 text-white" : "text-slate-300 hover:bg-neutral-800"}`}
                      onClick={() => setPov("YES")}
                    >
                      {market?.yesLabel ?? "YES"}
                    </button>
                    <button
                      type="button"
                      className={`px-4 py-2 text-sm font-semibold ${pov === "NO" ? "bg-neutral-700 text-white" : "text-slate-300 hover:bg-neutral-800"}`}
                      onClick={() => setPov("NO")}
                    >
                      {market?.noLabel ?? "NO"}
                    </button>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  Delay
                  <input
                    type="number"
                    min={0}
                    max={600}
                    className="w-20 rounded bg-neutral-900 px-2 py-1 ring-1 ring-neutral-800"
                    value={delaySec}
                    onChange={(e) => setDelaySec(Number(e.target.value))}
                  />
                  s
                </label>
                <label className="flex items-center gap-2 text-sm">
                  Candle size
                  <select
                    className="rounded bg-neutral-900 px-2 py-1 ring-1 ring-neutral-800"
                    value={tf}
                    onChange={async (e) => {
                      const v = Number(e.target.value) as TF;
                      setTf(v);
                    }}
                  >
                    {TIMEFRAME_MINUTES.map((m) => (
                      <option key={m} value={m}>
                        {m}m
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div
                className={`flex items-center gap-2 rounded-full bg-neutral-900 text-slate-300 ring-1 ring-neutral-800 ${tvMode ? "px-4 py-2 text-base sm:text-lg" : "px-3 py-1.5 text-xs sm:text-sm"}`}
              >
                {delaySec === 0 ? (
                  <>
                    <span aria-hidden="true" className={`relative flex ${tvMode ? "h-3 w-3" : "h-2.5 w-2.5"}`}>
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
                      <span
                        className={`relative inline-flex rounded-full bg-emerald-400 ${tvMode ? "h-3 w-3" : "h-2.5 w-2.5"}`}
                      />
                    </span>
                    <span>Live</span>
                  </>
                ) : (
                  <span>{`Delayed by ${Math.floor(delaySec / 60)}:${String(delaySec % 60).padStart(2, "0")}`}</span>
                )}
              </div>
              {!tvMode && endsDeltaMs != null && (
                <div className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs text-neutral-400 ring-1 ring-neutral-800 sm:text-sm">
                  {endsDeltaMs > 0
                    ? `Ends in ${formatDuration(endsDeltaMs)}`
                    : `Ended ${formatDuration(-endsDeltaMs)} ago`}
                </div>
              )}
              {!tvMode && market?.slug && (
                <a
                  href={`https://polymarket.com/market/${market.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 ring-1 ring-neutral-800 hover:ring-neutral-600 sm:text-sm"
                >
                  Open on Polymarket
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                    <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3z" />
                    <path d="M5 5h6v2H7v10h10v-4h2v6H5z" />
                  </svg>
                </a>
              )}
            </div>
            <BigPercent
              series={activeSeries}
              nowTs={nowTs}
              delayMs={delayMs}
              label={pov === "YES" ? market?.yesLabel : market?.noLabel}
              tvMode={tvMode}
            />
            <div className="mt-4">
              <Chart candles={candles} height={tvMode ? 480 : 360} tvMode={tvMode} />
            </div>
          </div>
        )}
        {!tvMode && (
          <div className="mt-10 border-t border-neutral-800 pt-6 text-center">
            <div className="text-sm text-neutral-400 sm:text-base">
              Made with{" "}
              <span role="img" aria-label="love" className="mx-1">
                ❤️
              </span>{" "}
              by{" "}
              <a
                href="https://dylanwheeler.net"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-neutral-700 underline-offset-4 hover:text-neutral-200 hover:decoration-neutral-400"
              >
                Dylan
              </a>
            </div>
            <a
              href="https://github.com/Confiqure/polymarket-viewer"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 ring-1 ring-neutral-700 hover:ring-neutral-500 sm:text-sm"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                <path d="M12 .5C5.73.5.95 5.28.95 11.55c0 4.86 3.16 8.98 7.55 10.43.55.1.75-.24.75-.53 0-.26-.01-1.13-.02-2.05-3.07.67-3.72-1.31-3.72-1.31-.5-1.27-1.22-1.61-1.22-1.61-.99-.68.07-.66.07-.66 1.09.08 1.66 1.12 1.66 1.12.97 1.65 2.54 1.18 3.16.9.1-.7.38-1.18.69-1.45-2.45-.28-5.02-1.23-5.02-5.48 0-1.21.43-2.19 1.12-2.96-.11-.28-.49-1.41.11-2.93 0 0 .92-.29 3.02 1.13a10.5 10.5 0 0 1 2.75-.37c.93 0 1.86.12 2.75.37 2.1-1.42 3.02-1.13 3.02-1.13.6 1.52.22 2.65.11 2.93.69.77 1.12 1.75 1.12 2.96 0 4.26-2.58 5.2-5.04 5.47.39.34.73 1.01.73 2.04 0 1.47-.01 2.65-.01 3.01 0 .29.2.64.75.53 4.39-1.45 7.55-5.57 7.55-10.43C23.05 5.28 18.27.5 12 .5z" />
              </svg>
              View source on GitHub
            </a>
          </div>
        )}
      </div>
    </main>
  );
}

export default function Home() {
  // Wrap client navigation hooks usage in Suspense to allow CSR bailout during SSG
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-black text-slate-200">
          <div className="mx-auto max-w-4xl px-4 py-6">
            <h1 className="text-2xl font-semibold">Polymarket Viewer</h1>
            <div className="mt-4 h-6 w-40 animate-pulse rounded bg-neutral-800" />
          </div>
        </main>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
