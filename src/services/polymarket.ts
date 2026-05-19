import axios from "axios";
import { z } from "zod";
import type { ResolvedMarket } from "@/lib/types";

const HistorySchema = z
  .object({ history: z.array(z.object({ t: z.number(), p: z.number() })) })
  .or(z.array(z.object({ t: z.number(), p: z.number() })));

export type HistoryPoint = { t: number; p: number };

export async function resolveMarket(url: string): Promise<ResolvedMarket> {
  try {
    const { data } = await axios.post("/api/resolve", { url });
    return data as ResolvedMarket;
  } catch (e) {
    // Surface the structured `error` field from /api/resolve (e.g. 422 "unsupported event")
    // instead of the generic axios "Request failed with status code N" message.
    if (axios.isAxiosError(e)) {
      const msg = (e.response?.data as { error?: unknown } | undefined)?.error;
      if (typeof msg === "string" && msg.trim()) throw new Error(msg);
    }
    throw e;
  }
}

export async function fetchHistory(tokenId: string, fidelity: string = "1"): Promise<HistoryPoint[]> {
  const { data } = await axios.get("/api/history", { params: { tokenId, fidelity } });
  const parsed = HistorySchema.parse(data);
  return Array.isArray(parsed) ? parsed : parsed.history;
}
