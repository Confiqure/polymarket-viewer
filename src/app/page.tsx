"use client";
import { Suspense } from "react";
import HomeContent from "@/features/home/HomeContent";

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
