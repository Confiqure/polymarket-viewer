"use client";
import type { TimeSeries } from "@/lib/buffer";
import { formatMoneyline, formatPercent } from "@/lib/format";

export function OddsDisplay({
  series,
  nowTs,
  delayMs,
  label,
  tvMode,
  displayFormat = "percent",
  onToggleFormat,
}: {
  series: TimeSeries;
  nowTs: number;
  delayMs: number;
  label?: string;
  tvMode?: boolean;
  displayFormat?: "percent" | "moneyline";
  onToggleFormat?: () => void;
}) {
  const displayTs = nowTs - delayMs;
  // Spoiler-safe: only use last point at or before displayTs (no forward interpolation).
  const pt = series.atOrBefore(displayTs as number);

  const prob = pt?.p;

  if (prob === undefined || prob === null) {
    const arr = series.toArray();
    const secs = (() => {
      if (arr.length === 0) return null;
      const earliest = arr[0]?.t ?? 0;
      const remainingMs = earliest + delayMs - nowTs;
      if (remainingMs <= 0) return 0;
      return Math.ceil(remainingMs / 1000);
    })();
    return (
      <div className={`text-center ${tvMode ? "my-2" : "my-6"}`}>
        <div
          className={`${tvMode ? "mb-1 text-xl sm:text-2xl" : "mb-4 text-sm sm:text-base"} font-medium tracking-wider text-neutral-400 uppercase opacity-80`}
        >
          {label ? `${label} to win • ` : ""}
          {secs != null ? "data available soon" : "waiting for market data"}
        </div>
        <div className={`font-extrabold tracking-tight ${tvMode ? "text-[clamp(3rem,15vh,8rem)]" : "text-7xl"}`}>
          {secs != null ? `${secs}s` : "…"}
        </div>
      </div>
    );
  }

  const pct = formatPercent(prob);
  const ml = formatMoneyline(prob);

  const primary = displayFormat === "percent" ? pct : ml;
  const secondary = displayFormat === "percent" ? ml : pct;

  return (
    <div
      className={`group relative text-center transition-colors ${tvMode ? "my-2" : "my-6"} ${onToggleFormat ? "cursor-pointer hover:bg-neutral-900/50" : ""}`}
      onClick={onToggleFormat}
      title="Click to toggle display format (m)"
    >
      <div
        className={`${tvMode ? "mb-1 text-xl sm:text-2xl" : "mb-4 text-base sm:text-lg"} font-medium tracking-wider text-neutral-300 uppercase opacity-80`}
      >
        {label ?? "Outcome"} to win
      </div>
      <div className="flex flex-col items-center justify-center">
        <div className={`font-extrabold tracking-tight ${tvMode ? "text-[clamp(3rem,15vh,8rem)]" : "text-7xl"}`}>
          {primary}
        </div>
        <div
          className={`font-semibold text-neutral-500 opacity-60 transition-opacity group-hover:opacity-100 ${
            tvMode ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"
          }`}
        >
          {secondary}
        </div>
      </div>
    </div>
  );
}

export default OddsDisplay;
