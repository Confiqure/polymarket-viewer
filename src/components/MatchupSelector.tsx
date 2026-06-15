"use client";
import Image from "next/image";
import type { MarketOption, MatchupOutcome } from "@/lib/types";
import { formatProbability, timeAgo } from "@/lib/format";

const ROLE_CAPTION: Record<MatchupOutcome["role"], string> = {
  home: "Home",
  draw: "Draw",
  away: "Away",
};

/**
 * Tri-state outcome selector for draw-supporting matches (e.g. soccer): Home / Draw / Away,
 * each with its live win probability. Selecting an outcome charts that outcome over time.
 */
export function MatchupSelector({
  outcomes,
  options,
  selectedId,
  onSelect,
  lastUpdated,
}: {
  outcomes: MatchupOutcome[];
  options: MarketOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  lastUpdated?: number | null;
}) {
  const byId = new Map(options.map((o) => [o.id, o] as const));
  return (
    <div>
      <div role="group" aria-label="Match outcome" className="flex gap-2">
        {outcomes.map((oc) => {
          const opt = byId.get(oc.optionId);
          const selected = oc.optionId === selectedId;
          const src = oc.role !== "draw" ? (opt?.image ?? opt?.icon) : undefined;
          return (
            <button
              key={oc.optionId}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(oc.optionId)}
              className={`flex flex-1 flex-col items-center gap-1.5 rounded-lg px-2 py-3 ring-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 ${
                selected ? "bg-neutral-800 ring-indigo-500" : "bg-neutral-950 ring-neutral-800 hover:ring-neutral-600"
              }`}
            >
              <span className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">
                {ROLE_CAPTION[oc.role]}
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                {src && (
                  <Image
                    src={src}
                    alt=""
                    width={20}
                    height={20}
                    unoptimized
                    className="h-5 w-5 flex-none rounded-full bg-neutral-800 object-cover ring-1 ring-neutral-700"
                  />
                )}
                <span className="truncate text-sm font-medium text-slate-200">{oc.label}</span>
              </span>
              <span className="text-xl font-bold text-slate-100 tabular-nums">{formatProbability(opt?.lastPrice)}</span>
            </button>
          );
        })}
      </div>
      {lastUpdated && (
        <div className="mt-2 text-[11px] text-neutral-500" title={new Date(lastUpdated).toLocaleString()}>
          updated {timeAgo(lastUpdated)}
        </div>
      )}
    </div>
  );
}

export default MatchupSelector;
