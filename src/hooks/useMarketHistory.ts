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

  // Key history on the token pair, NOT the `market` object reference. Event pages rebuild a
  // fresh MarketRef on every 30s price-snapshot poll even though the tokens are unchanged;
  // keying on the object would wipe + refetch the chart each time (a visible flicker). History
  // is uniquely identified by tokenId, so we only refetch when a token actually changes.
  const yesTokenId = market?.yesTokenId;
  const noTokenId = market?.noTokenId;
  const tokenKey = yesTokenId && noTokenId ? `${yesTokenId}|${noTokenId}` : "";
  const latestTokenKeyRef = useRef(tokenKey);

  useEffect(() => {
    latestTokenKeyRef.current = tokenKey;
  }, [tokenKey]);

  const fetchHistoryData = useCallback(
    async (isRefresh = false) => {
      if (!yesTokenId || !noTokenId) return;
      const requestKey = `${yesTokenId}|${noTokenId}`;

      if (!isRefresh) {
        setBackfillYes([]);
        setBackfillNo([]);
      }

      try {
        setLoading(true);
        setError(null);
        const [yesRes, noRes] = await Promise.allSettled([fetchHistory(yesTokenId, "1"), fetchHistory(noTokenId, "1")]);

        // Stale-resolve guard: drop results if the active token pair changed mid-flight.
        if (requestKey !== latestTokenKeyRef.current) return;

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
        if (requestKey !== latestTokenKeyRef.current) return;
        if (!isRefresh) {
          setBackfillYes([]);
          setBackfillNo([]);
        }
        setError("Couldn't load price history");
      } finally {
        if (requestKey === latestTokenKeyRef.current) setLoading(false);
      }
    },
    [yesTokenId, noTokenId],
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
