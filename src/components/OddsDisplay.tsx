"use client";
import { useLayoutEffect, useRef, useState } from "react";
import type { TimeSeries } from "@/lib/buffer";
import { formatMoneyline, formatPercent } from "@/lib/format";

export function OddsDisplay({
  series,
  nowTs,
  delayMs,
  label,
  labelSuffix = "to win",
  tvMode,
  displayFormat = "percent",
  onToggleFormat,
}: {
  series: TimeSeries;
  nowTs: number;
  delayMs: number;
  label?: string;
  // Trailing phrase after the label, e.g. "France to win". Empty for outcomes where
  // "to win" doesn't read ("Draw", "Over"); then we show just the label.
  labelSuffix?: string;
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

    // Truly no data yet — show a skeleton placeholder at the eventual content size.
    if (arr.length === 0) {
      return (
        <div
          ref={containerRef}
          role="status"
          aria-label={label ? `Loading odds for ${label}` : "Loading odds"}
          className={`flex h-full flex-col items-center justify-center ${tvMode ? "my-0" : "my-6"}`}
        >
          <div className={`animate-pulse rounded-md bg-neutral-800 ${tvMode ? "h-[5%] w-1/4" : "h-3 w-32"}`} />
          <div
            className={`mt-4 animate-pulse rounded-lg bg-neutral-800 ${tvMode ? "h-[42%] w-1/2" : "h-24 w-56 sm:h-28 sm:w-72"}`}
          />
        </div>
      );
    }

    // Data exists; we're waiting on the spoiler-safe display window to elapse.
    const earliest = arr[0]?.t ?? 0;
    const remainingMs = earliest + delayMs - nowTs;
    const secs = remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
    const subtitle = secs > 0 ? "Data available in" : "Catching up";
    return (
      <div
        ref={containerRef}
        role="status"
        aria-live="polite"
        className={`flex h-full flex-col justify-center text-center ${tvMode ? "my-0" : "my-6"}`}
      >
        <div
          className={`${tvMode ? "mb-1" : "mb-4 text-sm sm:text-base"} font-medium tracking-wider text-neutral-400 uppercase opacity-80`}
          style={tvMode ? { fontSize: `${labelScale}px` } : undefined}
        >
          {label ? `${labelSuffix ? `${label} ${labelSuffix}` : label} • ` : ""}
          {subtitle}
        </div>
        <div
          className={`font-extrabold tracking-tight ${tvMode ? "" : "text-7xl"}`}
          style={tvMode ? { fontSize: `${primaryScale}px`, lineHeight: 1 } : undefined}
        >
          {secs > 0 ? `${secs}s` : "…"}
        </div>
      </div>
    );
  }

  const pct = formatPercent(prob);
  const ml = formatMoneyline(prob);

  const primary = displayFormat === "percent" ? pct : ml;
  const secondary = displayFormat === "percent" ? ml : pct;

  const interactive = Boolean(onToggleFormat);
  return (
    <div
      ref={containerRef}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? "Toggle between percent and moneyline display" : undefined}
      className={`group relative flex h-full flex-col justify-center text-center transition-colors ${
        tvMode ? "my-0" : "my-6"
      } ${interactive ? "cursor-pointer hover:bg-neutral-900/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400" : ""}`}
      onClick={onToggleFormat}
      onKeyDown={(e) => {
        if (interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onToggleFormat?.();
        }
      }}
      title={interactive ? "Click to toggle display format (m)" : undefined}
    >
      <div
        className={`${tvMode ? "mb-1" : "mb-4 text-base sm:text-lg"} font-medium tracking-wider text-neutral-300 uppercase opacity-80`}
        style={tvMode ? { fontSize: `${labelScale}px` } : undefined}
      >
        {labelSuffix ? `${label ?? "Outcome"} ${labelSuffix}` : (label ?? "Outcome")}
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
