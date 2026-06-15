"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import type { MarketRef, MarketOption, ResolvedMarket } from "@/lib/types";
import {
  useMarketPoll,
  useMarketHistory,
  useResolveMarket,
  useEventSnapshot,
  useWakeLock,
  useTvShortcuts,
} from "@/hooks";
import { useUrlSync, type DisplayFormat, type ViewState } from "@/hooks/useUrlSync";
import { optionToActiveRef } from "@/lib/market";
import { Header, TVHint, Footer } from "@/components";
import { LandingView } from "./views/LandingView";
import { MarketView } from "./views/MarketView";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function HomeContent({
  initialResolved = null,
  initialUrl = "",
}: {
  /** Server-resolved market (if any) so the first paint already shows the right view. */
  initialResolved?: ResolvedMarket | null;
  /** The raw `?url=` value used to fetch `initialResolved` — used to skip a redundant client-side resolve. */
  initialUrl?: string;
} = {}) {
  const [resolved, setResolved] = useState<ResolvedMarket | null>(initialResolved);
  const [urlBarOpen, setUrlBarOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "failed">("idle");

  // Derived: event vs single-market
  const event = resolved?.kind === "event" ? resolved : null;
  const { snapshot, lastUpdated } = useEventSnapshot(event?.slug, 30_000);

  const liveOptions: MarketOption[] | null = useMemo(() => {
    if (!event) return null;
    if (!snapshot) return event.options;
    const byId = new Map(snapshot.map((s) => [s.id, s] as const));
    return event.options.map((o) => {
      const live = byId.get(o.id);
      return live
        ? { ...o, lastPrice: live.lastPrice, volume: live.volume, volume24hr: live.volume24hr, closed: live.closed }
        : o;
    });
  }, [event, snapshot]);

  const { state, setState } = useUrlSync();

  const setView = useCallback((partial: Partial<ViewState>) => setState(partial), [setState]);

  const activeOption: MarketOption | null = useMemo(() => {
    if (!event) return null;
    const opts = liveOptions ?? event.options;
    if (opts.length === 0) return null;
    return opts.find((o) => o.id === state.optionId) ?? opts[0];
  }, [event, liveOptions, state.optionId]);

  // The default option is implicit: `state.optionId === null` -> first option.
  // Callers set `optionId` to `null` instead of the first option's id so the URL stays minimal.
  const handleSelectOption = useCallback(
    (id: string) => {
      const opts = liveOptions ?? event?.options ?? [];
      const isDefault = opts[0]?.id === id;
      setView({ optionId: isDefault ? null : id });
    },
    [event, liveOptions, setView],
  );

  const market: MarketRef | null = useMemo(() => {
    if (event && activeOption)
      return optionToActiveRef(activeOption, { title: event.title, endDateIso: event.endDateIso });
    if (resolved?.kind === "market") return resolved.market;
    return null;
  }, [resolved, event, activeOption]);

  const { seriesYes, seriesNo } = useMarketPoll(market?.yesTokenId, market?.noTokenId);
  const {
    backfillYes,
    backfillNo,
    loading: historyLoading,
    error: historyError,
    refetch: refetchHistory,
  } = useMarketHistory(market);

  useWakeLock(state.tvMode);

  const setTvMode = useCallback(
    (action: SetStateAction<boolean>) => {
      setState((prev) => ({
        tvMode: typeof action === "function" ? (action as (b: boolean) => boolean)(prev.tvMode) : action,
      }));
    },
    [setState],
  );
  const setDisplayFormat = useCallback(
    (action: SetStateAction<DisplayFormat>) => {
      setState((prev) => ({
        displayFormat:
          typeof action === "function" ? (action as (d: DisplayFormat) => DisplayFormat)(prev.displayFormat) : action,
      }));
    },
    [setState],
  );
  const { tvHintRender, tvHintVisible } = useTvShortcuts(state.tvMode, setTvMode, setDisplayFormat);

  const {
    resolving,
    error: resolveError,
    resolveNow,
  } = useResolveMarket({
    marketUrl: state.url,
    initialResolvedUrl: initialResolved ? initialUrl : undefined,
    onResolved: (r) => {
      setResolved(r);
      if (r.kind === "event") {
        // Keep `optionId` non-null only when it matches a non-default option.
        const opt = state.optionId ? r.options.find((o) => o.id === state.optionId) : null;
        const isDefault = !opt || r.options[0]?.id === opt.id;
        setView({ optionId: isDefault ? null : opt!.id });
      } else {
        setView({ optionId: null });
      }
    },
  });

  // Fallback autoload: if SSR couldn't resolve but state.url is set, try client-side once.
  const autoLoadedRef = useRef(Boolean(initialResolved));
  useEffect(() => {
    if (autoLoadedRef.current) return;
    if (state.url && !resolved) {
      autoLoadedRef.current = true;
      resolveNow(state.url);
    }
  }, [state.url, resolved, resolveNow]);

  // Fallback: if the URL is cleared externally (e.g. browser back to `/`),
  // drop the rendered market so we fall back to the landing view. We skip
  // this while the URL bar is open so the user can clear-and-retype without
  // the market vanishing mid-edit.
  useEffect(() => {
    if (state.url || urlBarOpen) return;
    if (resolved) setResolved(null);
    autoLoadedRef.current = false;
  }, [state.url, urlBarOpen, resolved]);

  const handleHome = useCallback(() => {
    setResolved(null);
    setUrlBarOpen(false);
    autoLoadedRef.current = false;
    setView({ url: "" });
  }, [setView]);

  // Auto-close URL input once a market is loaded
  useEffect(() => {
    if (market?.conditionId) setUrlBarOpen(false);
  }, [market?.conditionId]);

  // Document title with live odds (delayed series, throttled to ticker rate).
  // Matchups lock POV to YES (each outcome is charted as its own win probability).
  const titleSeries = state.pov === "YES" || event?.matchup ? seriesYes : seriesNo;
  useDocumentTitle(market, event, activeOption, titleSeries, state.delaySec * 1000);

  const handleShare = useCallback(() => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setShareStatus("copied");
      } catch {
        setShareStatus("failed");
      }
      setTimeout(() => setShareStatus("idle"), 1200);
    })();
  }, []);

  const tvMode = state.tvMode;
  const headerTitle =
    tvMode && market
      ? event && activeOption
        ? `${event.title} — ${activeOption.label}`
        : market.question || ""
      : "Polymarket Viewer";

  return (
    <main className={`bg-black text-slate-200 ${tvMode ? "h-screen overflow-hidden" : "min-h-screen"}`}>
      <div className={`mx-auto px-4 ${tvMode ? "flex h-full max-w-6xl flex-col py-2" : "max-w-4xl py-6"}`}>
        <Header
          title={headerTitle}
          compact={Boolean(tvMode && market)}
          tvMode={tvMode}
          onToggleTv={(v) => setView({ tvMode: v })}
          shareStatus={shareStatus}
          onShare={handleShare}
          onHome={handleHome}
        />
        <TVHint render={tvMode && tvHintRender} visible={tvHintVisible} />
        {market ? (
          <MarketView
            market={market}
            event={event}
            liveOptions={liveOptions}
            activeOption={activeOption}
            lastUpdated={lastUpdated}
            onSelectOption={handleSelectOption}
            view={state}
            setView={setView}
            seriesYes={seriesYes}
            seriesNo={seriesNo}
            backfillYes={backfillYes}
            backfillNo={backfillNo}
            historyLoading={historyLoading}
            historyError={historyError}
            refetchHistory={refetchHistory}
            urlBarOpen={urlBarOpen}
            setUrlBarOpen={setUrlBarOpen}
            marketUrl={state.url}
            onMarketUrlChange={(v) => setView({ url: v })}
            resolving={resolving}
            resolveError={resolveError}
          />
        ) : (
          <LandingView
            url={state.url}
            onUrlChange={(v) => setView({ url: v })}
            resolving={resolving}
            error={resolveError}
            onPickTrending={(url) => {
              setView({ url });
              resolveNow(url);
            }}
          />
        )}
        {!tvMode && <Footer />}
      </div>
    </main>
  );
}
