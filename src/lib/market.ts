import type { GammaEvent, GammaMarket } from "@/lib/gamma";
import { parseListField, toNum } from "@/lib/data";
import type { EventRef, MarketOption, MatchupOutcome, MarketRef, SingleMarketResolution } from "@/lib/types";

/** Slugify a free-form label for use as a stable URL identifier. */
export function slugifyLabel(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
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

  const rawLabel = (m.groupItemTitle?.trim() || m.question?.trim() || m.slug || m.conditionId).toString();
  // A soccer/3-way draw sub-market arrives as e.g. "Draw (France vs. Senegal)"; show just "Draw".
  const isDraw = m.sportsMarketType === "moneyline" && /\bdraw\b/i.test(rawLabel);
  const label = isDraw ? "Draw" : rawLabel;
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
    sportsMarketType: m.sportsMarketType ?? undefined,
    image: m.image ?? undefined,
    icon: m.icon ?? undefined,
    lastPrice,
    volume: toNum(m.volume),
    volume24hr: toNum(m.volume24hr),
    closed: Boolean(m.closed),
    active: m.active !== false,
  };
}

/**
 * Sort options for picker display. The moneyline (the core head-to-head "vs" market for a
 * sports game) always leads so it's the default selection — even when it has already resolved
 * while sibling prop markets are still open. After that, tradeable (open) options come before
 * resolved (closed) ones, then by YES probability desc within each group.
 */
export function sortOptionsForPicker(opts: MarketOption[]): MarketOption[] {
  const isMoneyline = (o: MarketOption) => o.sportsMarketType === "moneyline";
  return [...opts].sort((a, b) => {
    if (isMoneyline(a) !== isMoneyline(b)) return isMoneyline(a) ? -1 : 1;
    if (a.closed !== b.closed) return a.closed ? 1 : -1;
    return (b.lastPrice ?? 0) - (a.lastPrice ?? 0);
  });
}

/** Hide effectively-untraded options (never traded, or YES price floored to zero) for the picker. */
export function filterVisibleOptions(opts: MarketOption[]): MarketOption[] {
  return opts.filter((o) => o.lastPrice != null && o.lastPrice > 0);
}

/**
 * Detect a draw-supporting head-to-head (e.g. soccer) and return its outcomes ordered
 * Home → Draw → Away. Returns null when the event isn't a 3-way match. The two sides are
 * assigned from the event title ("Home vs. Away"); if that can't disambiguate them, their
 * existing order is preserved.
 */
export function buildMatchup(eventTitle: string, options: MarketOption[]): MatchupOutcome[] | null {
  const moneyline = options.filter((o) => o.sportsMarketType === "moneyline");
  const draw = moneyline.find((o) => o.label === "Draw");
  const teams = moneyline.filter((o) => o !== draw);
  if (!draw || teams.length < 2) return null;

  const [homeName, awayName] = eventTitle.split(/\s+vs\.?\s+/i).map((s) => s.trim().toLowerCase());
  const matches = (o: MarketOption, name?: string) => {
    if (!name) return false;
    const l = o.label.toLowerCase();
    return l === name || name.includes(l) || l.includes(name);
  };
  let home = teams.find((o) => matches(o, homeName));
  let away = teams.find((o) => o !== home && matches(o, awayName));
  if (!home || !away) {
    [home, away] = teams;
  }

  return [
    { optionId: home.id, label: home.label, role: "home" },
    { optionId: draw.id, label: draw.label, role: "draw" },
    { optionId: away.id, label: away.label, role: "away" },
  ];
}

/** Build a MarketRef for the active candidate, decorated with event-aware display names. */
export function optionToActiveRef(opt: MarketOption, event: { title: string; endDateIso?: string }): MarketRef {
  // A categorical/negRisk candidate market has generic Yes/No outcomes, where the option
  // label IS the candidate ("Yankees") and NO means "anyone but" — best described as
  // "Not {candidate}". We deliberately avoid the futures-betting term "Field" because
  // Polymarket's own UI just uses No.
  //
  // A head-to-head market (e.g. an MLB moneyline) instead carries real outcome names
  // ("Red Sox" / "Yankees") and a matchup-style label ("Red Sox vs. Yankees"). Those
  // outcome names are already the correct YES/NO labels, so we must NOT flatten them to
  // "{matchup}" / "Not {matchup}".
  const isCandidateMarket = /^yes$/i.test(opt.yesLabel) && /^no$/i.test(opt.noLabel);
  const yesLabel = isCandidateMarket ? opt.label : opt.yesLabel;
  const noLabel = isCandidateMarket ? `Not ${opt.label}` : opt.noLabel;
  return {
    question: event.title,
    conditionId: opt.conditionId,
    yesTokenId: opt.yesTokenId,
    noTokenId: opt.noTokenId,
    endDateIso: event.endDateIso,
    slug: undefined, // event mode uses event slug for the external link
    yesLabel,
    noLabel,
    displayName: yesLabel,
    oppositeDisplayName: noLabel,
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
  const title = event.title ?? event.slug;
  const options = sortOptionsForPicker(binary.map((b) => b.option));
  return {
    kind: "event",
    event: {
      kind: "event",
      slug: event.slug,
      title,
      description: event.description ?? undefined,
      image: event.image ?? undefined,
      icon: event.icon ?? undefined,
      endDateIso: event.endDate ?? undefined,
      negRisk: Boolean(event.enableNegRisk || event.negRisk),
      options,
      matchup: buildMatchup(title, options) ?? undefined,
    },
  };
}
