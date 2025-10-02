"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketRef } from "@/lib/types";
import { resolveMarket as svcResolveMarket } from "@/services/polymarket";

function isLikelyUrl(u: string) {
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function useResolveMarket({
  marketUrl,
  enabled = true,
  onResolved,
  debounceMs = 400,
}: {
  marketUrl: string;
  enabled?: boolean;
  onResolved: (market: MarketRef, resolvedUrl: string) => void;
  debounceMs?: number;
}) {
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastResolvedRef = useRef<string>("");

  const resolveNow = useCallback(
    async (u?: string) => {
      setError(null);
      const target = (u ?? marketUrl).trim();
      if (!target) return;
      try {
        setResolving(true);
        const m = await svcResolveMarket(target);
        onResolved(m, target);
        lastResolvedRef.current = target;
      } catch (e: unknown) {
        let message = "Failed to resolve market";
        if (e instanceof Error) message = e.message;
        setError(message);
      } finally {
        setResolving(false);
      }
    },
    [marketUrl, onResolved],
  );

  // Auto-resolve when the input URL changes (debounced)
  useEffect(() => {
    if (!enabled) return;
    const target = marketUrl.trim();
    if (!target) return;
    if (!isLikelyUrl(target)) return; // avoid 500 from /api/resolve on non-URL text
    if (target === lastResolvedRef.current) return;
    const id = setTimeout(() => {
      if (marketUrl.trim() === target && target !== lastResolvedRef.current) {
        resolveNow(target);
      }
    }, debounceMs);
    return () => clearTimeout(id);
  }, [enabled, marketUrl, resolveNow, debounceMs]);

  return { resolving, error, resolveNow, setError } as const;
}

export default useResolveMarket;
