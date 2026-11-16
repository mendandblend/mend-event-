import { useEffect } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import { SITE } from "../data/siteData.js";
import { POLICY_NAME, POLICY_SECTIONS } from "../data/policyData.js";

const linkClass =
  "font-medium text-terracotta-dark underline underline-offset-4 decoration-terracotta/60 hover:text-brand-blue dark:text-[#F09E88] dark:hover:text-[#96B7DA]";

export default function PolicyPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = `${POLICY_NAME} | Mend and Blend`;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-b from-brand-ivory via-sage/12 to-brand-ivory dark:from-[#181E22] dark:via-[#1B2429] dark:to-[#181E22]">
        <main id="main" className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
          <header className="mt-8">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-sage-dark dark:text-sage">
              <span className="h-px w-5 bg-terracotta" aria-hidden="true" />
              Mend and Blend
            </p>
            <h1 className="mt-3 text-4xl leading-tight font-medium text-brand-blue dark:text-[#96B7DA] sm:text-5xl">
              {POLICY_NAME}
            </h1>
            <p className="mt-4 text-charcoal/75 dark:text-[#C5CCD1]">
              Please read this policy before registering. It applies to every workshop, session and event booked through Mend &amp; Blend.
            </p>
          </header>

          <nav aria-label="Policy sections" className="mt-8 rounded-2xl border border-sage/40 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-[#21292E]">
            <p className="text-xs font-semibold uppercase tracking-wider text-sage-dark dark:text-sage">On this page</p>
            <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {POLICY_SECTIONS.map((section, index) => (
                <li key={section.title}>
                  <a href={`#policy-${index + 1}`} className="text-charcoal/85 underline-offset-4 hover:text-terracotta-dark hover:underline dark:text-[#D9DFE3] dark:hover:text-[#F09E88]">
                    {index + 1}. {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-8 grid gap-5">
            {POLICY_SECTIONS.map((section, index) => (
              <section
                key={section.title}
                id={`policy-${index + 1}`}
                aria-labelledby={`policy-${index + 1}-title`}
                className="scroll-mt-24 rounded-3xl border border-charcoal/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#21292E] dark:shadow-black/30 sm:p-8"
              >
                <h2 id={`policy-${index + 1}-title`} className="flex items-baseline gap-3 text-2xl font-medium text-brand-blue dark:text-[#96B7DA]">
                  <span className="font-serif text-terracotta-dark dark:text-terracotta" aria-hidden="true">{index + 1}.</span>
                  <span>{section.title}</span>
                </h2>
                <ul className="mt-4 space-y-3 leading-relaxed text-charcoal/85 dark:text-[#D9DFE3]">
                  {section.points.map((point) => (
                    <li key={point} className="flex gap-3">
                      <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta" aria-hidden="true" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <section
              id="policy-contact"
              aria-labelledby="policy-contact-title"
              className="rounded-3xl border border-brand-blue bg-brand-blue p-6 text-white shadow-lg dark:border-gold/25 dark:bg-[#2A4058] sm:p-8"
            >
              <h2 id="policy-contact-title" className="text-2xl font-medium text-white">Contact Information</h2>
              <p className="mt-3 leading-relaxed text-brand-ivory/90">
                For questions or assistance regarding bookings, cancellations, or rescheduling, please contact:
              </p>
              <dl className="mt-4 space-y-3">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[#F2D9A6]">Email</dt>
                  <dd className="mt-1">
                    <a className="break-all text-lg text-white underline underline-offset-4 decoration-terracotta/80 hover:text-gold" href={`mailto:${SITE.email}`}>
                      {SITE.email}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[#F2D9A6]">Phone</dt>
                  <dd className="mt-1">
                    <a className="text-lg text-white underline underline-offset-4 decoration-terracotta/80 hover:text-gold" href={`tel:${SITE.phoneTel}`}>
                      {SITE.phoneDisplay}
                    </a>
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <p className="mt-8 text-sm text-charcoal/70 dark:text-[#9DA7AE]">
            <Link to="/" className={linkClass}>Back to the homepage</Link>
          </p>
        </main>
      </div>
    </>
  );
}
