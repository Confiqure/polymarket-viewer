"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const TickerContext = createContext<number>(0);

/**
 * Broadcasts `Date.now()` at a low frequency to subscribers via context.
 * Consumers re-render at most ~1 Hz instead of being driven by a top-level
 * `setInterval` that re-renders the whole tree.
 *
 * Server components should pass `initialNow={Date.now()}` so that SSR and the
 * first client render see the same value — otherwise any consumer that renders
 * time-sensitive text (e.g. "Ends in 27d 4h") would mismatch on hydration.
 */
export function TickerProvider({
  children,
  intervalMs = 1000,
  initialNow = 0,
}: {
  children: ReactNode;
  intervalMs?: number;
  initialNow?: number;
}) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return <TickerContext.Provider value={now}>{children}</TickerContext.Provider>;
}

/** Returns the latest `Date.now()` tick. Updates ~once per second. */
export function useTicker(): number {
  return useContext(TickerContext);
}
