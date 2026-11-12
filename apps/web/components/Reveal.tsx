"use client";
// Section reveal (motion level 2): rises 16px and fades in once at ~20% visibility.
// Under prefers-reduced-motion the CSS shows content immediately.
import { useEffect, useRef, useState, type ReactNode } from "react";

export function Reveal({ children, as: Tag = "div", className = "" }: { children: ReactNode; as?: "div" | "section"; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setVisible(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref as never} className={`reveal ${visible ? "is-visible" : ""} ${className}`}>
      {children}
    </Tag>
  );
}
