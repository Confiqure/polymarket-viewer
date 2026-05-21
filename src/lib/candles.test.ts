import { describe, expect, it } from "vitest";
import { buildCandles } from "./candles";

const MIN = 60_000;

describe("buildCandles", () => {
  it("returns [] for empty input", () => {
    expect(buildCandles([], MIN)).toEqual([]);
  });

  it("returns [] for non-positive interval", () => {
    expect(buildCandles([{ t: 0, p: 0.5 }], 0)).toEqual([]);
    expect(buildCandles([{ t: 0, p: 0.5 }], -1)).toEqual([]);
  });

  it("builds a single candle from one point", () => {
    const candles = buildCandles([{ t: 30_000, p: 0.5 }], MIN);
    expect(candles).toEqual([{ t: 0, open: 0.5, high: 0.5, low: 0.5, close: 0.5 }]);
  });

  it("buckets multiple points into one candle (OHLC)", () => {
    const points = [
      { t: 0, p: 0.5 }, // open
      { t: 10_000, p: 0.7 }, // high so far
      { t: 20_000, p: 0.3 }, // low
      { t: 50_000, p: 0.6 }, // close
    ];
    const [c] = buildCandles(points, MIN);
    expect(c.open).toBe(0.5);
    expect(c.high).toBe(0.7);
    expect(c.low).toBe(0.3);
    expect(c.close).toBe(0.6);
  });

  it("fills gap buckets with doji candles", () => {
    const points = [
      { t: 0, p: 0.5 },
      { t: 3 * MIN, p: 0.6 }, // gap of 2 buckets
    ];
    const candles = buildCandles(points, MIN);
    expect(candles).toHaveLength(4);
    // Synthetic buckets carry forward last close
    expect(candles[1]).toEqual({ t: MIN, open: 0.5, high: 0.5, low: 0.5, close: 0.5 });
    expect(candles[2]).toEqual({ t: 2 * MIN, open: 0.5, high: 0.5, low: 0.5, close: 0.5 });
  });

  it("does not fill gaps when fillGaps: false", () => {
    const points = [
      { t: 0, p: 0.5 },
      { t: 3 * MIN, p: 0.6 },
    ];
    const candles = buildCandles(points, MIN, { fillGaps: false });
    expect(candles).toHaveLength(2);
  });

  it("stitches subsequent opens to previous closes", () => {
    const points = [
      { t: 0, p: 0.5 }, // close = 0.5
      { t: MIN, p: 0.8 }, // open should be stitched to 0.5
    ];
    const candles = buildCandles(points, MIN);
    expect(candles[1].open).toBe(0.5);
    expect(candles[1].close).toBe(0.8);
    expect(candles[1].high).toBe(0.8);
    expect(candles[1].low).toBe(0.5);
  });
});
