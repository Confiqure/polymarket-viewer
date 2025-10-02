"use client";
import { useEffect, useState } from "react";

export function useTvShortcuts(tvMode: boolean, setTvMode: (v: boolean) => void) {
  const [tvHintRender, setTvHintRender] = useState(false);
  const [tvHintVisible, setTvHintVisible] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // TV mode: keyboard shortcut to toggle fullscreen and small hint
  useEffect(() => {
    if (!tvMode) return;
    setTvHintRender(true);
    setTvHintVisible(true);
    const hideTimer = setTimeout(() => setTvHintVisible(false), 5000);
    const onPointer = () => setTvHintVisible(false);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      clearTimeout(hideTimer);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [tvMode]);

  // Unmount the hint after fade-out
  useEffect(() => {
    if (!tvMode) {
      setTvHintRender(false);
      setTvHintVisible(false);
      return;
    }
    if (!tvHintRender) return;
    if (tvHintVisible) return;
    const t = setTimeout(() => setTvHintRender(false), 300);
    return () => clearTimeout(t);
  }, [tvMode, tvHintRender, tvHintVisible]);

  // Track fullscreen state globally
  useEffect(() => {
    const updateFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    updateFs();
    document.addEventListener("fullscreenchange", updateFs);
    return () => document.removeEventListener("fullscreenchange", updateFs);
  }, []);

  // Global: toggle Fullscreen with 'f' (ignore when typing or with modifiers)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.key || e.key.toLowerCase() !== "f") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName || "").toLowerCase();
      const editing = tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
      if (editing) return;
      e.preventDefault();
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else {
        document.documentElement.requestFullscreen?.();
      }
      // If TV mode hint is visible, hide it after using the shortcut
      if (tvMode) setTvHintVisible(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tvMode]);

  // Global: toggle TV mode with 't' (ignore when typing or with modifiers)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.key || e.key.toLowerCase() !== "t") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName || "").toLowerCase();
      const editing = tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
      if (editing) return;
      e.preventDefault();
      setTvMode(!tvMode);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tvMode, setTvMode]);

  return { tvHintRender, tvHintVisible, isFullscreen };
}

export default useTvShortcuts;
