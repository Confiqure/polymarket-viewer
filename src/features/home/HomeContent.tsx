"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MarketRef, ResolvedMarket, MarketOption } from "@/lib/types";
import { useMarketWS } from "@/lib/useMarketWS";
import { TIMEFRAME_SET, type TF } from "@/lib/timeframes";
import { formatDuration, parseMarketEndDate } from "@/lib/format";
import { optionToActiveRef, filterVisibleOptions } from "@/lib/market";
import { useCandles, useWakeLock, useTvShortcuts, useMarketHistory, useResolveMarket, useEventSnapshot } from "@/hooks";
import {
  Chart,
  OddsDisplay,
  Header,
  MarketControls,
  StatusBadge,
  TVHint,
  Footer,
  VerticalResizer,
  EventOptionPicker,
  TrendingEvents,
} from "@/components";

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
  const [resolved, setResolved] = useState<ResolvedMarket | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [delaySec, setDelaySec] = useState(25);
  const [tf, setTf] = useState<TF>(5);
  const [pov, setPov] = useState<"YES" | "NO">("YES");
  const delayMs = delaySec * 1000;
  const [tvMode, setTvMode] = useState(false);
  const [showMidpoint, setShowMidpoint] = useState(true);
  const [displayFormat, setDisplayFormat] = useState<"percent" | "moneyline">("percent");
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [split, setSplit] = useState(67);
  const [urlBarOpen, setUrlBarOpen] = useState(false);
  useWakeLock(tvMode);
  const { tvHintRender, tvHintVisible } = useTvShortcuts(tvMode, setTvMode, setDisplayFormat);

  // Derive event vs single-market view
  const event = resolved?.kind === "event" ? resolved : null;
  const { snapshot, lastUpdated } = useEventSnapshot(event?.slug, 30_000);
  const liveOptions: MarketOption[] | null = useMemo(() => {
    if (!event) return null;
    if (!snapshot) return event.options;
    // Merge: keep event's option order/ids, splice in live prices/volumes when matched.
    const byId = new Map(snapshot.map((s) => [s.id, s] as const));
    return event.options.map((o) => {
      const live = byId.get(o.id);
      return live
        ? { ...o, lastPrice: live.lastPrice, volume: live.volume, volume24hr: live.volume24hr, closed: live.closed }
        : o;
    });
  }, [event, snapshot]);

  const activeOption: MarketOption | null = useMemo(() => {
    if (!event) return null;
    const opts = liveOptions ?? event.options;
    if (opts.length === 0) return null;
    return opts.find((o) => o.id === selectedOptionId) ?? opts[0];
  }, [event, liveOptions, selectedOptionId]);

  const market: MarketRef | null = useMemo(() => {
    if (event && activeOption)
      return optionToActiveRef(activeOption, {
        title: event.title,
        endDateIso: event.endDateIso,
      });
    if (resolved?.kind === "market") return resolved.market;
    return null;
  }, [resolved, event, activeOption]);

  const { seriesYes, seriesNo } = useMarketWS(market?.yesTokenId, market?.noTokenId);
  const { backfillYes, backfillNo } = useMarketHistory(market);
  const activeSeries = pov === "YES" ? seriesYes : seriesNo;
  const activeBackfill = pov === "YES" ? backfillYes : backfillNo;
  const candles = useCandles(activeSeries, activeBackfill, nowTs, delayMs, tf);

  const { resolving, error, resolveNow } = useResolveMarket({
    marketUrl,
    enabled: mounted,
    onResolved: (r) => {
      setResolved(r);
      if (r.kind === "event") {
        // Honor ?option= from URL on initial resolve; otherwise default to top-sorted option.
        const qsOpt = new URLSearchParams(window.location.search).get("option");
        const match = qsOpt ? r.options.find((o) => o.id === qsOpt) : null;
        setSelectedOptionId((match ?? r.options[0])?.id ?? null);
      } else {
        setSelectedOptionId(null);
      }
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

    const optStr = qs.get("option");
    if (optStr) {
      setSelectedOptionId((prev) => (prev !== optStr ? optStr : prev));
    }
  }, [mounted, currentQS]);

  // Push state to URL params (without reload)
  useEffect(() => {
    if (!mounted) return;
    const params = new URLSearchParams(currentQS);
    const prevUrl = params.get("url") ?? "";
    if (marketUrl) params.set("url", marketUrl);
    else params.delete("url");

    if (delaySec !== 25) params.set("delay", String(delaySec));
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

    if (Math.round(split) !== 67) params.set("split", Math.round(split).toString());
    else params.delete("split");

    // Only persist ?option= when in event mode AND the chosen option differs from the default (first/top).
    if (event && selectedOptionId && event.options[0]?.id !== selectedOptionId) {
      params.set("option", selectedOptionId);
    } else {
      params.delete("option");
    }

    const next = params.toString();
    const current = currentQS;
    if (next !== current) {
      const t = setTimeout(() => {
        const shouldWrite = (marketUrl || prevUrl) && next !== current;
        if (shouldWrite) router.replace(`${pathname}?${next}`, { scroll: false });
      }, 300);
      return () => clearTimeout(t);
    }
  }, [
    mounted,
    marketUrl,
    delaySec,
    tf,
    pov,
    tvMode,
    showMidpoint,
    displayFormat,
    split,
    selectedOptionId,
    event,
    pathname,
    router,
    currentQS,
  ]);

  // Autoload market if URL contains one
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (!mounted || autoLoadedRef.current) return;
    const url = new URLSearchParams(currentQS).get("url") ?? "";
    if (url && !resolved) {
      autoLoadedRef.current = true;
      setMarketUrl((prev) => (prev ? prev : url));
      resolveNow(url);
    }
  }, [mounted, currentQS, resolved, resolveNow]);

  // Auto-close the URL input when a new market is loaded.
  useEffect(() => {
    if (market?.conditionId) setUrlBarOpen(false);
  }, [market?.conditionId]);

  if (!mounted) {
    return (
      <main className="min-h-screen bg-black text-slate-200">
        <div className="mx-auto max-w-4xl px-4 py-6" />
      </main>
    );
  }

  const endsLabel = (() => {
    const t = parseMarketEndDate(market?.endDateIso);
    if (t == null) return null;
    const d = t - nowTs;
    return d > 0 ? `Ends in ${formatDuration(d)}` : `Ended ${formatDuration(-d)} ago`;
  })();

  const polymarketUrl = event?.slug
    ? `https://polymarket.com/event/${event.slug}`
    : market?.slug
      ? `https://polymarket.com/market/${market.slug}`
      : null;

  const showUrlBar = !tvMode && (!market || urlBarOpen);

  return (
    <main className={`bg-black text-slate-200 ${tvMode ? "h-screen overflow-hidden" : "min-h-screen"}`}>
      <div className={`mx-auto px-4 ${tvMode ? "flex h-full max-w-6xl flex-col py-2" : "max-w-4xl py-6"}`}>
        <Header
          title={
            tvMode && market
              ? event && activeOption
                ? `${event.title} \u2014 ${activeOption.label}`
                : market.question || ""
              : "Polymarket Viewer"
          }
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
        {!tvMode && market && !urlBarOpen && (
          <div className="mt-4 flex items-center justify-end">
            <button
              type="button"
              onClick={() => setUrlBarOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 ring-1 ring-neutral-800 transition hover:ring-neutral-600"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
              </svg>
              Change market
            </button>
          </div>
        )}
        {showUrlBar && (
          <div className="mt-4 flex items-center gap-2">
            <input
              className="flex-1 rounded-md bg-neutral-900 px-3 py-2 text-sm ring-1 ring-neutral-800 outline-none focus:ring-indigo-500"
              placeholder="Paste Polymarket URL (event or market)"
              value={marketUrl}
              onChange={(e) => setMarketUrl(e.target.value)}
              autoFocus={Boolean(market)}
            />
            {market && (
              <button
                type="button"
                onClick={() => setUrlBarOpen(false)}
                className="rounded-md bg-neutral-900 px-2 py-2 text-xs text-neutral-400 ring-1 ring-neutral-800 hover:ring-neutral-600"
                aria-label="Close URL input"
                title="Close"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-current">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}
            {resolving && (
              <span className="inline-flex items-center gap-2 text-xs text-slate-300">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
                Resolving…
              </span>
            )}
            {error && (
              <div className="rounded-md border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-200">{error}</div>
            )}
          </div>
        )}
        {!tvMode && !market && !resolving && !error && (
          <TrendingEvents
            onPick={(url) => {
              setMarketUrl(url);
              resolveNow(url);
            }}
          />
        )}
        {market && (
          <div className={tvMode ? "mt-2 flex min-h-0 flex-1 flex-col" : "mt-4 space-y-4"}>
            {!tvMode && (
              <section className="rounded-xl bg-neutral-900/60 p-4 ring-1 ring-neutral-800">
                {event ? (
                  <EventOptionPicker
                    options={filterVisibleOptions(liveOptions ?? event.options)}
                    selectedId={activeOption?.id ?? ""}
                    onSelect={setSelectedOptionId}
                    lastUpdated={lastUpdated}
                  />
                ) : (
                  <div className="flex items-start gap-3">
                    {market.image && (
                      <Image
                        src={market.image}
                        alt=""
                        width={48}
                        height={48}
                        unoptimized
                        className="h-12 w-12 flex-none rounded-lg bg-neutral-800 object-cover ring-1 ring-neutral-700"
                      />
                    )}
                    <h2 className="line-clamp-2 text-base font-semibold text-slate-100 sm:text-lg md:text-xl">
                      {market.question}
                    </h2>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-3">
                  <StatusBadge delaySec={delaySec} tvMode={tvMode} />
                  {endsLabel && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-950/60 px-3 py-1.5 text-xs text-neutral-400 ring-1 ring-neutral-800 sm:text-sm">
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current opacity-60">
                        <path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm1-13v5l4 2-.75 1.5L11 13V7z" />
                      </svg>
                      {endsLabel}
                    </span>
                  )}
                  {polymarketUrl && (
                    <a
                      href={polymarketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto inline-flex items-center gap-1 rounded-full bg-neutral-950/60 px-3 py-1.5 text-xs text-neutral-300 ring-1 ring-neutral-800 transition hover:text-slate-100 hover:ring-neutral-600 sm:text-sm"
                    >
                      Open on Polymarket
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                        <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3z" />
                        <path d="M5 5h6v2H7v10h10v-4h2v6H5z" />
                      </svg>
                    </a>
                  )}
                </div>
              </section>
            )}
            <MarketControls
              tvMode={tvMode}
              pov={pov}
              yesLabel={market?.displayName ?? market?.yesLabel}
              noLabel={market?.oppositeDisplayName ?? market?.noLabel}
              onPovChange={setPov}
              delaySec={delaySec}
              onDelayChange={setDelaySec}
              tf={tf}
              onTfChange={setTf}
              showMidpoint={showMidpoint}
              onShowMidpointChange={setShowMidpoint}
            />
            {/* Split container for TV mode */}
            <div className={tvMode ? "flex min-h-0 flex-1 flex-col py-4" : "space-y-4"}>
              <div
                className={
                  tvMode
                    ? "flex min-h-0 flex-col justify-center"
                    : "rounded-xl bg-neutral-900/60 px-4 py-5 ring-1 ring-neutral-800"
                }
                style={tvMode ? { flex: 100 - split } : undefined}
              >
                <OddsDisplay
                  key={market.conditionId}
                  series={activeSeries}
                  nowTs={nowTs}
                  delayMs={delayMs}
                  label={
                    pov === "YES"
                      ? (market?.displayName ?? market?.yesLabel)
                      : (market?.oppositeDisplayName ?? market?.noLabel)
                  }
                  tvMode={tvMode}
                  displayFormat={displayFormat}
                  onToggleFormat={() => setDisplayFormat((v) => (v === "percent" ? "moneyline" : "percent"))}
                />
              </div>
              <VerticalResizer tvMode={tvMode} onResize={setSplit} />
              <div className={tvMode ? "mt-2 min-h-0" : ""} style={tvMode ? { flex: split } : undefined}>
                <Chart
                  key={market.conditionId}
                  candles={candles}
                  height={tvMode ? 1 : 360}
                  tvMode={tvMode}
                  showMidpoint={showMidpoint}
                />
              </div>
            </div>
          </div>
        )}
        {!tvMode && <Footer />}
      </div>
    </main>
  );
}
