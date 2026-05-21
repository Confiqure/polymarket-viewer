"use client";
import { useEffect, useRef } from "react";
import { TimeSeries } from "@/lib/buffer";
import type { TOB } from "@/lib/types";
import { toNum } from "@/lib/data";

const SERIES_CONFIG = { maxPoints: 50_000, maxAgeMs: 1000 * 60 * 60 * 48 } as const;
const POLL_INTERVAL_MS = 2000;

/**
 * Polls /api/price for YES and NO token best-bid/ask every 2s, builds in-memory
 * blended-probability series for each side.
 *
 * Named "Poll" rather than "WS" because there's no live WebSocket today.
 */
export function useMarketPoll(yesTokenId: string | undefined, noTokenId: string | undefined) {
  const seriesYesRef = useRef(new TimeSeries(SERIES_CONFIG));
  const seriesNoRef = useRef(new TimeSeries(SERIES_CONFIG));
  const tobRef = useRef<Record<string, TOB>>({});
  const pollTimer = useRef<NodeJS.Timeout | null>(null);

  // reset state when tokens change
  useEffect(() => {
    seriesYesRef.current = new TimeSeries(SERIES_CONFIG);
    seriesNoRef.current = new TimeSeries(SERIES_CONFIG);
    tobRef.current = {};
  }, [yesTokenId, noTokenId]);

  useEffect(() => {
    if (!yesTokenId || !noTokenId) return;
    tobRef.current[yesTokenId] = {};
    tobRef.current[noTokenId] = {};

    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
    const midFrom = (t: TOB | undefined): number | undefined => {
      if (!t) return undefined;
      const { bestBid: bb, bestAsk: ba, last } = t;
      if (bb != null && ba != null) return (bb + ba) / 2;
      if (last != null) return last;
      if (bb != null) return bb;
      if (ba != null) return ba;
      return undefined;
    };
    const computeBlendedProb = (): number | undefined => {
      const y = tobRef.current[yesTokenId];
      const n = tobRef.current[noTokenId];
      const my = midFrom(y);
      const mn = midFrom(n);
      if (my != null && mn != null) return clamp01((my + (1 - mn)) / 2);
      if (my != null) return clamp01(my);
      if (mn != null) return clamp01(1 - mn);
      return undefined;
    };
    const computeNoProb = (): number | undefined => {
      const y = tobRef.current[yesTokenId];
      const n = tobRef.current[noTokenId];
      const my = midFrom(y);
      const mn = midFrom(n);
      if (mn != null) return clamp01(mn);
      if (my != null) return clamp01(1 - my);
      return undefined;
    };

    const tick = async () => {
      try {
        const [buy, sell] = await Promise.all([
          fetch(`/api/price?tokenId=${encodeURIComponent(yesTokenId)}`).then((r) => r.json()),
          fetch(`/api/price?tokenId=${encodeURIComponent(noTokenId)}`).then((r) => r.json()),
        ]);
        if (tobRef.current[yesTokenId]) {
          const bb = toNum(buy?.bestBid);
          const ba = toNum(buy?.bestAsk);
          if (bb !== undefined) tobRef.current[yesTokenId].bestBid = bb;
          if (ba !== undefined) tobRef.current[yesTokenId].bestAsk = ba;
        }
        if (tobRef.current[noTokenId]) {
          const bb = toNum(sell?.bestBid);
          const ba = toNum(sell?.bestAsk);
          if (bb !== undefined) tobRef.current[noTokenId].bestBid = bb;
          if (ba !== undefined) tobRef.current[noTokenId].bestAsk = ba;
        }
        const tNow = Date.now();
        const probYes = computeBlendedProb();
        const probNo = computeNoProb();
        if (probYes != null) seriesYesRef.current.push({ t: tNow, p: probYes });
        if (probNo != null) seriesNoRef.current.push({ t: tNow, p: probNo });
      } catch {
        // Skip this tick; next one retries.
      }
    };

    pollTimer.current = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [yesTokenId, noTokenId]);

  return { seriesYes: seriesYesRef.current, seriesNo: seriesNoRef.current, tob: tobRef.current } as const;
}
