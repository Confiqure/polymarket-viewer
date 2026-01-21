"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MarketRef } from "@/lib/types";
import { useMarketWS } from "@/lib/useMarketWS";
import { TIMEFRAME_SET, type TF } from "@/lib/timeframes";
import { formatDuration } from "@/lib/format";
import { useCandles, useWakeLock, useTvShortcuts, useMarketHistory, useResolveMarket } from "@/hooks";
import { Chart, OddsDisplay, Header, MarketControls, StatusBadge, TVHint, Footer, VerticalResizer } from "@/components";

export default function HomeContent() {
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
  const [showMidpoint, setShowMidpoint] = useState(true);
  const [displayFormat, setDisplayFormat] = useState<"percent" | "moneyline">("percent");
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [split, setSplit] = useState(45);
  useWakeLock(tvMode);
  const { tvHintRender, tvHintVisible } = useTvShortcuts(tvMode, setTvMode, setDisplayFormat);

  const { seriesYes, seriesNo } = useMarketWS(market?.yesTokenId, market?.noTokenId);
  const { backfillYes, backfillNo } = useMarketHistory(market);
  const activeSeries = pov === "YES" ? seriesYes : seriesNo;
  const activeBackfill = pov === "YES" ? backfillYes : backfillNo;
  const candles = useCandles(activeSeries, activeBackfill, nowTs, delayMs, tf);

  const { resolving, error, resolveNow } = useResolveMarket({
    marketUrl,
    enabled: mounted,
    onResolved: (m) => {
      setMarket(m);
    },
  });

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

    const midStr = qs.get("mid");
    if (midStr !== null) {
      const show = midStr === "1" || midStr === "true";
      setShowMidpoint((prev) => (prev !== show ? show : prev));
    }

    const disp = qs.get("display")?.toLowerCase();
    if (disp === "percent" || disp === "moneyline") {
      setDisplayFormat((prev) => (prev !== disp ? disp : prev));
    }

    const sStr = qs.get("split");
    const s = sStr != null ? Number.parseFloat(sStr) : NaN;
    if (!Number.isNaN(s)) {
      const clamped = Math.max(20, Math.min(80, s));
      setSplit((prev) => (prev !== clamped ? clamped : prev));
    }
  }, [mounted, currentQS]);

  // Push state to URL params (without reload)
  useEffect(() => {
    if (!mounted) return;
    const params = new URLSearchParams(currentQS);
    const prevUrl = params.get("url") ?? "";
    if (marketUrl) params.set("url", marketUrl);
    else params.delete("url");

    if (delaySec !== 30) params.set("delay", String(delaySec));
    else params.delete("delay");

    if (tf !== 5) params.set("tf", String(tf));
    else params.delete("tf");

    if (pov !== "YES") params.set("pov", pov.toLowerCase());
    else params.delete("pov");

    if (tvMode) params.set("mode", "tv");
    else params.delete("mode");

    if (showMidpoint) params.delete("mid");
    else params.set("mid", "0");

    if (displayFormat !== "percent") params.set("display", displayFormat);
    else params.delete("display");

    if (Math.round(split) !== 45) params.set("split", Math.round(split).toString());
    else params.delete("split");

    const next = params.toString();
    const current = currentQS;
    if (next !== current) {
      const t = setTimeout(() => {
        const shouldWrite = (marketUrl || prevUrl) && next !== current;
        if (shouldWrite) router.replace(`${pathname}?${next}`, { scroll: false });
      }, 300);
      return () => clearTimeout(t);
    }
  }, [mounted, marketUrl, delaySec, tf, pov, tvMode, showMidpoint, displayFormat, split, pathname, router, currentQS]);

  // Autoload market if URL contains one
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (!mounted || autoLoadedRef.current) return;
    const url = new URLSearchParams(currentQS).get("url") ?? "";
    if (url && !market) {
      autoLoadedRef.current = true;
      setMarketUrl((prev) => (prev ? prev : url));
      resolveNow(url);
    }
  }, [mounted, currentQS, market, resolveNow]);

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
    <main className={`bg-black text-slate-200 ${tvMode ? "h-screen overflow-hidden" : "min-h-screen"}`}>
      <div className={`mx-auto px-4 ${tvMode ? "flex h-full max-w-6xl flex-col py-2" : "max-w-4xl py-6"}`}>
        <Header
          title={tvMode && market ? market.question || "" : "Polymarket Viewer"}
          compact={Boolean(tvMode && market)}
          tvMode={tvMode}
          onToggleTv={setTvMode}
          shareStatus={shareStatus}
          onShare={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              setShareStatus("copied");
              setTimeout(() => setShareStatus("idle"), 1200);
            } catch {
              setShareStatus("failed");
              setTimeout(() => setShareStatus("idle"), 1200);
            }
          }}
        />
        <TVHint render={tvMode && tvHintRender} visible={tvHintVisible} />
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
            {error && <div className="rounded-md border border-red-800 bg-red-950 px-3 py-2 text-red-200">{error}</div>}
          </div>
        )}
        {market && (
          <div className={tvMode ? "mt-2 flex min-h-0 flex-1 flex-col" : "mt-4"}>
            {!tvMode && (
              <div className="line-clamp-2 text-base text-slate-300 sm:text-lg md:text-xl">{market.question}</div>
            )}
            <MarketControls
              tvMode={tvMode}
              pov={pov}
              yesLabel={market?.yesLabel}
              noLabel={market?.noLabel}
              onPovChange={setPov}
              delaySec={delaySec}
              onDelayChange={setDelaySec}
              tf={tf}
              onTfChange={setTf}
              showMidpoint={showMidpoint}
              onShowMidpointChange={setShowMidpoint}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <StatusBadge delaySec={delaySec} tvMode={tvMode} />
              {!tvMode && (
                <div className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs text-neutral-400 ring-1 ring-neutral-800 sm:text-sm">
                  {(() => {
                    if (market?.endDateIso) {
                      let iso = market.endDateIso;
                      // If YYYY-MM-DD, assume end of day (UTC)
                      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
                        iso = `${iso}T23:59:59Z`;
                      }
                      const t = Date.parse(iso);
                      if (!Number.isNaN(t)) {
                        const d = t - nowTs;
                        return d > 0 ? `Ends in ${formatDuration(d)}` : `Ended ${formatDuration(-d)} ago`;
                      }
                    }
                    return null;
                  })()}
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
            {/* Split container for TV mode */}
            <div className={tvMode ? "flex min-h-0 flex-1 flex-col py-4" : ""}>
              <div
                className={tvMode ? "flex min-h-0 flex-col justify-center" : ""}
                style={tvMode ? { flex: 100 - split } : undefined}
              >
                <OddsDisplay
                  series={activeSeries}
                  nowTs={nowTs}
                  delayMs={delayMs}
                  label={pov === "YES" ? market?.yesLabel : market?.noLabel}
                  tvMode={tvMode}
                  displayFormat={displayFormat}
                  onToggleFormat={() => setDisplayFormat((v) => (v === "percent" ? "moneyline" : "percent"))}
                />
              </div>
              <VerticalResizer tvMode={tvMode} onResize={setSplit} />
              <div className={tvMode ? "mt-2 min-h-0" : "mt-4"} style={tvMode ? { flex: split } : undefined}>
                <Chart candles={candles} height={tvMode ? 1 : 360} tvMode={tvMode} showMidpoint={showMidpoint} />
              </div>
            </div>
          </div>
        )}
        {!tvMode && <Footer />}
      </div>
    </main>
  );
}
