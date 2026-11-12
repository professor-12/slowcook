"use client";
// Width of an element in CSS px, so SVG charts can use a 1:1 viewBox and keep text at its real size.
// Returns a callback ref, so it also works for elements that mount later (e.g. once data arrives).
import { useCallback, useEffect, useRef, useState } from "react";

export function useMeasuredWidth<T extends HTMLElement>(fallback: number) {
  const [width, setWidth] = useState(fallback);
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    ro.current?.disconnect();
    if (!el || typeof ResizeObserver === "undefined") return;
    ro.current = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.current.observe(el);
  }, []);
  useEffect(() => () => ro.current?.disconnect(), []);
  return { ref, width };
}
