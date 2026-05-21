"use client";
import { useEffect, useRef, useState } from "react";
import { type MarketOption, ResolvedMarketSchema } from "@/lib/types";

/**
 * Lightweight periodic refresh of an event's per-option price snapshot.
 * Hits the existing /api/resolve endpoint so we re-use the same parsing path.
 * Returns null while we haven't yet fetched a refreshed snapshot (caller falls back to initial options).
 */
export function useEventSnapshot(eventSlug: string | undefined, intervalMs = 30_000) {
  const [snapshot, setSnapshot] = useState<MarketOption[] | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!eventSlug) {
      setSnapshot(null);
      setLastUpdated(null);
      return;
    }
    let cancelled = false;

    const fetchOnce = async () => {
      try {
        const url = `/api/resolve?url=${encodeURIComponent(`https://polymarket.com/event/${eventSlug}`)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !mountedRef.current) return;
        const parsed = ResolvedMarketSchema.safeParse(data);
        if (!parsed.success) return;
        if (parsed.data.kind === "event") {
          setSnapshot(parsed.data.options);
          setLastUpdated(Date.now());
        }
      } catch {
        // best-effort; ignore
      }
    };

    // Don't fire immediately — caller already has the initial payload from resolve.
    const id = setInterval(fetchOnce, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [eventSlug, intervalMs]);

  return { snapshot, lastUpdated } as const;
}

export default useEventSnapshot;
