import { z } from "zod";

export const MarketRefSchema = z.object({
  question: z.string(),
  conditionId: z.string(),
  yesTokenId: z.string(),
  noTokenId: z.string(),
  endDateIso: z.string().optional(),
  slug: z.string().optional(),
  yesLabel: z.string().optional(),
  noLabel: z.string().optional(),
  displayName: z.string().optional(),
  oppositeDisplayName: z.string().optional(),
  image: z.string().optional(),
});

export type MarketRef = z.infer<typeof MarketRefSchema>;

export const MarketOptionSchema = z.object({
  id: z.string(),
  conditionId: z.string(),
  yesTokenId: z.string(),
  noTokenId: z.string(),
  label: z.string(),
  question: z.string(),
  yesLabel: z.string(),
  noLabel: z.string(),
  sportsMarketType: z.string().optional(),
  image: z.string().optional(),
  icon: z.string().optional(),
  lastPrice: z.number().optional(),
  volume: z.number().optional(),
  volume24hr: z.number().optional(),
  closed: z.boolean(),
  active: z.boolean(),
});

export type MarketOption = z.infer<typeof MarketOptionSchema>;

/** One outcome of a draw-supporting head-to-head match (e.g. soccer), ordered Home → Draw → Away. */
export const MatchupOutcomeSchema = z.object({
  optionId: z.string(),
  label: z.string(),
  role: z.enum(["home", "draw", "away"]),
});

export type MatchupOutcome = z.infer<typeof MatchupOutcomeSchema>;

export const EventRefSchema = z.object({
  kind: z.literal("event"),
  slug: z.string(),
  title: z.string(),
  description: z.string().optional(),
  image: z.string().optional(),
  icon: z.string().optional(),
  endDateIso: z.string().optional(),
  negRisk: z.boolean(),
  options: z.array(MarketOptionSchema),
  // Present only for 3-way matches that support a draw; drives the tri-state selector.
  matchup: z.array(MatchupOutcomeSchema).optional(),
});

export type EventRef = z.infer<typeof EventRefSchema>;

export const SingleMarketResolutionSchema = z.object({
  kind: z.literal("market"),
  market: MarketRefSchema,
});

export type SingleMarketResolution = z.infer<typeof SingleMarketResolutionSchema>;

export const ResolvedMarketSchema = z.discriminatedUnion("kind", [EventRefSchema, SingleMarketResolutionSchema]);

export type ResolvedMarket = z.infer<typeof ResolvedMarketSchema>;

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
