import { z } from "zod";

const NumLike = z.union([z.number(), z.string()]).nullable().optional();

export const GammaMarketSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  question: z.string().nullable(),
  conditionId: z.string(),
  slug: z.string().nullable(),
  endDateIso: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  groupItemTitle: z.string().nullable().optional(),
  groupItemThreshold: z.union([z.string(), z.number()]).nullable().optional(),
  closed: z.boolean().nullable().optional(),
  active: z.boolean().nullable().optional(),
  archived: z.boolean().nullable().optional(),
  volume: NumLike,
  volume24hr: NumLike,
  liquidity: NumLike,
  lastTradePrice: NumLike,
  bestBid: NumLike,
  bestAsk: NumLike,
  clobTokenIds: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional(),
  shortOutcomes: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional(),
  outcomes: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional(),
  outcomePrices: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional(),
});

export type GammaMarket = z.infer<typeof GammaMarketSchema>;

export const GammaEventSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  slug: z.string(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  enableNegRisk: z.boolean().nullable().optional(),
  negRisk: z.boolean().nullable().optional(),
  closed: z.boolean().nullable().optional(),
  active: z.boolean().nullable().optional(),
  markets: z.array(GammaMarketSchema).default([]),
});

export type GammaEvent = z.infer<typeof GammaEventSchema>;

export async function fetchMarketsBySlug(slug: string): Promise<GammaMarket[]> {
  try {
    const url = new URL("https://gamma-api.polymarket.com/markets");
    url.searchParams.set("slug", slug);

    const res = await fetch(url.toString(), {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const data = await res.json();

    if (!Array.isArray(data)) return [];

    return data
      .map((d: unknown) => {
        const p = GammaMarketSchema.safeParse(d);
        if (!p.success) {
          console.warn("[Gamma] market parse failed:", p.error.issues.slice(0, 3));
        }
        return p.success ? p.data : null;
      })
      .filter((d): d is GammaMarket => d !== null);
  } catch (e) {
    console.warn("[Gamma] markets fetch failed:", e instanceof Error ? e.message : "unknown error");
    return [];
  }
}

export async function fetchEventBySlug(slug: string): Promise<GammaEvent | null> {
  try {
    const url = new URL("https://gamma-api.polymarket.com/events");
    url.searchParams.set("slug", slug);

    const res = await fetch(url.toString(), {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const parsed = GammaEventSchema.safeParse(data[0]);
    if (!parsed.success) {
      console.warn("[Gamma] event parse failed:", parsed.error.issues.slice(0, 3));
      return null;
    }
    return parsed.data;
  } catch (e) {
    console.warn("[Gamma] event fetch failed:", e instanceof Error ? e.message : "unknown error");
    return null;
  }
}
