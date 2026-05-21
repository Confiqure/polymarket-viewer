"use client";
import { useEffect, useState } from "react";

function useFinePointer(): boolean {
  const [fine, setFine] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(pointer: fine)");
    const update = () => setFine(mql.matches);
    update();
    mql.addEventListener?.("change", update);
    return () => mql.removeEventListener?.("change", update);
  }, []);
  return fine;
}

export function TVHint({ render, visible }: { render: boolean; visible: boolean }) {
  const fine = useFinePointer();
  if (!render || !fine) return null;
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 top-2 z-50 flex justify-center transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <span className="inline-flex items-center gap-2 rounded-full bg-neutral-900/95 px-3 py-1 text-xs text-neutral-200 shadow-lg ring-1 ring-neutral-700">
        Press F (Fullscreen) • T (TV Mode) • M (Odds)
      </span>
    </div>
  );
}

export default TVHint;
