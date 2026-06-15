import { describe, expect, it } from "vitest";
import {
  buildMatchup,
  filterVisibleOptions,
  gammaMarketToOption,
  gammaMarketToRef,
  interpretEvent,
  optionToActiveRef,
  slugifyLabel,
  sortOptionsForPicker,
} from "./market";
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

describe("sortOptionsForPicker", () => {
  it("puts the moneyline first even when another market has a higher price", () => {
    const moneyline = gammaMarketToOption(
      binaryMarket({
        conditionId: "0xml",
        outcomes: '["Chicago White Sox","New York Yankees"]',
        lastTradePrice: "0.43",
        sportsMarketType: "moneyline",
      }),
    )!;
    const nrfi = gammaMarketToOption(
      binaryMarket({ conditionId: "0xnrfi", groupItemTitle: "NRFI", lastTradePrice: "0.49", sportsMarketType: "nrfi" }),
    )!;
    const sorted = sortOptionsForPicker([nrfi, moneyline]);
    expect(sorted[0].sportsMarketType).toBe("moneyline");
    expect(sorted[1].sportsMarketType).toBe("nrfi");
  });

  it("falls back to price desc when there is no moneyline", () => {
    const a = gammaMarketToOption(binaryMarket({ conditionId: "0xa", groupItemTitle: "A", lastTradePrice: "0.2" }))!;
    const b = gammaMarketToOption(binaryMarket({ conditionId: "0xb", groupItemTitle: "B", lastTradePrice: "0.8" }))!;
    const sorted = sortOptionsForPicker([a, b]);
    expect(sorted.map((o) => o.label)).toEqual(["B", "A"]);
  });
});

describe("draw markets + buildMatchup", () => {
  // A 3-way soccer event: two team sub-markets + a draw sub-market, all Yes/No moneylines.
  function threeWay() {
    return [
      gammaMarketToOption(
        binaryMarket({
          conditionId: "0xh",
          groupItemTitle: "France",
          sportsMarketType: "moneyline",
          lastTradePrice: "0.66",
        }),
      )!,
      gammaMarketToOption(
        binaryMarket({
          conditionId: "0xa",
          groupItemTitle: "Senegal",
          sportsMarketType: "moneyline",
          lastTradePrice: "0.13",
        }),
      )!,
      gammaMarketToOption(
        binaryMarket({
          conditionId: "0xd",
          groupItemTitle: "Draw (France vs. Senegal)",
          sportsMarketType: "moneyline",
          lastTradePrice: "0.21",
        }),
      )!,
    ];
  }

  it("cleans a draw sub-market label to just 'Draw'", () => {
    const draw = gammaMarketToOption(
      binaryMarket({ groupItemTitle: "Draw (France vs. Senegal)", sportsMarketType: "moneyline" }),
    )!;
    expect(draw.label).toBe("Draw");
    expect(draw.id).toBe("draw");
  });

  it("orders outcomes Home / Draw / Away from the event title", () => {
    const m = buildMatchup("France vs. Senegal", threeWay());
    expect(m).not.toBeNull();
    expect(m!.map((o) => `${o.role}:${o.label}`)).toEqual(["home:France", "draw:Draw", "away:Senegal"]);
  });

  it("returns null when there is no draw market (2-way game)", () => {
    const twoWay = [
      gammaMarketToOption(
        binaryMarket({ outcomes: '["Chicago White Sox","New York Yankees"]', sportsMarketType: "moneyline" }),
      )!,
    ];
    expect(buildMatchup("Chicago White Sox vs. New York Yankees", twoWay)).toBeNull();
  });

  it("interpretEvent attaches matchup metadata for a 3-way event", () => {
    const ev = {
      slug: "fra-sen",
      title: "France vs. Senegal",
      markets: [
        binaryMarket({
          conditionId: "0xh",
          clobTokenIds: '["h1","h2"]',
          groupItemTitle: "France",
          sportsMarketType: "moneyline",
        }),
        binaryMarket({
          conditionId: "0xa",
          clobTokenIds: '["a1","a2"]',
          groupItemTitle: "Senegal",
          sportsMarketType: "moneyline",
        }),
        binaryMarket({
          conditionId: "0xd",
          clobTokenIds: '["d1","d2"]',
          groupItemTitle: "Draw (France vs. Senegal)",
          sportsMarketType: "moneyline",
        }),
      ],
    } as unknown as GammaEvent;
    const r = interpretEvent(ev);
    expect(r.kind).toBe("event");
    if (r.kind === "event") {
      expect(r.event.matchup?.map((o) => o.role)).toEqual(["home", "draw", "away"]);
    }
  });
});

describe("optionToActiveRef", () => {
  const event = { title: "Chicago White Sox vs. New York Yankees", endDateIso: "2026-06-16T00:00:00Z" };

  it("keeps real outcome names for a head-to-head market", () => {
    // MLB moneyline: outcomes are team names, label is the matchup question.
    const opt = gammaMarketToOption(
      binaryMarket({
        question: "Chicago White Sox vs. New York Yankees",
        outcomes: '["Chicago White Sox","New York Yankees"]',
        groupItemTitle: undefined,
      }),
    )!;
    const ref = optionToActiveRef(opt, event);
    expect(ref.yesLabel).toBe("Chicago White Sox");
    expect(ref.noLabel).toBe("New York Yankees");
    expect(ref.displayName).toBe("Chicago White Sox");
    expect(ref.oppositeDisplayName).toBe("New York Yankees");
    // The question stays the matchup; YES/NO are never "Not {matchup}".
    expect(ref.noLabel).not.toMatch(/^Not /);
  });

  it("synthesizes 'Not {candidate}' for a categorical Yes/No market", () => {
    const opt = gammaMarketToOption(binaryMarket({ outcomes: '["Yes","No"]', groupItemTitle: "New York Yankees" }))!;
    const ref = optionToActiveRef(opt, { title: "MLB World Series Champion 2026" });
    expect(ref.yesLabel).toBe("New York Yankees");
    expect(ref.noLabel).toBe("Not New York Yankees");
    expect(ref.displayName).toBe("New York Yankees");
    expect(ref.oppositeDisplayName).toBe("Not New York Yankees");
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
