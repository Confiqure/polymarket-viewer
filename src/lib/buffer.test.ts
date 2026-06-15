import { describe, expect, it } from "vitest";
import { TimeSeries, countAtOrBefore, lerpAt } from "./buffer";

describe("countAtOrBefore", () => {
  const pts = [10, 20, 30, 40, 50].map((t) => ({ t, p: 0.5 }));

  it("counts points at or before ts (inclusive)", () => {
    expect(countAtOrBefore(pts, 30)).toBe(3);
    expect(countAtOrBefore(pts, 35)).toBe(3);
    expect(countAtOrBefore(pts, 50)).toBe(5);
  });

  it("handles out-of-range and empty inputs", () => {
    expect(countAtOrBefore(pts, 5)).toBe(0);
    expect(countAtOrBefore(pts, 999)).toBe(5);
    expect(countAtOrBefore([], 10)).toBe(0);
  });
});

describe("TimeSeries.push", () => {
  it("appends in order", () => {
    const s = new TimeSeries();
    s.push({ t: 1, p: 0.5 });
    s.push({ t: 2, p: 0.6 });
    expect(s.toArray()).toEqual([
      { t: 1, p: 0.5 },
      { t: 2, p: 0.6 },
    ]);
  });

  it("trims by maxPoints", () => {
    const s = new TimeSeries({ maxPoints: 3 });
    for (let i = 0; i < 5; i++) s.push({ t: i, p: i / 10 });
    expect(s.toArray()).toHaveLength(3);
    expect(s.toArray()[0]).toEqual({ t: 2, p: 0.2 });
  });

  it("trims by maxAgeMs", () => {
    const s = new TimeSeries({ maxAgeMs: 100 });
    s.push({ t: 0, p: 0.1 });
    s.push({ t: 50, p: 0.2 });
    s.push({ t: 200, p: 0.3 }); // cutoff = 100 -> drops t=0
    expect(s.toArray()).toEqual([{ t: 200, p: 0.3 }]);
  });
});

describe("TimeSeries.atOrBefore", () => {
  it("returns undefined on empty", () => {
    expect(new TimeSeries().atOrBefore(10)).toBeUndefined();
  });

  it("returns the exact match", () => {
    const s = new TimeSeries();
    s.push({ t: 5, p: 0.5 });
    s.push({ t: 10, p: 0.6 });
    expect(s.atOrBefore(10)).toEqual({ t: 10, p: 0.6 });
  });

  it("returns the most recent point at or before ts", () => {
    const s = new TimeSeries();
    s.push({ t: 5, p: 0.5 });
    s.push({ t: 10, p: 0.6 });
    s.push({ t: 15, p: 0.7 });
    expect(s.atOrBefore(12)).toEqual({ t: 10, p: 0.6 });
  });

  it("returns undefined when ts is before all points", () => {
    const s = new TimeSeries();
    s.push({ t: 10, p: 0.6 });
    expect(s.atOrBefore(5)).toBeUndefined();
  });
});

describe("lerpAt", () => {
  it("interpolates between two points", () => {
    const s = new TimeSeries();
    s.push({ t: 0, p: 0 });
    s.push({ t: 100, p: 1 });
    const r = lerpAt(s, 50);
    expect(r?.p).toBeCloseTo(0.5);
  });

  it("returns last point when ts is past the end", () => {
    const s = new TimeSeries();
    s.push({ t: 0, p: 0 });
    s.push({ t: 100, p: 1 });
    expect(lerpAt(s, 200)).toEqual({ t: 100, p: 1 });
  });
});
