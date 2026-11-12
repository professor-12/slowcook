"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { nav } from "@/content/site";
import { WalletButton } from "./WalletButton";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const current = (href: string) => (href.startsWith("/#") ? false : pathname === href || pathname === href.replace(/\/$/, ""));

  return (
    <header className="site-header">
      <div className="container container-wide bar">
        <Link href="/" className="brand" aria-label="SlowCook home">
          Slow<span>Cook</span>
        </Link>
        <nav aria-label="Main">
          <ul className="nav-links">
            {nav.map((l) => (
              <li key={l.href}>
                <Link href={l.href} aria-current={current(l.href) ? "page" : undefined}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <span className="header-spacer" />
        <span className="badge badge-warn network-pill">Testnet</span>
        <div className="header-wallet">
          <WalletButton />
        </div>
        <button
          ref={buttonRef}
          className="btn btn-ghost icon-btn menu-button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={24} aria-hidden /> : <Menu size={24} aria-hidden />}
        </button>
      </div>
      {open && (
        <div id="mobile-menu" className="mobile-menu">
          <div className="container">
            <nav aria-label="Mobile">
              <ul>
                {nav.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} onClick={() => setOpen(false)}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="wallet">
              <WalletButton block />
            </div>
            <p className="small muted" style={{ marginTop: "var(--space-3)" }}>
              NEAR testnet. Test NEAR only.
            </p>
          </div>
        </div>
      )}
    </header>
  );
}
