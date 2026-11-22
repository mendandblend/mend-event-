import { Link } from "react-router-dom";
import logo from "../assets/logo.jpg";
import { NAV_LINKS, SITE } from "../data/siteData.js";
import { POLICY_NAME, POLICY_PATH } from "../data/policyData.js";

export default function Footer() {
  const handleLogoClick = (e) => {
    e.preventDefault();
    if (window.location.pathname === "/" && !window.location.hash && !window.location.search) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      window.location.reload();
    } else {
      window.location.href = "/";
    }
  };

  return (
    <footer className="bg-footer-atmosphere relative overflow-hidden border-t-2 border-gold/40 bg-brand-blue px-6 py-14 text-white transition-colors duration-200 dark:border-gold/30 dark:bg-[#213347]">
      <div className="relative z-10 mx-auto grid max-w-6xl gap-10 md:grid-cols-3">
        <div>
          <Link
            to="/"
            onClick={handleLogoClick}
            className="group inline-flex items-center gap-3 transition-opacity hover:opacity-95 cursor-pointer select-none"
            aria-label="Mend and Blend - Go to start page"
          >
            <img
              src={logo}
              alt="Mend and Blend logo"
              className="h-12 w-12 rounded-xl object-cover ring-1 ring-white/25 transition-transform group-hover:scale-105 cursor-pointer"
            />
            <span className="font-serif text-2xl font-medium tracking-wide text-white whitespace-nowrap cursor-pointer group-hover:text-gold transition-colors">
              Mend and Blend
            </span>
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-brand-ivory/85">
            Psychology-inspired workshops for self-discovery, emotional wellness and human connection.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-gold">
            Explore
          </p>
          <ul className="space-y-2.5 text-sm">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="inline-block text-brand-ivory/90 underline-offset-4 decoration-terracotta/80 transition-colors duration-250 hover:text-gold hover:underline"
                >
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                to={POLICY_PATH}
                className="inline-block text-brand-ivory/90 underline-offset-4 decoration-terracotta/80 transition-colors duration-250 hover:text-gold hover:underline"
              >
                {POLICY_NAME}
              </Link>
            </li>
          </ul>
        </nav>
        <div className="text-sm leading-relaxed text-brand-ivory/90">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-gold">
            Visit &amp; Connect
          </p>
          <p>
            <a href={`tel:${SITE.phoneTel}`} className="underline-offset-4 decoration-terracotta/80 transition-colors duration-250 hover:text-gold hover:underline">
              {SITE.phoneDisplay}
            </a>
          </p>
          <p className="mt-1 break-all">
            <a href={`mailto:${SITE.email}`} className="underline-offset-4 decoration-terracotta/80 transition-colors duration-250 hover:text-gold hover:underline">
              {SITE.email}
            </a>
          </p>
          <p className="mt-2 text-brand-ivory/80">Nungambakkam, Chennai</p>
        </div>
      </div>
      <div className="relative z-10 mx-auto mt-10 flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-6 text-xs text-brand-ivory/75">
        <p>© {new Date().getFullYear()} Mend and Blend. All rights reserved.</p>
        <p className="inline-flex items-center gap-2 text-brand-ivory/80">
          <span className="h-1.5 w-1.5 rounded-full bg-terracotta" aria-hidden="true" />
          Crafted with care in Chennai
        </p>
      </div>
    </footer>
  );
}
