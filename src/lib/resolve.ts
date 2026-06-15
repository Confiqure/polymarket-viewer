import { extractSlug } from "@/lib/slug";
import { fetchEventBySlug, fetchMarketsBySlug } from "@/lib/gamma";
import { gammaMarketToRef, interpretEvent } from "@/lib/market";
import type { ResolvedMarket } from "@/lib/types";

/** Outcome of resolving a Polymarket URL, with enough detail for callers to pick a status. */
export type ResolveOutcome =
  | { kind: "ok"; resolved: ResolvedMarket }
  | { kind: "unsupported"; reason: string }
  | { kind: "invalid"; reason: string }
  | { kind: "notfound" };

/** Classify a Polymarket URL path so we try the more likely resolver first. */
export function classifyPolymarketPath(rawUrl: string): "event" | "market" | "unknown" {
  try {
    const parts = new URL(rawUrl).pathname.split("/").filter(Boolean);
    if (parts[0] === "event") return "event";
    if (parts[0] === "market") return "market";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Resolve a Polymarket event/market URL into the app's ResolvedMarket shape. Single source of
 * truth shared by the /api/resolve route and the server component's SSR pre-resolve, so their
 * ordering and classification can't drift apart.
 *
 * Tries event-first (or market-first for /market/ URLs), falling back to the other. Network
 * errors surface as `notfound` because the underlying gamma fetches already swallow them.
 */
export async function resolveMarketFromUrl(rawUrl: string): Promise<ResolveOutcome> {
  const slug = extractSlug(rawUrl);
  if (!slug) return { kind: "invalid", reason: "could not parse slug" };

  const pathKind = classifyPolymarketPath(rawUrl);
  const order: ReadonlyArray<"event" | "market"> = pathKind === "market" ? ["market", "event"] : ["event", "market"];

  let unsupportedReason: string | null = null;
  for (const step of order) {
    if (step === "event") {
      const event = await fetchEventBySlug(slug);
      if (event) {
        const interpreted = interpretEvent(event);
        if (interpreted.kind === "unsupported") {
          unsupportedReason = interpreted.reason;
          continue;
        }
        if (interpreted.kind === "market") return { kind: "ok", resolved: interpreted };
        return { kind: "ok", resolved: interpreted.event };
      }
    } else {
      const markets = await fetchMarketsBySlug(slug);
      for (const m of markets) {
        const ref = gammaMarketToRef(m);
        if (ref) return { kind: "ok", resolved: { kind: "market", market: ref } };
      }
    }
  }

  if (unsupportedReason) return { kind: "unsupported", reason: unsupportedReason };
  return { kind: "notfound" };
}
