"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { MarketRef, PricePoint } from "@/lib/types";

const HistorySchema = z
  .object({ history: z.array(z.object({ t: z.number(), p: z.number() })) })
  .or(z.array(z.object({ t: z.number(), p: z.number() })));

type HistoryPoint = { t: number; p: number };

async function fetchHistory(tokenId: string, fidelity: string = "1"): Promise<HistoryPoint[]> {
  const res = await fetch(
    `/api/history?tokenId=${encodeURIComponent(tokenId)}&fidelity=${encodeURIComponent(fidelity)}`,
    {
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) {
    throw new Error(`history_unavailable_${res.status}`);
  }
  const data = await res.json();
  const parsed = HistorySchema.parse(data);
  return Array.isArray(parsed) ? parsed : parsed.history;
}

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

        if (market !== latestMarketRef.current) return;

        if (yesRes.status === "fulfilled") {
          setBackfillYes(yesRes.value.map((h) => ({ t: h.t * 1000, p: h.p })));
        } else if (!isRefresh) {
          setBackfillYes([]);
        }
        if (noRes.status === "fulfilled") {
          setBackfillNo(noRes.value.map((h) => ({ t: h.t * 1000, p: h.p })));
        } else if (!isRefresh) {
          setBackfillNo([]);
        }

        if (yesRes.status === "rejected" && noRes.status === "rejected") {
          setError("Couldn't load price history");
        }

        lastFetchRef.current = Date.now();
      } catch {
        if (market !== latestMarketRef.current) return;
        if (!isRefresh) {
          setBackfillYes([]);
          setBackfillNo([]);
        }
        setError("Couldn't load price history");
      } finally {
        if (market === latestMarketRef.current) setLoading(false);
      }
    },
    [market],
  );

  useEffect(() => {
    fetchHistoryData(false);
  }, [fetchHistoryData]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        if (now - lastFetchRef.current > 60 * 1000) {
          fetchHistoryData(true);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [fetchHistoryData]);

  const refetch = useCallback(() => fetchHistoryData(true), [fetchHistoryData]);

  return { backfillYes, backfillNo, loading, error, refetch } as const;
}

export default useMarketHistory;
