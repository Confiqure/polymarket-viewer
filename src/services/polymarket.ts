import axios from "axios";
import { z } from "zod";
import type { MarketRef } from "@/lib/types";

const HistorySchema = z
  .object({ history: z.array(z.object({ t: z.number(), p: z.number() })) })
  .or(z.array(z.object({ t: z.number(), p: z.number() })));

export type HistoryPoint = { t: number; p: number };

export async function resolveMarket(url: string): Promise<MarketRef> {
  const { data } = await axios.post("/api/resolve", { url });
  return data as MarketRef;
}

export async function fetchHistory(tokenId: string, fidelity: string = "1"): Promise<HistoryPoint[]> {
  const { data } = await axios.get("/api/history", { params: { tokenId, fidelity } });
  const parsed = HistorySchema.parse(data);
  return Array.isArray(parsed) ? parsed : parsed.history;
}
