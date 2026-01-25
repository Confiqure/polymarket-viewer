import { Suspense } from "react";
import type { Metadata } from "next";
import HomeContent from "@/features/home/HomeContent";
import { extractSlug } from "@/lib/slug";
import { parseListField } from "@/lib/data";
import { fetchMarketsBySlug } from "@/lib/gamma";

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const resolvedParams = await searchParams;
  const urlParam = resolvedParams?.url;
  const url = Array.isArray(urlParam) ? urlParam[0] : urlParam;

  if (!url) return {};

  const slug = extractSlug(url);
  if (!slug) return {};

  try {
    const markets = await fetchMarketsBySlug(slug);
    const market = markets[0];

    if (!market || !market.question) return {};

    const outcomes = parseListField(market.outcomes);
    const prices = parseListField(market.outcomePrices);

    let oddsStr = "";
    if (outcomes.length > 0 && prices.length === outcomes.length) {
      const odds = outcomes.map((o: string, i: number) => {
        const p = parseFloat(prices[i]);
        const pct = Math.round(p * 100);
        return `${o}: ${pct}%`;
      });
      oddsStr = odds.join(" | ");
    }

    // Clean up the description: remove newlines and extra spaces
    const cleanDesc = (market.description || "").replace(/\s+/g, " ").trim();

    // Combine odds with the clean description using a bullet point
    const description = oddsStr ? `${oddsStr} • ${cleanDesc}` : cleanDesc;

    // Use the market image if available
    const images = market.image ? [market.image] : undefined;

    return {
      title: market.question,
      description: description || undefined,
      openGraph: {
        title: market.question,
        description: description || undefined,
        type: "website",
        images,
      },
      twitter: {
        card: "summary_large_image",
        title: market.question,
        description: description || undefined,
        images,
      },
    };
  } catch (e) {
    console.error("Error fetching metadata:", e);
    return {};
  }
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-black text-slate-200">
          <div className="mx-auto max-w-4xl px-4 py-6">
            <h1 className="text-2xl font-semibold">Polymarket Viewer</h1>
            <div className="mt-4 h-6 w-40 animate-pulse rounded bg-neutral-800" />
          </div>
        </main>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
