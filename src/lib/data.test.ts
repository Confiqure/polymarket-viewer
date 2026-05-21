import { describe, expect, it } from "vitest";
import { parseListField, toNum } from "./data";

describe("toNum", () => {
  it("returns undefined for null/undefined", () => {
    expect(toNum(null)).toBeUndefined();
    expect(toNum(undefined)).toBeUndefined();
  });

  it("returns the number for finite numbers", () => {
    expect(toNum(42)).toBe(42);
    expect(toNum(0)).toBe(0);
    expect(toNum(-1.5)).toBe(-1.5);
  });

  it("parses numeric strings", () => {
    expect(toNum("3.14")).toBe(3.14);
    expect(toNum("0")).toBe(0);
  });

  it("returns undefined for NaN/Infinity", () => {
    expect(toNum(NaN)).toBeUndefined();
    expect(toNum(Infinity)).toBeUndefined();
    expect(toNum("nan")).toBeUndefined();
    expect(toNum("notanumber")).toBeUndefined();
  });
});

describe("parseListField", () => {
  it("returns [] for falsy / empty", () => {
    expect(parseListField(null)).toEqual([]);
    expect(parseListField(undefined)).toEqual([]);
    expect(parseListField("")).toEqual([]);
    expect(parseListField("   ")).toEqual([]);
  });

  it("returns string arrays as-is (stringified)", () => {
    expect(parseListField(["a", "b"])).toEqual(["a", "b"]);
    expect(parseListField([1, 2])).toEqual(["1", "2"]);
  });

  it("parses JSON array strings", () => {
    expect(parseListField('["x","y","z"]')).toEqual(["x", "y", "z"]);
  });

  it("falls back to CSV split when JSON parse fails", () => {
    expect(parseListField("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("strips surrounding quotes from CSV elements", () => {
    expect(parseListField('"a","b","c"')).toEqual(["a", "b", "c"]);
  });
});
