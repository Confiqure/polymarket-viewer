"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketRef, PricePoint } from "@/lib/types";
import { fetchHistory } from "@/services/polymarket";

export function useMarketHistory(market: MarketRef | null) {
  const [backfillYes, setBackfillYes] = useState<PricePoint[]>([]);
  const [backfillNo, setBackfillNo] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetchRef = useRef<number>(0);
  const latestMarketRef = useRef(market);

  useEffect(() => {
    latestMarketRef.current = market;
  }, [market]);

  const fetchHistoryData = useCallback(
    async (isRefresh = false) => {
      if (!market) return;

      if (!isRefresh) {
        setBackfillYes([]);
        setBackfillNo([]);
      }

      try {
        setLoading(true);
        setError(null);
        const yesId = market.yesTokenId;
        const noId = market.noTokenId;
        const [yesRes, noRes] = await Promise.allSettled([fetchHistory(yesId, "1"), fetchHistory(noId, "1")]);

        // Prevent race conditions: if market changed while fetching, discard results
        if (market !== latestMarketRef.current) return;

        if (yesRes.status === "fulfilled") {
          setBackfillYes(yesRes.value.map((h) => ({ t: h.t * 1000, p: h.p })));
        } else {
          console.warn("[History] YES fetch failed", yesRes.reason);
          if (!isRefresh) setBackfillYes([]);
        }
        if (noRes.status === "fulfilled") {
          setBackfillNo(noRes.value.map((h) => ({ t: h.t * 1000, p: h.p })));
        } else {
          console.warn("[History] NO fetch failed", noRes.reason);
          if (!isRefresh) setBackfillNo([]);
        }
        lastFetchRef.current = Date.now();
      } catch (err) {
        if (market !== latestMarketRef.current) return;
        console.error("[History] batch fetch unexpected error", err);
        if (!isRefresh) {
          setBackfillYes([]);
          setBackfillNo([]);
        }
        setError("Failed to fetch history");
      } finally {
        if (market === latestMarketRef.current) setLoading(false);
      }
    },
    [market],
  );

  // Initial fetch when market changes
  useEffect(() => {
    fetchHistoryData(false);
  }, [fetchHistoryData]);

  // Refetch on visibility change if stale
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        if (now - lastFetchRef.current > 60 * 1000) {
          console.log("[History] App resumed, refreshing history to fill gaps");
          fetchHistoryData(true);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [fetchHistoryData]);

  return { backfillYes, backfillNo, loading, error } as const;
}

export default useMarketHistory;
