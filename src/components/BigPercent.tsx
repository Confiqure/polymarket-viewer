"use client";
import type { TimeSeries } from "@/lib/buffer";

export function BigPercent({
  series,
  nowTs,
  delayMs,
  label,
  tvMode,
}: {
  series: TimeSeries;
  nowTs: number;
  delayMs: number;
  label?: string;
  tvMode?: boolean;
}) {
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
      <div className="my-6 text-center">
        <div className={`font-extrabold tracking-tight ${tvMode ? "text-[clamp(3rem,10vw,10rem)]" : "text-7xl"}`}>
          {secs != null ? `${secs}s` : "…"}
        </div>
        <div className={`${tvMode ? "text-xl sm:text-2xl" : "text-sm sm:text-base"} text-neutral-400`}>
          {label ? `${label} to win • ` : ""}
          {secs != null ? "data available soon" : "waiting for market data"}
        </div>
      </div>
    );
  }
  const pct = (pt.p * 100).toFixed(1);
  return (
    <div className="my-6 text-center">
      <div className={`font-extrabold tracking-tight ${tvMode ? "text-[clamp(3rem,10vw,10rem)]" : "text-7xl"}`}>
        {pct}%
      </div>
      <div className={`${tvMode ? "text-2xl sm:text-3xl" : "text-base sm:text-lg"} text-neutral-300`}>
        {label ?? "Outcome"} to win
      </div>
    </div>
  );
}

export default BigPercent;
