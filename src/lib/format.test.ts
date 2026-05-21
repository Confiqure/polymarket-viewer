import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatMoneyline,
  formatPercent,
  formatProbability,
  formatVolumeUsd,
  parseMarketEndDate,
} from "./format";

describe("formatDuration", () => {
  it("formats seconds only when under a minute", () => {
    expect(formatDuration(45_000)).toBe("45s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(125_000)).toBe("2m 5s");
  });

  it("formats hours, minutes, seconds", () => {
    expect(formatDuration(3661_000)).toBe("1h 1m 1s");
  });

  it("formats days and hours when over a day", () => {
    expect(formatDuration(2 * 86400_000 + 3 * 3600_000)).toBe("2d 3h");
  });

  it("clamps negative ms to 0s", () => {
    expect(formatDuration(-1)).toBe("0s");
  });
});

describe("formatPercent", () => {
  it("rounds to whole percent", () => {
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(0.674)).toBe("67%");
    expect(formatPercent(0.675)).toBe("68%");
  });
});

describe("formatMoneyline", () => {
  it('returns "—" at boundaries', () => {
    expect(formatMoneyline(0)).toBe("—");
    expect(formatMoneyline(1)).toBe("—");
  });

  it("returns negative odds for favorites", () => {
    expect(formatMoneyline(0.75)).toBe("-300");
  });

  it("returns + odds for underdogs", () => {
    expect(formatMoneyline(0.25)).toBe("+300");
  });
});

describe("formatProbability", () => {
  it('returns "—" on null/undefined/NaN', () => {
    expect(formatProbability(null)).toBe("—");
    expect(formatProbability(undefined)).toBe("—");
    expect(formatProbability(NaN)).toBe("—");
  });

  it('returns "<1%" for tiny non-zero values', () => {
    expect(formatProbability(0.001)).toBe("<1%");
  });

  it("returns rounded percent for normal values", () => {
    expect(formatProbability(0.42)).toBe("42%");
  });
});

describe("formatVolumeUsd", () => {
  it('returns "—" for null/undefined/non-positive', () => {
    expect(formatVolumeUsd(null)).toBe("—");
    expect(formatVolumeUsd(undefined)).toBe("—");
    expect(formatVolumeUsd(0)).toBe("—");
    expect(formatVolumeUsd(-100)).toBe("—");
  });

  it("formats millions with one decimal", () => {
    expect(formatVolumeUsd(1_250_000)).toBe("$1.3M");
  });

  it("formats thousands with one decimal", () => {
    expect(formatVolumeUsd(1_250)).toBe("$1.3K");
  });

  it("formats small amounts as whole dollars", () => {
    expect(formatVolumeUsd(42)).toBe("$42");
  });
});

describe("parseMarketEndDate", () => {
  it("returns null on missing input", () => {
    expect(parseMarketEndDate(null)).toBeNull();
    expect(parseMarketEndDate(undefined)).toBeNull();
    expect(parseMarketEndDate("")).toBeNull();
  });

  it("returns null on unparseable input", () => {
    expect(parseMarketEndDate("not-a-date")).toBeNull();
  });

  it("treats bare YYYY-MM-DD as end of day UTC", () => {
    const t = parseMarketEndDate("2026-05-21");
    expect(t).not.toBeNull();
    const d = new Date(t!);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4); // May = 4
    expect(d.getUTCDate()).toBe(21);
  });

  it("pushes midnight UTC to end-of-day", () => {
    const midnight = Date.parse("2026-05-21T00:00:00Z");
    const t = parseMarketEndDate("2026-05-21T00:00:00Z");
    expect(t).toBeGreaterThan(midnight + 23 * 3600_000);
  });

  it("preserves non-midnight times", () => {
    const t = parseMarketEndDate("2026-05-21T15:30:00Z");
    expect(t).toBe(Date.parse("2026-05-21T15:30:00Z"));
  });
});
