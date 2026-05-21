import { describe, expect, it } from "vitest";
import { filterVisibleOptions, gammaMarketToOption, gammaMarketToRef, interpretEvent, slugifyLabel } from "./market";
import type { GammaEvent, GammaMarket } from "./gamma";

function binaryMarket(overrides: Partial<GammaMarket> = {}): GammaMarket {
  return {
    question: "Will X happen?",
    conditionId: "0xcond123",
    slug: "will-x-happen",
    clobTokenIds: '["111111","222222"]',
    outcomes: '["Yes","No"]',
    closed: false,
    active: true,
    ...overrides,
  } as GammaMarket;
}

describe("slugifyLabel", () => {
  it("lowercases and dasherizes", () => {
    expect(slugifyLabel("Hello World!")).toBe("hello-world");
  });

  it("strips leading/trailing dashes", () => {
    expect(slugifyLabel("--foo bar--")).toBe("foo-bar");
  });

  it("truncates to 64 chars", () => {
    const long = "a".repeat(100);
    expect(slugifyLabel(long)).toHaveLength(64);
  });
});

describe("gammaMarketToRef", () => {
  it("returns null when token list is not 2", () => {
    expect(gammaMarketToRef(binaryMarket({ clobTokenIds: '["only-one"]' }))).toBeNull();
  });

  it("identifies YES token from outcomes", () => {
    const ref = gammaMarketToRef(binaryMarket());
    expect(ref).not.toBeNull();
    expect(ref!.yesTokenId).toBe("111111");
    expect(ref!.noTokenId).toBe("222222");
    expect(ref!.yesLabel).toBe("Yes");
    expect(ref!.noLabel).toBe("No");
  });

  it("falls back to index 0 when 'Yes' is not present", () => {
    const ref = gammaMarketToRef(binaryMarket({ outcomes: '["Apple","Orange"]' }));
    expect(ref!.yesTokenId).toBe("111111");
    expect(ref!.yesLabel).toBe("Apple");
    expect(ref!.noLabel).toBe("Orange");
  });
});

describe("gammaMarketToOption", () => {
  it("uses groupItemTitle when present", () => {
    const opt = gammaMarketToOption(binaryMarket({ groupItemTitle: "Candidate A" }));
    expect(opt!.label).toBe("Candidate A");
    expect(opt!.id).toBe("candidate-a");
  });

  it("reads lastTradePrice as number", () => {
    const opt = gammaMarketToOption(binaryMarket({ lastTradePrice: "0.42" }));
    expect(opt!.lastPrice).toBeCloseTo(0.42);
  });

  it("falls back to outcomePrices[yesIdx]", () => {
    const opt = gammaMarketToOption(binaryMarket({ lastTradePrice: undefined, outcomePrices: '["0.7","0.3"]' }));
    expect(opt!.lastPrice).toBeCloseTo(0.7);
  });
});

describe("filterVisibleOptions", () => {
  it("hides options with no price or zero price", () => {
    const opts = [
      { lastPrice: 0.5 } as never,
      { lastPrice: 0 } as never,
      { lastPrice: undefined } as never,
      { lastPrice: 0.1 } as never,
    ];
    expect(filterVisibleOptions(opts)).toHaveLength(2);
  });
});

describe("interpretEvent", () => {
  function makeEvent(markets: GammaMarket[], overrides: Partial<GammaEvent> = {}): GammaEvent {
    return {
      slug: "event-slug",
      title: "Test Event",
      markets,
      ...overrides,
    } as GammaEvent;
  }

  it("returns unsupported when there are no tradeable markets", () => {
    const r = interpretEvent(makeEvent([]));
    expect(r.kind).toBe("unsupported");
  });

  it("unwraps a single binary market to a SingleMarketResolution", () => {
    const r = interpretEvent(makeEvent([binaryMarket()]));
    expect(r.kind).toBe("market");
  });

  it("returns an EventRef for multi-binary events", () => {
    const r = interpretEvent(
      makeEvent([
        binaryMarket({ conditionId: "0x1", clobTokenIds: '["a","b"]', groupItemTitle: "Trump" }),
        binaryMarket({ conditionId: "0x2", clobTokenIds: '["c","d"]', groupItemTitle: "Biden" }),
      ]),
    );
    expect(r.kind).toBe("event");
    if (r.kind === "event") {
      expect(r.event.options).toHaveLength(2);
    }
  });
});
