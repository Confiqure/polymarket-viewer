"use client";
import { useEffect, useMemo, useRef } from "react";
import { TimeSeries } from "./buffer";
import type { TOB } from "./types";

// Poll-only market feed (WebSocket to be implemented later)
export function useMarketWS(yesTokenId: string | undefined, noTokenId: string | undefined) {
  const seriesYesRef = useRef(new TimeSeries({ maxPoints: 50000, maxAgeMs: 1000 * 60 * 60 * 48 }));
  const seriesNoRef = useRef(new TimeSeries({ maxPoints: 50000, maxAgeMs: 1000 * 60 * 60 * 48 }));
  const tobRef = useRef<Record<string, TOB>>({});
  const pollTimer = useRef<NodeJS.Timeout | null>(null);

  // reset state when tokens change
  useEffect(() => {
  seriesYesRef.current = new TimeSeries({ maxPoints: 50000, maxAgeMs: 1000 * 60 * 60 * 48 });
  seriesNoRef.current = new TimeSeries({ maxPoints: 50000, maxAgeMs: 1000 * 60 * 60 * 48 });
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

    const clearPolling = () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
    const startPolling = () => {
      if (pollTimer.current) return;
      console.debug("[Poll] starting price polling");
      pollTimer.current = setInterval(async () => {
        try {
          const [buy, sell] = await Promise.all([
            fetch(`/api/price?tokenId=${encodeURIComponent(yesTokenId)}`).then((r) => r.json()),
            fetch(`/api/price?tokenId=${encodeURIComponent(noTokenId)}`).then((r) => r.json()),
          ]);
          if (buy?.bestBid != null) tobRef.current[yesTokenId].bestBid = parseFloat(buy.bestBid);
          if (buy?.bestAsk != null) tobRef.current[yesTokenId].bestAsk = parseFloat(buy.bestAsk);
          if (sell?.bestBid != null) tobRef.current[noTokenId].bestBid = parseFloat(sell.bestBid);
          if (sell?.bestAsk != null) tobRef.current[noTokenId].bestAsk = parseFloat(sell.bestAsk);
          const tNow = Date.now();
          const probYes = computeBlendedProb();
          const probNo = computeNoProb();
            if (probYes != null && !Number.isNaN(probYes)) seriesYesRef.current.push({ t: tNow, p: probYes });
            if (probNo != null && !Number.isNaN(probNo)) seriesNoRef.current.push({ t: tNow, p: probNo });
        } catch (e) {
          console.error("[Poll] error:", e);
        }
      }, 2000);
    };
    startPolling();
    return () => clearPolling();
  }, [yesTokenId, noTokenId]);

  const currentTOB = useMemo(() => tobRef.current, []);
  return { seriesYes: seriesYesRef.current, seriesNo: seriesNoRef.current, tob: currentTOB } as const;
}
