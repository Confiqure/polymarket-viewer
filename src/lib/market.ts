import type { GammaEvent, GammaMarket } from "@/lib/gamma";
import { parseListField } from "@/lib/data";
import type { EventRef, MarketOption, MarketRef, SingleMarketResolution } from "@/lib/types";

/** Slugify a free-form label for use as a stable URL identifier. */
export function slugifyLabel(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function toNum(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

/** Returns {tokenIds, outcomes} if the market is a valid 2-token binary; otherwise null. */
function extractBinaryTokens(m: GammaMarket): { tokenIds: string[]; outcomes: string[] } | null {
  const tokenIds = parseListField(m.clobTokenIds);
  const shortOuts = parseListField(m.shortOutcomes);
  const longOuts = parseListField(m.outcomes);
  const outcomes = shortOuts.length ? shortOuts : longOuts;
  if (tokenIds.length !== 2) return null;
  return { tokenIds, outcomes };
}

/** Convert a binary Gamma market into the app's MarketRef shape. Returns null if not binary. */
export function gammaMarketToRef(m: GammaMarket): MarketRef | null {
  const tk = extractBinaryTokens(m);
  if (!tk) return null;
  let yesIdx = tk.outcomes.findIndex((o) => /^yes$/i.test(o));
  if (yesIdx < 0) yesIdx = 0;
  const noIdx = yesIdx === 0 ? 1 : 0;
  return {
    question: m.question ?? "",
    conditionId: m.conditionId,
    yesTokenId: tk.tokenIds[yesIdx],
    noTokenId: tk.tokenIds[noIdx],
    endDateIso: m.endDateIso ?? m.endDate ?? undefined,
    slug: m.slug ?? undefined,
    yesLabel: tk.outcomes[yesIdx] ?? "Yes",
    noLabel: tk.outcomes[noIdx] ?? "No",
    image: m.image ?? m.icon ?? undefined,
  };
}

/** Convert a binary Gamma sub-market into a MarketOption for an event picker. Returns null if not binary. */
export function gammaMarketToOption(m: GammaMarket): MarketOption | null {
  const tk = extractBinaryTokens(m);
  if (!tk) return null;
  let yesIdx = tk.outcomes.findIndex((o) => /^yes$/i.test(o));
  if (yesIdx < 0) yesIdx = 0;
  const noIdx = yesIdx === 0 ? 1 : 0;

  const label = (m.groupItemTitle?.trim() || m.question?.trim() || m.slug || m.conditionId).toString();
  const id = slugifyLabel(label) || m.conditionId.slice(0, 12);

  // Prefer lastTradePrice; fall back to outcomePrices[yesIdx]
  let lastPrice = toNum(m.lastTradePrice);
  if (lastPrice == null) {
    const prices = parseListField(m.outcomePrices).map((p) => parseFloat(p));
    if (Number.isFinite(prices[yesIdx])) lastPrice = prices[yesIdx];
  }

  return {
    id,
    conditionId: m.conditionId,
    yesTokenId: tk.tokenIds[yesIdx],
    noTokenId: tk.tokenIds[noIdx],
    label,
    question: m.question ?? "",
    yesLabel: tk.outcomes[yesIdx] ?? "Yes",
    noLabel: tk.outcomes[noIdx] ?? "No",
    image: m.image ?? undefined,
    icon: m.icon ?? undefined,
    lastPrice,
    volume: toNum(m.volume),
    volume24hr: toNum(m.volume24hr),
    closed: Boolean(m.closed),
    active: m.active !== false,
  };
}

/** Sort options for picker display: open first (by YES probability desc); closed last (same). */
export function sortOptionsForPicker(opts: MarketOption[]): MarketOption[] {
  const byPrice = (a: MarketOption, b: MarketOption) => (b.lastPrice ?? 0) - (a.lastPrice ?? 0);
  const open = opts.filter((o) => !o.closed).sort(byPrice);
  const closed = opts.filter((o) => o.closed).sort(byPrice);
  return [...open, ...closed];
}

/** Hide effectively-untraded options (never traded, or YES price floored to zero) for the picker. */
export function filterVisibleOptions(opts: MarketOption[]): MarketOption[] {
  return opts.filter((o) => o.lastPrice != null && o.lastPrice > 0);
}

/** Build a MarketRef for the active candidate, decorated with event-aware display names. */
export function optionToActiveRef(opt: MarketOption, event: { title: string; endDateIso?: string }): MarketRef {
  // For both negRisk and ordinary categorical events, NO on a specific candidate is
  // best described as "Not {candidate}". We deliberately avoid the futures-betting
  // term "Field" because Polymarket's own UI just uses No.
  const oppositeDisplayName = `Not ${opt.label}`;
  return {
    question: event.title,
    conditionId: opt.conditionId,
    yesTokenId: opt.yesTokenId,
    noTokenId: opt.noTokenId,
    endDateIso: event.endDateIso,
    slug: undefined, // event mode uses event slug for the external link
    yesLabel: opt.label,
    noLabel: oppositeDisplayName,
    displayName: opt.label,
    oppositeDisplayName,
    image: opt.image ?? opt.icon,
  };
}

/** Top-level transform: try to interpret a Gamma event payload as an EventRef or unwrap to a single market. */
export function interpretEvent(
  event: GammaEvent,
): { kind: "event"; event: EventRef } | SingleMarketResolution | { kind: "unsupported"; reason: string } {
  const binary: Array<{ option: MarketOption; market: GammaMarket }> = [];
  let nonBinaryCount = 0;
  for (const m of event.markets) {
    const opt = gammaMarketToOption(m);
    if (opt) binary.push({ option: opt, market: m });
    else nonBinaryCount += 1;
  }

  if (binary.length === 0) {
    if (nonBinaryCount > 0) {
      return {
        kind: "unsupported",
        reason: "This event contains only non-binary (categorical) markets, which aren't supported yet.",
      };
    }
    return { kind: "unsupported", reason: "This event has no tradeable markets." };
  }

  // Single binary market: unwrap to a normal MarketRef, preserving the original market slug
  // so the "Open on Polymarket" link and legacy single-market path keep working.
  if (binary.length === 1) {
    const { market: origMarket } = binary[0];
    const ref = gammaMarketToRef(origMarket);
    if (!ref) {
      return { kind: "unsupported", reason: "Could not interpret the single market in this event." };
    }
    return {
      kind: "market",
      market: {
        ...ref,
        question: ref.question || event.title || "",
        endDateIso: ref.endDateIso ?? event.endDate ?? undefined,
      },
    };
  }

  // Multi-option (negRisk-style) event.
  return {
    kind: "event",
    event: {
      kind: "event",
      slug: event.slug,
      title: event.title ?? event.slug,
      description: event.description ?? undefined,
      image: event.image ?? undefined,
      icon: event.icon ?? undefined,
      endDateIso: event.endDate ?? undefined,
      negRisk: Boolean(event.enableNegRisk || event.negRisk),
      options: sortOptionsForPicker(binary.map((b) => b.option)),
    },
  };
}
