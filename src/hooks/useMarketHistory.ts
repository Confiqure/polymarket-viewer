"use client";
import { useEffect, useState } from "react";
import type { MarketRef, PricePoint } from "@/lib/types";
import { fetchHistory } from "@/services/polymarket";
import type { TF } from "@/lib/timeframes";

export function useMarketHistory(market: MarketRef | null, _tf: TF) {
  const [backfillYes, setBackfillYes] = useState<PricePoint[]>([]);
  const [backfillNo, setBackfillNo] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!market) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const yesId = market.yesTokenId;
        const noId = market.noTokenId;
        const [yesRes, noRes] = await Promise.allSettled([fetchHistory(yesId, "1"), fetchHistory(noId, "1")]);
        if (!cancelled) {
          if (yesRes.status === "fulfilled") {
            setBackfillYes(yesRes.value.map((h) => ({ t: h.t * 1000, p: h.p })));
          } else {
            console.warn("[History] YES fetch failed", yesRes.reason);
            setBackfillYes([]);
          }
          if (noRes.status === "fulfilled") {
            setBackfillNo(noRes.value.map((h) => ({ t: h.t * 1000, p: h.p })));
          } else {
            console.warn("[History] NO fetch failed", noRes.reason);
            setBackfillNo([]);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[History] batch fetch unexpected error", err);
          setBackfillYes([]);
          setBackfillNo([]);
          setError("Failed to fetch history");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [market, _tf]);

  return { backfillYes, backfillNo, loading, error } as const;
}

export default useMarketHistory;
