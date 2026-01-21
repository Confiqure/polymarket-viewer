"use client";
import { useLayoutEffect, useRef, useState } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState(0);

  useLayoutEffect(() => {
    if (!tvMode || !containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setAvailableHeight(entry.contentRect.height);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [tvMode]);

  const displayTs = nowTs - delayMs;
  // Spoiler-safe: only use last point at or before displayTs (no forward interpolation).
  const pt = series.atOrBefore(displayTs as number);

  const prob = pt?.p;

  // Scaling factors for TV mode
  const labelScale = availableHeight ? Math.max(14, availableHeight * 0.065) : 24;
  const primaryScale = availableHeight ? Math.max(60, availableHeight * 0.52) : 120;
  const secondaryScale = availableHeight ? Math.max(18, availableHeight * 0.11) : 32;

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
      <div ref={containerRef} className={`flex h-full flex-col justify-center text-center ${tvMode ? "my-0" : "my-6"}`}>
        <div
          className={`${tvMode ? "mb-1" : "mb-4 text-sm sm:text-base"} font-medium tracking-wider text-neutral-400 uppercase opacity-80`}
          style={tvMode ? { fontSize: `${labelScale}px` } : undefined}
        >
          {label ? `${label} to win • ` : ""}
          {secs != null ? "data available soon" : "waiting for market data"}
        </div>
        <div
          className={`font-extrabold tracking-tight ${tvMode ? "" : "text-7xl"}`}
          style={tvMode ? { fontSize: `${primaryScale}px`, lineHeight: 1 } : undefined}
        >
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
      ref={containerRef}
      className={`group relative flex h-full flex-col justify-center text-center transition-colors ${
        tvMode ? "my-0" : "my-6"
      } ${onToggleFormat ? "cursor-pointer hover:bg-neutral-900/50" : ""}`}
      onClick={onToggleFormat}
      title="Click to toggle display format (m)"
    >
      <div
        className={`${tvMode ? "mb-1" : "mb-4 text-base sm:text-lg"} font-medium tracking-wider text-neutral-300 uppercase opacity-80`}
        style={tvMode ? { fontSize: `${labelScale}px` } : undefined}
      >
        {label ?? "Outcome"} to win
      </div>
      <div className="flex flex-col items-center justify-center">
        <div
          className={`font-extrabold tracking-tight ${tvMode ? "" : "text-7xl"}`}
          style={tvMode ? { fontSize: `${primaryScale}px`, lineHeight: 0.9 } : undefined}
        >
          {primary}
        </div>
        <div
          className={`font-semibold text-neutral-500 opacity-60 transition-opacity group-hover:opacity-100 ${
            tvMode ? "" : "text-lg sm:text-xl"
          }`}
          style={tvMode ? { fontSize: `${secondaryScale}px` } : undefined}
        >
          {secondary}
        </div>
      </div>
    </div>
  );
}

export default OddsDisplay;
