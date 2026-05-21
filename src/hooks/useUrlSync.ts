"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TIMEFRAME_SET, type TF } from "@/lib/timeframes";

export type Pov = "YES" | "NO";
export type DisplayFormat = "percent" | "moneyline";

export interface ViewState {
  url: string;
  delaySec: number;
  tf: TF;
  pov: Pov;
  tvMode: boolean;
  showMidpoint: boolean;
  displayFormat: DisplayFormat;
  split: number;
  optionId: string | null;
}

export const VIEW_DEFAULTS: ViewState = {
  url: "",
  delaySec: 25,
  tf: 5,
  pov: "YES",
  tvMode: false,
  showMidpoint: true,
  displayFormat: "percent",
  split: 67,
  optionId: null,
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function readFromQS(qs: string, prev: ViewState): ViewState {
  const params = new URLSearchParams(qs);
  const next: ViewState = { ...prev };

  next.url = params.get("url") ?? "";

  const d = params.get("delay");
  if (d != null) {
    const n = Number.parseInt(d, 10);
    if (Number.isFinite(n)) next.delaySec = clamp(n, 0, 600);
  } else {
    next.delaySec = VIEW_DEFAULTS.delaySec;
  }

  const tf = params.get("tf");
  if (tf != null) {
    const n = Number.parseInt(tf, 10);
    if (Number.isFinite(n) && TIMEFRAME_SET.has(n)) next.tf = n as TF;
  } else {
    next.tf = VIEW_DEFAULTS.tf;
  }

  const pov = (params.get("pov") ?? "").toUpperCase();
  next.pov = pov === "NO" ? "NO" : "YES";

  const mode = (params.get("mode") ?? "").toLowerCase();
  next.tvMode = mode === "tv" || mode === "1" || mode === "true";

  const mid = params.get("mid");
  next.showMidpoint = mid === null ? true : !(mid === "0" || mid === "false");

  const disp = (params.get("display") ?? "").toLowerCase();
  next.displayFormat = disp === "moneyline" ? "moneyline" : "percent";

  const s = params.get("split");
  if (s != null) {
    const n = Number.parseFloat(s);
    if (Number.isFinite(n)) next.split = clamp(n, 20, 80);
  } else {
    next.split = VIEW_DEFAULTS.split;
  }

  const opt = params.get("option");
  next.optionId = opt && opt.length > 0 ? opt : null;

  return next;
}

function writeToQS(state: ViewState, currentQS: string): string {
  const params = new URLSearchParams(currentQS);

  if (state.url) params.set("url", state.url);
  else params.delete("url");

  if (state.delaySec !== VIEW_DEFAULTS.delaySec) params.set("delay", String(state.delaySec));
  else params.delete("delay");

  if (state.tf !== VIEW_DEFAULTS.tf) params.set("tf", String(state.tf));
  else params.delete("tf");

  if (state.pov !== VIEW_DEFAULTS.pov) params.set("pov", state.pov.toLowerCase());
  else params.delete("pov");

  if (state.tvMode) params.set("mode", "tv");
  else params.delete("mode");

  if (state.showMidpoint) params.delete("mid");
  else params.set("mid", "0");

  if (state.displayFormat !== VIEW_DEFAULTS.displayFormat) params.set("display", state.displayFormat);
  else params.delete("display");

  if (Math.round(state.split) !== VIEW_DEFAULTS.split) params.set("split", String(Math.round(state.split)));
  else params.delete("split");

  // `null` means "the default option"; the caller normalizes before setting.
  if (state.optionId) params.set("option", state.optionId);
  else params.delete("option");

  return params.toString();
}

function shallowEqual<T extends object>(a: T, b: T): boolean {
  const ak = Object.keys(a) as (keyof T)[];
  const bk = Object.keys(b) as (keyof T)[];
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}

/**
 * Owns the URL ↔ state contract for the home page's view state.
 *
 * - Initial state is read from the URL synchronously, so SSR and the first
 *   client render produce identical output (no hydration flicker).
 * - Setting state schedules a debounced URL replace (no scroll, no history push).
 * - External URL changes (browser back/forward) re-merge into state.
 *
 * `state.optionId === null` means "use the event's default (first/top) option",
 * which keeps the URL minimal. Callers should normalize before setting.
 */
export function useUrlSync() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQS = searchParams?.toString() ?? "";

  const [state, _setState] = useState<ViewState>(() => readFromQS(currentQS, VIEW_DEFAULTS));
  const dirtyRef = useRef(false);
  const lastWroteQSRef = useRef<string | null>(null);

  // External URL changes (browser back/forward, or our own replace landing here).
  useEffect(() => {
    if (currentQS === lastWroteQSRef.current) return;
    _setState((prev) => {
      const next = readFromQS(currentQS, prev);
      return shallowEqual(prev, next) ? prev : next;
    });
  }, [currentQS]);

  const setState = useCallback((partial: Partial<ViewState> | ((prev: ViewState) => Partial<ViewState>)) => {
    _setState((prev) => {
      const update = typeof partial === "function" ? partial(prev) : partial;
      const next = { ...prev, ...update };
      if (shallowEqual(prev, next)) return prev;
      dirtyRef.current = true;
      return next;
    });
  }, []);

  // Debounced write to URL on state change.
  useEffect(() => {
    if (!dirtyRef.current) return;
    const nextQS = writeToQS(state, currentQS);
    if (nextQS === currentQS) {
      dirtyRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      dirtyRef.current = false;
      lastWroteQSRef.current = nextQS;
      router.replace(`${pathname}?${nextQS}`, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [state, currentQS, pathname, router]);

  return { state, setState } as const;
}
