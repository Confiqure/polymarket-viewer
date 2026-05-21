"use client";
import type { TF } from "@/lib/timeframes";
import { TIMEFRAME_MINUTES } from "@/lib/timeframes";

export function MarketControls({
  tvMode,
  pov,
  yesLabel,
  noLabel,
  onPovChange,
  delaySec,
  onDelayChange,
  tf,
  onTfChange,
  showMidpoint,
  onShowMidpointChange,
}: {
  tvMode: boolean;
  pov: "YES" | "NO";
  yesLabel?: string;
  noLabel?: string;
  onPovChange: (v: "YES" | "NO") => void;
  delaySec: number;
  onDelayChange: (v: number) => void;
  tf: TF;
  onTfChange: (v: TF) => void;
  showMidpoint: boolean;
  onShowMidpointChange: (v: boolean) => void;
}) {
  if (tvMode) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl bg-neutral-900/60 px-4 py-3 ring-1 ring-neutral-800">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-xs tracking-wider text-neutral-500 uppercase">Outcome</span>
        <div
          className="inline-flex overflow-hidden rounded-md bg-neutral-950 ring-1 ring-neutral-800"
          role="group"
          aria-label="Outcome"
        >
          <button
            type="button"
            aria-pressed={pov === "YES"}
            className={`px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 ${pov === "YES" ? "bg-neutral-700 text-white" : "text-slate-300 hover:bg-neutral-800"}`}
            onClick={() => onPovChange("YES")}
          >
            {yesLabel ?? "YES"}
          </button>
          <button
            type="button"
            aria-pressed={pov === "NO"}
            className={`px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 ${pov === "NO" ? "bg-neutral-700 text-white" : "text-slate-300 hover:bg-neutral-800"}`}
            onClick={() => onPovChange("NO")}
          >
            {noLabel ?? "NO"}
          </button>
        </div>
      </div>
      <span aria-hidden="true" className="hidden h-5 w-px bg-neutral-800 sm:block" />
      <label className="flex items-center gap-2 text-sm">
        <span className="text-xs tracking-wider text-neutral-500 uppercase">Delay</span>
        <input
          type="number"
          min={0}
          max={600}
          className="w-16 rounded-md bg-neutral-950 px-2 py-1 text-sm tabular-nums ring-1 ring-neutral-800 focus:ring-indigo-500 focus:outline-none"
          value={delaySec}
          onChange={(e) => onDelayChange(Number(e.target.value))}
        />
        <span className="text-xs text-neutral-500">s</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-xs tracking-wider text-neutral-500 uppercase">Candle</span>
        <select
          className="rounded-md bg-neutral-950 px-2 py-1 text-sm ring-1 ring-neutral-800 focus:ring-indigo-500 focus:outline-none"
          value={tf}
          onChange={(e) => onTfChange(Number(e.target.value) as TF)}
        >
          {TIMEFRAME_MINUTES.map((m) => (
            <option key={m} value={m}>
              {m}m
            </option>
          ))}
        </select>
      </label>
      <label className="ml-auto flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={showMidpoint}
          onChange={(e) => onShowMidpointChange(e.target.checked)}
          className="h-4 w-4 accent-indigo-500"
        />
        Midpoint
      </label>
    </div>
  );
}

export default MarketControls;
