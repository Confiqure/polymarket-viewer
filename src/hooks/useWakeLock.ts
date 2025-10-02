"use client";
import { useEffect, useRef } from "react";

// Minimal types for the Wake Lock API to avoid strict any
type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
};
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<unknown> };
};

export function useWakeLock(enabled: boolean) {
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const interactionRetryRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function requestWakeLock() {
      try {
        const nav = navigator as NavigatorWithWakeLock;
        if (!nav.wakeLock) return; // unsupported
        const sentinel = (await nav.wakeLock.request("screen")) as unknown as WakeLockSentinelLike;
        if (cancelled) {
          try {
            await sentinel.release();
          } catch {}
          return;
        }
        wakeLockRef.current = sentinel;
        sentinel.addEventListener?.("release", () => {
          // auto re-acquire if desired; we'll re-acquire on visibility change below
        });
      } catch (e) {
        console.warn("[WakeLock] request failed", e);
        // Safari often requires a user gesture. Set up a one-time retry on next interaction.
        if (!interactionRetryRef.current) {
          const retry = async () => {
            interactionRetryRef.current = null;
            document.removeEventListener("click", retry);
            document.removeEventListener("touchend", retry);
            await requestWakeLock();
          };
          interactionRetryRef.current = retry;
          document.addEventListener("click", retry, { once: true });
          document.addEventListener("touchend", retry, { once: true });
        }
      }
    }

    function handleVisibility() {
      if (document.visibilityState === "visible" && enabled) {
        requestWakeLock();
      }
    }

    if (enabled) {
      requestWakeLock();
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (interactionRetryRef.current) {
        const fn = interactionRetryRef.current;
        interactionRetryRef.current = null;
        document.removeEventListener("click", fn);
        document.removeEventListener("touchend", fn);
      }
      const s = wakeLockRef.current;
      wakeLockRef.current = null;
      if (s) s.release().catch(() => {});
    };
  }, [enabled]);
}

export default useWakeLock;
