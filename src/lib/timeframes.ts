export const TIMEFRAME_MINUTES = [1, 2, 3, 4, 5, 7, 10, 15, 30, 60] as const;
export type TF = (typeof TIMEFRAME_MINUTES)[number];
export const TIMEFRAME_SET = new Set<number>(TIMEFRAME_MINUTES as unknown as number[]);
export const tfToMs = (tf: TF): number => tf * 60_000;
