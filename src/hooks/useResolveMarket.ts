"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ResolvedMarketSchema, type ResolvedMarket } from "@/lib/types";

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

  const unquoted = s.replace(/^"|"$/g, "");

  if (/^(www\.)?polymarket\.com/i.test(unquoted)) {
    return `https://${unquoted.replace(/^www\./i, "")}`;
  }
  if (/^(?:\/)?(market|event)\//i.test(unquoted)) {
    const path = unquoted.replace(/^\/+/, "");
    return `https://polymarket.com/${path}`;
  }
  if (/^[a-z0-9][a-z0-9-_]{3,}$/i.test(unquoted)) {
    return `https://polymarket.com/market/${unquoted}`;
  }
  return null;
}

async function resolveMarket(url: string): Promise<ResolvedMarket> {
  const res = await fetch("/api/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    let message = `Failed to resolve market (${res.status})`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body?.error === "string" && body.error.trim()) message = body.error;
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(message);
  }
  const data = await res.json();
  const parsed = ResolvedMarketSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Received an unexpected response from /api/resolve");
  }
  return parsed.data;
}

export function useResolveMarket({
  marketUrl,
  enabled = true,
  onResolved,
  debounceMs = 400,
  initialResolvedUrl,
}: {
  marketUrl: string;
  enabled?: boolean;
  onResolved: (resolved: ResolvedMarket, resolvedUrl: string) => void;
  debounceMs?: number;
  /** If the consumer already has a resolved market for this URL (e.g. from SSR),
   *  seed it here to skip a redundant client-side resolve on mount. */
  initialResolvedUrl?: string;
}) {
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastResolvedRef = useRef<string>(
    initialResolvedUrl ? (normalizePolymarketInput(initialResolvedUrl) ?? "") : "",
  );
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
      const m = await resolveMarket(target);
      // Stale-resolve guard: if the input URL changed (or was cleared) during the
      // await, drop this result rather than overwrite the user's current state.
      if (marketUrlRef.current.trim() !== raw && !u) return;
      onResolvedRef.current(m, target);
      lastResolvedRef.current = target;
    } catch (e: unknown) {
      // Ignore errors from stale calls — the user has moved on.
      if (marketUrlRef.current.trim() !== raw && !u) return;
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
    if (!normalized) return;
    if (normalized === lastResolvedRef.current) return;
    const id = setTimeout(() => {
      if (marketUrl.trim() === raw && normalized !== lastResolvedRef.current) {
        resolveNow(normalized);
      }
    }, debounceMs);
    return () => clearTimeout(id);
  }, [enabled, marketUrl, resolveNow, debounceMs]);

  return { resolving, error, resolveNow, setError } as const;
}

export default useResolveMarket;
