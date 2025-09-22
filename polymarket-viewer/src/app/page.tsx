"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createChart, CrosshairMode, type ISeriesApi, type CandlestickData, type UTCTimestamp } from "lightweight-charts";
import axios from "axios";
import { z } from "zod";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MarketRef, PricePoint } from "@/lib/types";
import { buildCandles } from "@/lib/candles";
import { lerpAt, TimeSeries } from "@/lib/buffer";
import { useMarketWS } from "@/lib/useMarketWS";
import type { Candle as CandleType } from "@/lib/types";

const HistorySchema = z
  .object({ history: z.array(z.object({ t: z.number(), p: z.number() })) })
  .or(z.array(z.object({ t: z.number(), p: z.number() })));

type TF = 1 | 5 | 15 | 60;
const TF_MINUTES: TF[] = [1, 5, 15, 60];

function useCandles(series: TimeSeries, backfill: PricePoint[], nowTs: number, delayMs: number, tf: TF) {
  const intervalMs = tf * 60_000;
  return useMemo(() => {
    const displayCutoff = nowTs - delayMs;
    const live = series.toArray().filter((p) => p.t <= displayCutoff);
    return buildCandles([...backfill, ...live], intervalMs);
  }, [series, backfill, nowTs, delayMs, intervalMs]);
}

function BigPercent({ series, nowTs, delayMs, label }: { series: TimeSeries; nowTs: number; delayMs: number; label?: string }) {
  const displayTs = nowTs - delayMs;
  const pt = lerpAt(series, displayTs);
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
        <div className="text-7xl font-extrabold tracking-tight">
          {secs != null ? `${secs}s` : "…"}
        </div>
        <div className="text-sm text-neutral-400">{secs != null ? "Spoiler protection: data available soon" : "Waiting for market data"}</div>
      </div>
    );
  }
  const pct = (pt.p * 100).toFixed(1);
  return (
    <div className="text-center my-6">
      <div className="text-7xl font-extrabold tracking-tight">{pct}%</div>
      <div className="text-sm text-neutral-400">Probability ({label ?? "YES"})</div>
    </div>
  );
}

