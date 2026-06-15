import { describe, expect, it } from "vitest";
import { classifyPolymarketPath } from "./resolve";

describe("classifyPolymarketPath", () => {
  it("classifies event and market URLs", () => {
    expect(classifyPolymarketPath("https://polymarket.com/event/fifwc-fra-sen-2026-06-16")).toBe("event");
    expect(classifyPolymarketPath("https://polymarket.com/market/will-x-happen")).toBe("market");
  });

  it("returns unknown for other or malformed inputs", () => {
    expect(classifyPolymarketPath("https://polymarket.com/")).toBe("unknown");
    expect(classifyPolymarketPath("https://polymarket.com/profile/abc")).toBe("unknown");
    expect(classifyPolymarketPath("not a url")).toBe("unknown");
  });
});
