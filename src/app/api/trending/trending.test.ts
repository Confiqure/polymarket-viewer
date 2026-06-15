import { describe, expect, it } from "vitest";
import { trendingScore } from "./route";

describe("trendingScore", () => {
  it("down-ranks a thin many-market event below a concentrated one with lower aggregate", () => {
    // Sprawling 128-market nominee event: large sum, no single active market.
    const thinBreadth = trendingScore(1_900_000, 346_000);
    // Focused single market with a lower aggregate but concentrated interest.
    const concentrated = trendingScore(2_717_714, 2_714_977);
    expect(concentrated).toBeGreaterThan(thinBreadth);
  });

  it("keeps a legitimately huge broad event above thin-breadth events", () => {
    const worldCup = trendingScore(82_600_000, 7_200_000); // 60 markets, hottest $7.2M
    const presWinner = trendingScore(818_513, 68_924); // 128 markets, hottest $69k
    expect(worldCup).toBeGreaterThan(presWinner);
  });

  it("equals aggregate volume for a single concentrated market (max == agg)", () => {
    expect(trendingScore(2_717_714, 2_717_714)).toBeCloseTo(2_717_714);
  });

  it("falls back to aggregate when per-market volume is unavailable", () => {
    expect(trendingScore(500_000, 0)).toBeCloseTo(500_000);
  });
});
