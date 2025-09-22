export type MarketRef = {
  question: string;
  conditionId: string;
  yesTokenId: string;
  noTokenId: string;
  endDateIso?: string;
  slug?: string;
  yesLabel?: string;
  noLabel?: string;
};

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