function Chart({ candles }: { candles: ReturnType<typeof buildCandles> }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<{ chart: ReturnType<typeof createChart>; series: ISeriesApi<"Candlestick"> } | null>(null);
  useEffect(() => {
    let dispose: (() => void) | undefined;
    (async () => {
      if (!ref.current) return;
      const opts = {
        height: 320,
        layout: { textColor: "#cbd5e1", background: { color: "transparent" } },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false },
        crosshair: { mode: CrosshairMode.Magnet },
        grid: { horzLines: { color: "#1f2937" }, vertLines: { color: "#1f2937" } },
      };
      const chart = createChart(ref.current, opts);
      const series = (chart as unknown as { addSeries: (opts: Record<string, unknown>) => ISeriesApi<"Candlestick"> }).addSeries({
        type: "Candlestick",
        upColor: "#10b981",
        downColor: "#ef4444",
        wickUpColor: "#10b981",
        wickDownColor: "#ef4444",
        borderVisible: false,
      });
      chartRef.current = { chart, series };
      dispose = () => chart.remove();
    })();
    return () => dispose?.();
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    const { series, chart } = chartRef.current;
    const data: CandlestickData<UTCTimestamp>[] = candles.map((c: CandleType) => ({
      time: Math.floor(c.t / 1000) as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    series.setData(data as unknown as (CandlestickData<UTCTimestamp>)[]);
    chart.timeScale().fitContent();
  }, [candles]);

  return <div ref={ref} className="w-full h-[320px] rounded-lg border border-neutral-800" />;
}

export default function Home() {
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

  const { seriesYes, seriesNo, tob } = useMarketWS(market?.yesTokenId, market?.noTokenId);
  const [backfill, setBackfill] = useState<PricePoint[]>([]);
  const activeSeries = pov === "YES" ? seriesYes : seriesNo;
  const candles = useCandles(activeSeries, backfill, nowTs, delayMs, tf);
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
      setBackfill([]);
      lastResolvedRef.current = target;
    } catch (e: unknown) {
      let message = "Failed to resolve market";
      if (e instanceof Error) message = e.message;
      console.error("[Resolve] Error:", e);
      setError(message);
      setMarket(null);
      setBackfill([]);
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
    const allowed = new Set<number>([1, 5, 15, 60]);
    if (!Number.isNaN(tfNum) && allowed.has(tfNum)) {
      setTf((prev) => (prev !== tfNum ? (tfNum as TF) : prev));
    }

    const povStr = (qs.get("pov") ?? "").toUpperCase();
    if (povStr === "YES" || povStr === "NO") {
      setPov((prev) => (prev !== povStr ? (povStr as "YES" | "NO") : prev));
    }
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
  }, [mounted, marketUrl, delaySec, tf, pov, pathname, router, currentQS]);

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

  // Fetch history whenever market/tf changes
  useEffect(() => {
    if (!market) return;
    (async () => {
      try {
        console.debug("[History] GET /api/history", { tokenId: market.yesTokenId, fidelity: String(tf) });
        const res = await axios.get("/api/history", { params: { tokenId: market.yesTokenId, fidelity: String(tf) } });
        const parsed = HistorySchema.parse(res.data);
        const history = Array.isArray(parsed) ? parsed : parsed.history;
        setBackfill(history.map((h) => ({ t: h.t * 1000, p: h.p })));
      } catch (err) {
        console.error("[History] fetch failed", err);
        setBackfill([]);
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
      <div className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-2xl font-semibold">Polymarket Viewer</h1>
        <div className="mt-4 flex items-center gap-2">
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
        {error && (
          <div className="mt-3 rounded-md bg-red-950 text-red-200 px-3 py-2 border border-red-800">{error}</div>
        )}
        {market && (
          <div className="mt-4">
            <div className="text-lg text-slate-300">{market.question}</div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="text-xs rounded-full bg-neutral-900 px-2 py-1 ring-1 ring-neutral-800">
                {delaySec === 0 ? "Live" : `Delayed by ${Math.floor(delaySec / 60)}:${String(delaySec % 60).padStart(2, "0")}`}
              </div>
              {(() => {
                const tokenId = pov === "YES" ? market?.yesTokenId : market?.noTokenId;
                if (!tokenId) return null;
                const t = tob[tokenId];
                if (t?.bestBid == null || t?.bestAsk == null) return null;
                return (
                  <div className="text-xs rounded-full bg-neutral-900 px-2 py-1 ring-1 ring-neutral-800">
                    Spread: {Math.round((t.bestAsk! - t.bestBid!) * 100)}¢
                  </div>
                );
              })()}
              <div className="flex items-center gap-2 text-sm">
                <span>Outcome</span>
                <div className="inline-flex overflow-hidden rounded-md ring-1 ring-neutral-800 bg-neutral-900">
                  <button
                    type="button"
                    className={`px-3 py-1 text-xs ${pov === "YES" ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-neutral-800"}`}
                    onClick={() => setPov("YES")}
                  >
                    {market.yesLabel ?? "YES"}
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1 text-xs ${pov === "NO" ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-neutral-800"}`}
                    onClick={() => setPov("NO")}
                  >
                    {market.noLabel ?? "NO"}
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                Delay
                <input type="range" min={0} max={600} value={delaySec} onChange={(e) => setDelaySec(Number(e.target.value))} />
                <input type="number" min={0} max={600} className="w-20 rounded bg-neutral-900 px-2 py-1 ring-1 ring-neutral-800" value={delaySec} onChange={(e) => setDelaySec(Number(e.target.value))} />
                s
              </label>
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
                  {TF_MINUTES.map((m) => (
                    <option key={m} value={m}>{m}m</option>
                  ))}
                </select>
              </label>
            </div>

            <BigPercent
              series={activeSeries}
              nowTs={nowTs}
              delayMs={delayMs}
              label={pov === "YES" ? market.yesLabel : market.noLabel}
            />

            <div className="mt-4">
              <Chart candles={candles} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
