"use client";
import { useEffect, useMemo, useRef } from "react";
import { TimeSeries } from "./buffer";
import type { TOB } from "./types";

export function useMarketWS(yesTokenId: string | undefined, noTokenId: string | undefined) {
  const seriesYesRef = useRef(new TimeSeries({ maxPoints: 50000, maxAgeMs: 1000 * 60 * 60 * 48 }));
  const seriesNoRef = useRef(new TimeSeries({ maxPoints: 50000, maxAgeMs: 1000 * 60 * 60 * 48 }));
  const tobRef = useRef<Record<string, TOB>>({});
  const pollTimer = useRef<NodeJS.Timeout | null>(null);

  // reset state when tokens change
  useEffect(() => {
  seriesYesRef.current = new TimeSeries({ maxPoints: 50000, maxAgeMs: 1000 * 60 * 60 * 48 });
  seriesNoRef.current = new TimeSeries({ maxPoints: 50000, maxAgeMs: 1000 * 60 * 60 * 48 });
    tobRef.current = {};
  }, [yesTokenId, noTokenId]);

  useEffect(() => {
    if (!yesTokenId || !noTokenId) return;
    const ids = [yesTokenId, noTokenId];
    tobRef.current[yesTokenId] = {};
    tobRef.current[noTokenId] = {};

    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
    const midFrom = (t: TOB | undefined): number | undefined => {
      if (!t) return undefined;
      const { bestBid: bb, bestAsk: ba, last } = t;
      if (bb != null && ba != null) return (bb + ba) / 2;
      if (last != null) return last;
      if (bb != null) return bb;
      if (ba != null) return ba;
      return undefined;
    };
    const computeBlendedProb = (): number | undefined => {
      const y = tobRef.current[yesTokenId];
      const n = tobRef.current[noTokenId];
      const my = midFrom(y);
      const mn = midFrom(n);
      if (my != null && mn != null) return clamp01((my + (1 - mn)) / 2);
      if (my != null) return clamp01(my);
      if (mn != null) return clamp01(1 - mn);
      return undefined;
    };
    const computeNoProb = (): number | undefined => {
      const y = tobRef.current[yesTokenId];
      const n = tobRef.current[noTokenId];
      const my = midFrom(y);
      const mn = midFrom(n);
      if (mn != null) return clamp01(mn);
      if (my != null) return clamp01(1 - my);
      return undefined;
    };

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "wss://ws-subscriptions-clob.polymarket.com/ws/";
    const ws = new WebSocket(wsUrl);
    console.debug("[WS] connecting", { wsUrl, ids });

    ws.onopen = () => {
      console.debug("[WS] open, subscribing", { ids });
      ws.send(JSON.stringify({ type: "MARKET", assets_ids: ids }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (process.env.NODE_ENV !== "production") {
          console.debug("[WS] message", { event_type: msg.event_type, asset_id: msg.asset_id, count: msg?.price_changes?.length });
        }
        if (msg.event_type === "book") {
          const id = msg.asset_id as string;
          const bids = msg.bids ?? msg.buys;
          const asks = msg.asks ?? msg.sells;
          if (bids?.length) tobRef.current[id].bestBid = parseFloat(bids[0].price);
          if (asks?.length) tobRef.current[id].bestAsk = parseFloat(asks[0].price);
        } else if (msg.event_type === "price_change") {
          for (const ch of msg.price_changes ?? []) {
            const id = ch.asset_id as string;
            if (ch.best_bid != null) tobRef.current[id].bestBid = parseFloat(ch.best_bid);
            if (ch.best_ask != null) tobRef.current[id].bestAsk = parseFloat(ch.best_ask);
          }
        } else if (msg.event_type === "last_trade_price") {
          const id = msg.asset_id as string;
          if (msg.price != null) tobRef.current[id].last = parseFloat(msg.price);
        }
        const tNow = Date.now();
        const probYes = computeBlendedProb();
        const probNo = computeNoProb();
        if (probYes != null && !Number.isNaN(probYes)) {
          seriesYesRef.current.push({ t: tNow, p: probYes });
        } else {
          const y = tobRef.current[yesTokenId];
          const n = tobRef.current[noTokenId];
          console.warn("[WS] skip push invalid prob", {
            yes: { bb: y?.bestBid, ba: y?.bestAsk, last: y?.last },
            no: { bb: n?.bestBid, ba: n?.bestAsk, last: n?.last },
          });
        }
        if (probNo != null && !Number.isNaN(probNo)) {
          seriesNoRef.current.push({ t: tNow, p: probNo });
        }
      } catch (err) {
        console.error("[WS] onmessage parse/error:", err);
      }
    };

    const startPolling = () => {
      if (pollTimer.current) return;
      console.warn("[WS] starting fallback REST polling");
      pollTimer.current = setInterval(async () => {
        try {
          const [buy, sell] = await Promise.all([
            fetch(`/api/price?tokenId=${encodeURIComponent(yesTokenId)}`).then((r) => r.json()),
            fetch(`/api/price?tokenId=${encodeURIComponent(noTokenId)}`).then((r) => r.json()),
          ]);
          console.debug("[Poll] price buy/sell:", buy, sell);
          if (buy?.bestBid != null) tobRef.current[yesTokenId].bestBid = parseFloat(buy.bestBid);
          if (buy?.bestAsk != null) tobRef.current[yesTokenId].bestAsk = parseFloat(buy.bestAsk);
          if (sell?.bestBid != null) tobRef.current[noTokenId].bestBid = parseFloat(sell.bestBid);
          if (sell?.bestAsk != null) tobRef.current[noTokenId].bestAsk = parseFloat(sell.bestAsk);
          const tNow = Date.now();
          const probYes = computeBlendedProb();
          const probNo = computeNoProb();
          if (probYes != null && !Number.isNaN(probYes)) {
            seriesYesRef.current.push({ t: tNow, p: probYes });
          } else {
            const y = tobRef.current[yesTokenId];
            const n = tobRef.current[noTokenId];
            console.warn("[Poll] skip push invalid prob", {
              yes: { bb: y?.bestBid, ba: y?.bestAsk, last: y?.last },
              no: { bb: n?.bestBid, ba: n?.bestAsk, last: n?.last },
            });
          }
          if (probNo != null && !Number.isNaN(probNo)) {
            seriesNoRef.current.push({ t: tNow, p: probNo });
          }
        } catch (e) {
          console.error("[Poll] error: ", e);
        }
      }, 2000);
    };

    ws.onclose = (ev) => {
      console.warn("[WS] closed", { code: ev.code, reason: ev.reason });
      startPolling();
    };
    ws.onerror = (ev) => {
      console.error("[WS] error", ev);
      startPolling();
    };

    return () => {
      ws.close();
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [yesTokenId, noTokenId]);

  const currentTOB = useMemo(() => tobRef.current, []);
  return { seriesYes: seriesYesRef.current, seriesNo: seriesNoRef.current, tob: currentTOB } as const;
}
