"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ResolvedMarket } from "@/lib/types";
import { resolveMarket as svcResolveMarket } from "@/services/polymarket";

function isAbsoluteHttpUrl(u: string) {
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizePolymarketInput(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (isAbsoluteHttpUrl(s)) return s;

  // Strip surrounding quotes accidentally pasted
  const unquoted = s.replace(/^"|"$/g, "");

  // Starts with domain but no protocol
  if (/^(www\.)?polymarket\.com/i.test(unquoted)) {
    return `https://${unquoted.replace(/^www\./i, "")}`;
  }

  // Starts with path only
  if (/^(?:\/)?(market|event)\//i.test(unquoted)) {
    const path = unquoted.replace(/^\/+/, "");
    return `https://polymarket.com/${path}`;
  }

  // Likely a slug (letters, numbers, dashes/underscores) — default to market
  if (/^[a-z0-9][a-z0-9-_]{3,}$/i.test(unquoted)) {
    return `https://polymarket.com/market/${unquoted}`;
  }

  return null;
}

export function useResolveMarket({
  marketUrl,
  enabled = true,
  onResolved,
  debounceMs = 400,
}: {
  marketUrl: string;
  enabled?: boolean;
  onResolved: (resolved: ResolvedMarket, resolvedUrl: string) => void;
  debounceMs?: number;
}) {
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastResolvedRef = useRef<string>("");
  const onResolvedRef = useRef(onResolved);
  const marketUrlRef = useRef(marketUrl);

  useEffect(() => {
    onResolvedRef.current = onResolved;
    marketUrlRef.current = marketUrl;
  }, [onResolved, marketUrl]);

  const resolveNow = useCallback(async (u?: string) => {
    setError(null);
    const raw = (u ?? marketUrlRef.current).trim();
    if (!raw) return;
    const target = normalizePolymarketInput(raw);
    if (!target) return;
    try {
      setResolving(true);
      const m = await svcResolveMarket(target);
      onResolvedRef.current(m, target);
      lastResolvedRef.current = target;
    } catch (e: unknown) {
      let message = "Failed to resolve market";
      if (e instanceof Error) message = e.message;
      setError(message);
    } finally {
      setResolving(false);
    }
  }, []);

  // Auto-resolve when the input URL changes (debounced)
  useEffect(() => {
    if (!enabled) return;
    const raw = marketUrl.trim();
    if (!raw) return;
    const normalized = normalizePolymarketInput(raw);
    if (!normalized) return; // ignore clearly invalid inputs
    if (normalized === lastResolvedRef.current) return;
    const id = setTimeout(() => {
      // Ensure the input didn't change during debounce
      if (marketUrl.trim() === raw && normalized !== lastResolvedRef.current) {
        resolveNow(normalized);
      }
    }, debounceMs);
    return () => clearTimeout(id);
  }, [enabled, marketUrl, resolveNow, debounceMs]);

  return { resolving, error, resolveNow, setError } as const;
}

export default useResolveMarket;
