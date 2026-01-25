import { z } from "zod";

export const GammaMarketSchema = z.object({
  id: z.string().optional(),
  question: z.string().nullable(),
  conditionId: z.string(),
  slug: z.string().nullable(),
  endDateIso: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
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

export async function fetchMarketsBySlug(slug: string): Promise<GammaMarket[]> {
  try {
    const url = new URL("https://gamma-api.polymarket.com/markets");
    url.searchParams.set("slug", slug);

    const res = await fetch(url.toString(), {
      next: { revalidate: 60 },
    });

    if (!res.ok) return [];

    const data = await res.json();

    if (!Array.isArray(data)) return [];

    return data
      .map((d: unknown) => {
        const p = GammaMarketSchema.safeParse(d);
        return p.success ? p.data : null;
      })
      .filter((d): d is GammaMarket => d !== null);
  } catch (e) {
    console.warn("[Gamma] fetch failed:", e instanceof Error ? e.message : "unknown error");
    return [];
  }
}
