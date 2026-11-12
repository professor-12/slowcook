import Link from "next/link";
import { footer } from "@/content/site";

const isExternal = (href: string) => href.startsWith("http");

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container container-wide footer-grid">
        <div className="stack-2">
          <p className="brand" style={{ minHeight: 0 }}>
            Slow<span>Cook</span>
          </p>
          <p className="muted">{footer.line}</p>
          <p className="muted">{footer.legal}</p>
        </div>
        {footer.groups.map((g) => (
          <nav key={g.title} aria-label={g.title}>
            <p style={{ fontWeight: 600, marginBottom: "var(--space-2)" }}>{g.title}</p>
            <ul>
              {g.links.map((l) => (
                <li key={l.label}>
                  {isExternal(l.href) ? (
                    <a href={l.href} rel="noopener noreferrer">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href}>{l.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
