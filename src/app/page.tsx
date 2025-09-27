"use client";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createChart, CrosshairMode, CandlestickSeries, type ISeriesApi, type CandlestickData, type UTCTimestamp, type IChartApi } from "lightweight-charts";
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


function useCandles(series: TimeSeries, backfill: PricePoint[], nowTs: number, delayMs: number, tf: TF) {
  const intervalMs = tfToMs(tf);
  return useMemo(() => {
    const displayCutoff = nowTs - delayMs;
    // Filter both historical and live points so none newer than cutoff leak.
    const filteredBackfill = backfill.filter(p => p.t <= displayCutoff);
    const filteredLive = series.toArray().filter(p => p.t <= displayCutoff);
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

function BigPercent({ series, nowTs, delayMs, label, tvMode }: { series: TimeSeries; nowTs: number; delayMs: number; label?: string; tvMode?: boolean }) {
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
      <div className="text-center my-6">
        <div className={`font-extrabold tracking-tight ${tvMode ? "text-[clamp(3rem,10vw,10rem)]" : "text-7xl"}`}>
          {secs != null ? `${secs}s` : "…"}
        </div>
        <div className={`${tvMode ? "text-xl sm:text-2xl" : "text-sm sm:text-base"} text-neutral-400`}>
          {label ? `${label} to win • ` : ""}{secs != null ? "data available soon" : "waiting for market data"}
        </div>
      </div>
    );
  }
  const pct = (pt.p * 100).toFixed(1);
  return (
    <div className="text-center my-6">
      <div className={`font-extrabold tracking-tight ${tvMode ? "text-[clamp(3rem,10vw,10rem)]" : "text-7xl"}`}>{pct}%</div>
      <div className={`${tvMode ? "text-2xl sm:text-3xl" : "text-base sm:text-lg"} text-neutral-300`}>{label ?? "Outcome"} to win</div>
    </div>
  );
}

function Chart({ candles, height = 320 }: { candles: ReturnType<typeof buildCandles>; height?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<{ chart: IChartApi; series: ISeriesApi<"Candlestick"> } | null>(null);
  const [chartErr, setChartErr] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const userZoomedRef = useRef(false);
  const programmaticRangeChangeRef = useRef(false);

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
        // Broader interaction enablement (some options are version-specific)
        (chart as any).applyOptions?.({
          handleScale: {
            axisDoubleClickReset: true,
            mouseWheel: true,
            pinch: true,
            axisPressedMouseMove: { time: true, price: true },
          },
          handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: true,
          },
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
        chart.timeScale().applyOptions({
          wheelScroll: true,
          wheelScale: true,
          rightOffset: 5,
        } as any);

        // mark user zoom interaction to stop auto-fit until reset
        const ts = chart.timeScale();
        const handleVisibleLogicalRangeChange = () => {
          // Ignore programmatic changes (fitContent, etc.)
          if (programmaticRangeChangeRef.current) return;
          // Any other change implies user interaction
          userZoomedRef.current = true;
        };
        ts.subscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange);

        // Double click resets zoom to fit content
        const dbl = () => {
          userZoomedRef.current = false;
          programmaticRangeChangeRef.current = true;
          try {
            chart.timeScale().fitContent();
          } finally {
            // allow subscription to resume detecting manual changes
            setTimeout(() => { programmaticRangeChangeRef.current = false; }, 0);
          }
        };
        el.addEventListener("dblclick", dbl);

        chartRef.current = { chart, series };
        return () => {
          try {
            ts.unsubscribeVisibleLogicalRangeChange(handleVisibleLogicalRangeChange);
          } catch {}
          try {
            el.removeEventListener("dblclick", dbl);
          } catch {}
          chart.remove();
          chartRef.current = null;
        };
      }

      chartRef.current.chart.applyOptions({ width: containerWidth, height });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Chart init failed";
      console.error("[Chart] init error", e);
      setChartErr(msg);
    }
  }, [containerWidth, height]);

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
      series.setData(data);
      if (!userZoomedRef.current) {
        programmaticRangeChangeRef.current = true;
        try {
          chart.timeScale().fitContent();
        } finally {
          setTimeout(() => { programmaticRangeChangeRef.current = false; }, 0);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Chart data error";
      console.error("[Chart] data error", e);
      setChartErr(msg);
    }
  }, [candles]);

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
          try { await sentinel.release(); } catch {}
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

  const resolveUrl = useCallback(async (u?: string) => {
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
  }, [marketUrl]);

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
    if (marketUrl) params.set("url", marketUrl); else params.delete("url");
    params.set("delay", String(delaySec));
    params.set("tf", String(tf));
    params.set("pov", pov.toLowerCase());
    if (tvMode) params.set("mode", "tv"); else params.delete("mode");
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

  if (!mounted) {
    return (
      <main className="min-h-screen bg-black text-slate-200">
        <div className="mx-auto max-w-4xl px-4 py-6">
          <h1 className="text-2xl font-semibold">Polymarket Viewer</h1>
          <div className="mt-4 flex items-center gap-2">
            <input
              className="flex-1 rounded-md bg-neutral-900 px-3 py-2 outline-none ring-1 ring-neutral-800"
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
          <h1 className={`font-semibold ${tvMode && market ? "text-base sm:text-lg md:text-xl text-slate-300 line-clamp-2" : "text-xl sm:text-2xl"}`}>
            {tvMode && market ? (market.question || "") : "Polymarket Viewer"}
          </h1>
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
        {!tvMode && (
        <div className="mt-4 flex items-center gap-3">
          <input
            className="flex-1 rounded-md bg-neutral-900 px-3 py-2 outline-none ring-1 ring-neutral-800 focus:ring-indigo-500"
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
          <div className="mt-3 rounded-md bg-red-950 text-red-200 px-3 py-2 border border-red-800">{error}</div>
        )}
        {market && (
          <div className="mt-4">
            {!tvMode && (
              <div className="text-base sm:text-lg md:text-xl text-slate-300 line-clamp-2">{market.question}</div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="text-sm sm:text-base rounded-full bg-neutral-900 px-3 py-1.5 ring-1 ring-neutral-800 text-slate-300 flex items-center gap-2">
                {delaySec === 0 ? (
                  <>
                    <span aria-hidden="true" className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </span>
                    <span>Live</span>
                  </>
                ) : (
                  <span>{`Delayed by ${Math.floor(delaySec / 60)}:${String(delaySec % 60).padStart(2, "0")}`}</span>
                )}
              </div>
              {!tvMode && (
              <div className="flex items-center gap-2 text-sm">
                <span>Outcome</span>
                <div className="inline-flex overflow-hidden rounded-md ring-1 ring-neutral-800 bg-neutral-900">
                  <button
                    type="button"
                    className={`px-4 py-2 text-sm font-semibold ${pov === "YES" ? "bg-neutral-700 text-white" : "text-slate-300 hover:bg-neutral-800"}`}
                    onClick={() => setPov("YES")}
                  >
                    {market.yesLabel ?? "YES"}
                  </button>
                  <button
                    type="button"
                    className={`px-4 py-2 text-sm font-semibold ${pov === "NO" ? "bg-neutral-700 text-white" : "text-slate-300 hover:bg-neutral-800"}`}
                    onClick={() => setPov("NO")}
                  >
                    {market.noLabel ?? "NO"}
                  </button>
                </div>
              </div>
              )}
              {!tvMode && (
              <label className="flex items-center gap-2 text-sm">
                Delay
                <input type="range" min={0} max={600} value={delaySec} onChange={(e) => setDelaySec(Number(e.target.value))} />
                <input type="number" min={0} max={600} className="w-20 rounded bg-neutral-900 px-2 py-1 ring-1 ring-neutral-800" value={delaySec} onChange={(e) => setDelaySec(Number(e.target.value))} />
                s
              </label>
              )}
              {!tvMode && (
              <label className="flex items-center gap-2 text-sm">
                Timeframe
                <select
                  className="rounded bg-neutral-900 px-2 py-1 ring-1 ring-neutral-800"
                  value={tf}
                  onChange={async (e) => {
                    const v = Number(e.target.value) as TF;
                    setTf(v);
                  }}
                >
                  {TIMEFRAME_MINUTES.map((m) => (
                    <option key={m} value={m}>{m}m</option>
                  ))}
                </select>
              </label>
              )}
            </div>

            <BigPercent series={activeSeries} nowTs={nowTs} delayMs={delayMs} label={pov === "YES" ? market.yesLabel : market.noLabel} tvMode={tvMode} />

            <div className="mt-4">
              <Chart candles={candles} height={tvMode ? 480 : 360} />
            </div>
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
