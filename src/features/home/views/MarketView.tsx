"use client";
import Image from "next/image";
import { useMemo } from "react";
import {
  Chart,
  EventOptionPicker,
  MarketControls,
  MatchupSelector,
  OddsDisplay,
  StatusBadge,
  VerticalResizer,
} from "@/components";
import { useTicker } from "@/components/Ticker";
import { useCandles } from "@/hooks";
import { filterVisibleOptions } from "@/lib/market";
import { formatDuration, parseMarketEndDate } from "@/lib/format";
import type { TimeSeries } from "@/lib/buffer";
import type { EventRef, MarketOption, MarketRef, PricePoint } from "@/lib/types";
import type { TF } from "@/lib/timeframes";
import type { DisplayFormat, Pov, ViewState } from "@/hooks/useUrlSync";

export function MarketView({
  market,
  event,
  liveOptions,
  activeOption,
  lastUpdated,
  onSelectOption,
  view,
  setView,
  seriesYes,
  seriesNo,
  backfillYes,
  backfillNo,
  historyLoading,
  historyError,
  refetchHistory,
  urlBarOpen,
  setUrlBarOpen,
  marketUrl,
  onMarketUrlChange,
  resolving,
  resolveError,
}: {
  market: MarketRef;
  event: EventRef | null;
  liveOptions: MarketOption[] | null;
  activeOption: MarketOption | null;
  lastUpdated: number | null;
  onSelectOption: (id: string) => void;
  view: ViewState;
  setView: (partial: Partial<ViewState>) => void;
  seriesYes: TimeSeries;
  seriesNo: TimeSeries;
  backfillYes: PricePoint[];
  backfillNo: PricePoint[];
  historyLoading: boolean;
  historyError: string | null;
  refetchHistory: () => void;
  urlBarOpen: boolean;
  setUrlBarOpen: (v: boolean) => void;
  marketUrl: string;
  onMarketUrlChange: (v: string) => void;
  resolving: boolean;
  resolveError: string | null;
}) {
  const nowTs = useTicker();
  const tvMode = view.tvMode;
  const delayMs = view.delaySec * 1000;
  // A matchup's outcomes are chosen via the MatchupSelector, each charted as its own YES
  // (win) probability — there's no meaningful "Not {outcome}" side, so POV is locked to YES.
  const isMatchup = Boolean(event?.matchup);
  const pov = isMatchup ? "YES" : view.pov;
  const activeSeries = pov === "YES" ? seriesYes : seriesNo;
  const activeBackfill = pov === "YES" ? backfillYes : backfillNo;
  const candles = useCandles(activeSeries, activeBackfill, nowTs, delayMs, view.tf);

  const endsLabel = useMemo(() => {
    const t = parseMarketEndDate(market.endDateIso);
    if (t == null) return null;
    const d = t - nowTs;
    return d > 0 ? `Ends in ${formatDuration(d)}` : `Ended ${formatDuration(-d)} ago`;
  }, [market.endDateIso, nowTs]);

  const polymarketUrl = event?.slug
    ? `https://polymarket.com/event/${event.slug}`
    : market.slug
      ? `https://polymarket.com/market/${market.slug}`
      : null;

  const oddsLabel =
    pov === "YES" ? (market.displayName ?? market.yesLabel) : (market.oppositeDisplayName ?? market.noLabel);
  // "Draw to win" doesn't read; show just "Draw" for the draw outcome of a matchup.
  const activeRole = event?.matchup?.find((o) => o.optionId === activeOption?.id)?.role;
  const oddsLabelSuffix = activeRole === "draw" ? "" : "to win";

  const showUrlBar = !tvMode && urlBarOpen;

  return (
    <>
      {!tvMode && !urlBarOpen && (
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
            onChange={(e) => onMarketUrlChange(e.target.value)}
            autoFocus
          />
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
          {resolving && (
            <span className="inline-flex items-center gap-2 text-xs text-slate-300">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
              Resolving…
            </span>
          )}
          {resolveError && (
            <div className="rounded-md border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-200">
              {resolveError}
            </div>
          )}
        </div>
      )}
      <div className={tvMode ? "mt-2 flex min-h-0 flex-1 flex-col" : "mt-4 space-y-4"}>
        {!tvMode && (
          <section className="rounded-xl bg-neutral-900/60 p-4 ring-1 ring-neutral-800">
            {event?.matchup ? (
              (() => {
                const allOptions = liveOptions ?? event.options;
                const matchupIds = new Set(event.matchup.map((o) => o.optionId));
                // Defensive: surface any sibling markets that aren't part of the 3-way.
                const extras = filterVisibleOptions(allOptions).filter((o) => !matchupIds.has(o.id));
                return (
                  <div className="space-y-3">
                    <MatchupSelector
                      outcomes={event.matchup}
                      options={allOptions}
                      selectedId={activeOption?.id ?? ""}
                      onSelect={onSelectOption}
                      lastUpdated={lastUpdated}
                    />
                    {extras.length > 0 && (
                      <EventOptionPicker
                        options={extras}
                        selectedId={activeOption?.id ?? ""}
                        onSelect={onSelectOption}
                        filterPlaceholder="More markets…"
                      />
                    )}
                  </div>
                );
              })()
            ) : event ? (
              <EventOptionPicker
                options={filterVisibleOptions(liveOptions ?? event.options)}
                selectedId={activeOption?.id ?? ""}
                onSelect={onSelectOption}
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
              <StatusBadge delaySec={view.delaySec} tvMode={tvMode} />
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
          yesLabel={market.displayName ?? market.yesLabel}
          noLabel={market.oppositeDisplayName ?? market.noLabel}
          onPovChange={(v: Pov) => setView({ pov: v })}
          showOutcomeToggle={!isMatchup}
          delaySec={view.delaySec}
          onDelayChange={(v) => setView({ delaySec: v })}
          tf={view.tf}
          onTfChange={(v: TF) => setView({ tf: v })}
          showMidpoint={view.showMidpoint}
          onShowMidpointChange={(v) => setView({ showMidpoint: v })}
        />
        <div className={tvMode ? "flex min-h-0 flex-1 flex-col py-4" : "space-y-4"}>
          <div
            className={
              tvMode
                ? "flex min-h-0 flex-col justify-center"
                : "rounded-xl bg-neutral-900/60 px-4 py-5 ring-1 ring-neutral-800"
            }
            style={tvMode ? { flex: 100 - view.split } : undefined}
          >
            <OddsDisplay
              series={activeSeries}
              nowTs={nowTs}
              delayMs={delayMs}
              label={oddsLabel}
              labelSuffix={oddsLabelSuffix}
              tvMode={tvMode}
              displayFormat={view.displayFormat}
              onToggleFormat={() =>
                setView({
                  displayFormat: (view.displayFormat === "percent" ? "moneyline" : "percent") as DisplayFormat,
                })
              }
            />
          </div>
          <VerticalResizer tvMode={tvMode} onResize={(v) => setView({ split: v })} />
          <div className={tvMode ? "mt-2 min-h-0" : ""} style={tvMode ? { flex: view.split } : undefined}>
            <Chart
              candles={candles}
              height={tvMode ? 1 : 360}
              tvMode={tvMode}
              showMidpoint={view.showMidpoint}
              historyLoading={historyLoading}
              historyError={historyError}
              onRetryHistory={refetchHistory}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export default MarketView;
