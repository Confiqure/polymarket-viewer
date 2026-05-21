"use client";
import { useEffect } from "react";
import { useTicker } from "@/components/Ticker";
import type { EventRef, MarketOption, MarketRef } from "@/lib/types";
import type { TimeSeries } from "@/lib/buffer";

const DEFAULT_TITLE = "Polymarket Viewer";
const MAX_QUESTION_CHARS = 60;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Keeps the browser tab title in sync with the currently displayed (delayed) odds.
 * Format: "78% · Will X happen? · Polymarket Viewer"
 *
 * Uses the same delayed series the UI shows so we never reveal a probability
 * earlier in the tab than in the page body.
 */
export function useDocumentTitle(
  market: MarketRef | null,
  event: EventRef | null,
  activeOption: MarketOption | null,
  activeSeries: TimeSeries | null,
  delayMs: number,
) {
  const nowTs = useTicker();

  useEffect(() => {
    if (!market || !activeSeries) {
      document.title = DEFAULT_TITLE;
      return;
    }

    const pt = activeSeries.atOrBefore(nowTs - delayMs);
    const prob = pt?.p;
    const headline = event && activeOption ? `${event.title} — ${activeOption.label}` : market.question || "";
    const truncated = truncate(headline, MAX_QUESTION_CHARS);

    if (prob == null) {
      document.title = truncated ? `${truncated} · ${DEFAULT_TITLE}` : DEFAULT_TITLE;
      return;
    }

    const pct = Math.round(prob * 100);
    document.title = truncated ? `${pct}% · ${truncated} · ${DEFAULT_TITLE}` : `${pct}% · ${DEFAULT_TITLE}`;
  }, [market, event, activeOption, activeSeries, delayMs, nowTs]);

  useEffect(() => {
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, []);
}
