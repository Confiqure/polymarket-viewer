export type MarketRef = {
  question: string;
  conditionId: string;
  yesTokenId: string;
  noTokenId: string;
  endDateIso?: string;
  slug?: string;
  yesLabel?: string;
  noLabel?: string;
  /** Display name shown in the OddsDisplay (e.g. candidate name for event options). */
  displayName?: string;
  /** Opposing label shown when POV=NO in event mode (e.g. "Field"). */
  oppositeDisplayName?: string;
  /** Optional image for the underlying entity (candidate avatar, team logo, etc.). */
  image?: string;
};

/** A single binary sub-market belonging to a multi-outcome (negRisk) event. */
export type MarketOption = {
  /** Stable identifier used in URLs (slugified groupItemTitle, falling back to market slug). */
  id: string;
  conditionId: string;
  yesTokenId: string;
  noTokenId: string;
  /** Human-readable name (e.g. candidate name) — from groupItemTitle, falling back to question. */
  label: string;
  question: string;
  yesLabel: string;
  noLabel: string;
  image?: string;
  icon?: string;
  /** Current YES probability snapshot from Gamma (0..1). */
  lastPrice?: number;
  volume?: number;
  volume24hr?: number;
  closed: boolean;
  active: boolean;
};

/** Resolved multi-outcome event (e.g. "KY-04 Republican Primary Winner"). */
export type EventRef = {
  kind: "event";
  slug: string;
  title: string;
  description?: string;
  image?: string;
  icon?: string;
  endDateIso?: string;
  negRisk: boolean;
  options: MarketOption[];
};

/** Resolved single binary market (legacy / direct-link case). */
export type SingleMarketResolution = {
  kind: "market";
  market: MarketRef;
};

/** Discriminated union returned by the /api/resolve endpoint. */
export type ResolvedMarket = EventRef | SingleMarketResolution;

export type PricePoint = { t: number; p: number };

export type Candle = {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type TOB = {
  bestBid?: number;
  bestAsk?: number;
  last?: number;
  updatedAt?: number;
};
