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
}) {
  if (tvMode) return null;
  return (
    <div className="relative mt-3 flex flex-wrap items-center gap-3 pl-3 before:absolute before:top-1/2 before:left-0 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-neutral-700">
      <div className="flex items-center gap-2 text-sm">
        <span>Outcome</span>
        <div className="inline-flex overflow-hidden rounded-md bg-neutral-900 ring-1 ring-neutral-800">
          <button
            type="button"
            className={`px-4 py-2 text-sm font-semibold ${pov === "YES" ? "bg-neutral-700 text-white" : "text-slate-300 hover:bg-neutral-800"}`}
            onClick={() => onPovChange("YES")}
          >
            {yesLabel ?? "YES"}
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-semibold ${pov === "NO" ? "bg-neutral-700 text-white" : "text-slate-300 hover:bg-neutral-800"}`}
            onClick={() => onPovChange("NO")}
          >
            {noLabel ?? "NO"}
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
          onChange={(e) => onDelayChange(Number(e.target.value))}
        />
        s
      </label>
      <label className="flex items-center gap-2 text-sm">
        Candle size
        <select
          className="rounded bg-neutral-900 px-2 py-1 ring-1 ring-neutral-800"
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
    </div>
  );
}

export default MarketControls;
