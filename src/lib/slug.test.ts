import { describe, expect, it } from "vitest";
import { extractSlug } from "./slug";

describe("extractSlug", () => {
  it("returns null on empty input", () => {
    expect(extractSlug("")).toBeNull();
  });

  it("returns null on non-URL garbage", () => {
    expect(extractSlug("not a url at all")).toBeNull();
  });

  it("extracts slug after /event/", () => {
    expect(extractSlug("https://polymarket.com/event/some-event-slug")).toBe("some-event-slug");
  });

  it("extracts slug after /event/ even with trailing segments", () => {
    expect(extractSlug("https://polymarket.com/event/some-event-slug/extra")).toBe("some-event-slug");
  });

  it("extracts last segment for /market/ URLs", () => {
    expect(extractSlug("https://polymarket.com/market/binary-market")).toBe("binary-market");
  });

  it("ignores query string and hash", () => {
    expect(extractSlug("https://polymarket.com/event/foo?bar=1#baz")).toBe("foo");
  });

  it("returns last segment for unrecognized paths", () => {
    expect(extractSlug("https://polymarket.com/foo/bar/baz")).toBe("baz");
  });
});
