import Link from "next/link";
import { ArrowRight, ExternalLink, FileCheck2, ShieldAlert, ScrollText } from "lucide-react";
import { home } from "@/content/site";
import { Reveal } from "@/components/Reveal";
import { LaunchList } from "@/components/LaunchList";
import { HeroCard } from "@/components/HeroCard";

const TRUST_ICONS = [ScrollText, FileCheck2, ShieldAlert];

export default function Home() {
  const { hero, proof, steps, values, launches, trust, faq, final } = home;
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <section className="section" aria-labelledby="hero-title">
        <div className="container container-wide hero-grid">
          <div className="stack-4">
            <p className="eyebrow">{hero.eyebrow}</p>
            <h1 id="hero-title">{hero.title}</h1>
            <p className="lead">{hero.subtitle}</p>
            <div className="row" style={{ marginTop: "var(--space-2)" }}>
              <Link className="btn btn-primary btn-lg" href={hero.primary.href}>
                {hero.primary.label} <ArrowRight size={20} aria-hidden />
              </Link>
              <Link className="btn btn-secondary btn-lg" href={hero.secondary.href}>
                {hero.secondary.label}
              </Link>
            </div>
            <p className="small muted">{hero.proof}</p>
          </div>
          {/* The headline (LCP element) renders static; only the product card animates in. */}
          <div className="hero-enter">
            <HeroCard />
          </div>
        </div>
      </section>

      <section className="section section-alt" aria-labelledby="proof-title">
        <Reveal className="container container-wide">
          <div className="section-head">
            <p className="eyebrow">{proof.eyebrow}</p>
            <h2 id="proof-title">{proof.title}</h2>
          </div>
          <dl className="proof-grid">
            {proof.items.map((p) => (
              <div key={p.value} className="proof-item">
                <dt className="proof-value">{p.value}</dt>
                <dd className="muted">{p.label}</dd>
              </div>
            ))}
          </dl>
          <p style={{ marginTop: "var(--space-8)" }}>
            <a href={proof.source.href} rel="noopener noreferrer">
              {proof.source.label} <ExternalLink size={16} aria-hidden style={{ verticalAlign: "-2px" }} />
            </a>
          </p>
        </Reveal>
      </section>

      <section className="section" id="how-it-works" aria-labelledby="steps-title">
        <Reveal className="container container-wide">
          <div className="section-head">
            <p className="eyebrow">{steps.eyebrow}</p>
            <h2 id="steps-title">{steps.title}</h2>
          </div>
          <ol className="steps">
            {steps.items.map((s, i) => (
              <li key={s.title}>
                <span className="step-num num" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3>{s.title}</h3>
                <p className="muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      <section className="section section-alt" aria-labelledby="values-title">
        <div className="container container-wide">
          <div className="section-head">
            <p className="eyebrow">{values.eyebrow}</p>
            <h2 id="values-title">{values.title}</h2>
          </div>
          <div className="value-rows">
            {values.items.map((v) => (
              <Reveal key={v.title} className="value-row">
                <h3>{v.title}</h3>
                <ul>
                  {v.claims.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="launches" aria-labelledby="launches-title">
        <div className="container container-wide">
          <div className="section-head">
            <p className="eyebrow">{launches.eyebrow}</p>
            <h2 id="launches-title">{launches.title}</h2>
            <p className="lead">{launches.intro}</p>
          </div>
          <LaunchList />
        </div>
      </section>

      <section className="section section-alt" aria-labelledby="trust-title">
        <Reveal className="container container-wide">
          <div className="section-head">
            <p className="eyebrow">{trust.eyebrow}</p>
            <h2 id="trust-title">{trust.title}</h2>
          </div>
          <div className="trust-grid">
            {trust.items.map((t, i) => {
              const Icon = TRUST_ICONS[i];
              return (
                <div key={t.title} className="trust-item stack-2">
                  <Icon size={24} aria-hidden className="trust-icon" />
                  <h3>{t.title}</h3>
                  <p className="muted">{t.body}</p>
                  <a href={t.link.href} rel="noopener noreferrer">
                    {t.link.label}
                  </a>
                </div>
              );
            })}
          </div>
        </Reveal>
      </section>

      <section className="section" aria-labelledby="faq-title">
        <div className="container faq">
          <div className="section-head">
            <p className="eyebrow">{faq.eyebrow}</p>
            <h2 id="faq-title">{faq.title}</h2>
          </div>
          <div className="faq-list">
            {faq.items.map((f, i) => (
              <details key={f.q}>
                <summary>
                  <span className="step-num num" aria-hidden>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{f.q}</span>
                </summary>
                <p className="muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section final-cta" aria-labelledby="final-title">
        <div className="container stack-4" style={{ textAlign: "center", justifyItems: "center" }}>
          <h2 id="final-title">{final.title}</h2>
          <p className="lead">{final.body}</p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link className="btn btn-primary btn-lg" href={final.primary.href}>
              {final.primary.label}
            </Link>
            <a className="btn btn-secondary btn-lg" href={final.secondary.href} rel="noopener noreferrer">
              {final.secondary.label}
            </a>
          </div>
          <p className="small muted">{final.status}</p>
        </div>
      </section>
    </>
  );
}
