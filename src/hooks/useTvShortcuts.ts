"use client";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export function useTvShortcuts(
  tvMode: boolean,
  setTvMode: Dispatch<SetStateAction<boolean>>,
  setDisplayFormat?: Dispatch<SetStateAction<"percent" | "moneyline">>,
) {
  const [tvHintRender, setTvHintRender] = useState(false);
  const [tvHintVisible, setTvHintVisible] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // TV mode hint animation lifecycle
  useEffect(() => {
    if (!tvMode) {
      setTvHintVisible(false);
      setTvHintRender(false);
      return;
    }

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

  // Handle hint unmounting after fade-out
  useEffect(() => {
    if (tvMode && !tvHintVisible && tvHintRender) {
      const timer = setTimeout(() => setTvHintRender(false), 300);
      return () => clearTimeout(timer);
    }
  }, [tvMode, tvHintVisible, tvHintRender]);

  // Track fullscreen state globally
  useEffect(() => {
    const updateFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    updateFs();
    document.addEventListener("fullscreenchange", updateFs);
    return () => document.removeEventListener("fullscreenchange", updateFs);
  }, []);

  // Global keyboard shortcuts: 'f' (fullscreen), 't' (TV mode), 'm' (format)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.key || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

      const target = e.target as HTMLElement | null;
      const isEditing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (isEditing) return;

      const key = e.key.toLowerCase();
      if (key === "f") {
        e.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen?.();
        } else {
          document.documentElement.requestFullscreen?.();
        }
        setTvHintVisible(false);
      } else if (key === "t") {
        e.preventDefault();
        setTvMode((prev) => !prev);
      } else if (key === "m" && setDisplayFormat) {
        e.preventDefault();
        setDisplayFormat((prev) => (prev === "percent" ? "moneyline" : "percent"));
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTvMode, setDisplayFormat]);

  return { tvHintRender, tvHintVisible, isFullscreen };
}

export default useTvShortcuts;
