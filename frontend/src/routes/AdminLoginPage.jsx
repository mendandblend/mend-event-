import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { bookingApi } from "../booking/api.js";
import {
  firebaseConfigured,
  missingFirebaseEnvVars,
  REQUIRED_FIREBASE_ENV_VARS,
} from "../firebase.js";
import ThemeToggle from "../components/ui/ThemeToggle.jsx";

export default function AdminLoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!user || loading) return undefined;
    let active = true;
    setChecking(true);
    setError("");

    async function checkAdminAccess() {
      try {
        await user.getIdToken(true);
        await bookingApi("/admin/session", user);
        if (active) navigate("/admin", { replace: true });
      } catch (accessError) {
        if (active && accessError.message.includes("Administrator access is required")) {
          setError("This Google account has not been granted administrator access.");
        } else if (active) {
          setError(accessError.message || "Could not verify administrator access.");
        }
      } finally {
        if (active) setChecking(false);
      }
    }

    checkAdminAccess();
    return () => {
      active = false;
    };
  }, [user, loading, navigate]);

  if (loading) {
    return <p className="p-8 text-center" role="status">Checking your sign-in…</p>;
  }

  if (user && checking) {
    return <p className="p-8 text-center" role="status">Verifying administrator access…</p>;
  }

  async function handleSignIn() {
    if (!firebaseConfigured || submittingRef.current) return;
    submittingRef.current = true;
    setError("");
    setSubmitting(true);
    try {
      const signedInUser = await signInWithGoogle();
      await signedInUser.getIdToken(true);
      await bookingApi("/admin/session", signedInUser);
      navigate("/admin", { replace: true });
    } catch (signInError) {
      setError(
        signInError.message.includes("Administrator access is required")
          ? "Google sign-in succeeded, but this account is not an administrator. Ask an existing project owner to grant the admin claim."
          : signInError.message || "Could not sign in to the admin dashboard.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-ivory via-sage/15 to-brand-ivory dark:from-[#181E22] dark:via-[#1C2322] dark:to-[#181E22]">
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="text-sm font-medium text-brand-blue underline-offset-4 hover:text-terracotta-dark hover:underline dark:text-[#96B7DA] dark:hover:text-gold">
            ← Back to Mend and Blend
          </Link>
          <ThemeToggle variant="surface" />
        </div>
        <section className="mt-8 rounded-3xl border border-brand-blue/20 border-t-4 border-t-brand-blue bg-white p-8 shadow-md dark:border-white/10 dark:border-t-[#8FB2D6] dark:bg-[#21292E] sm:p-10">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-sage-dark dark:text-sage">
            <span className="h-px w-5 bg-gold-dark dark:bg-gold" aria-hidden="true" />
            Administrator access
          </p>
          <h1 className="mt-3 text-4xl font-medium text-brand-blue dark:text-[#96B7DA]">Sign in to the dashboard</h1>
          <p className="mt-4 leading-relaxed text-charcoal/80 dark:text-brand-ivory/80">
            Continue with the Google account that has been granted administrator access. The server
            verifies the account’s trusted Firebase claim before opening the dashboard.
          </p>

          {!firebaseConfigured && (
            <div
              className="mt-6 rounded-2xl border border-amber-500/50 bg-amber-500/10 p-5 text-sm text-amber-950 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200"
              role="alert"
            >
              <div className="flex items-start gap-3">
                <svg
                  className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="space-y-3">
                  <div>
                    <h2 className="font-semibold text-amber-900 dark:text-amber-100">
                      Firebase client configuration is missing
                    </h2>
                    <p className="mt-1 leading-relaxed">
                      Google sign-in is disabled until the frontend build-time environment variables are configured.
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-amber-900 dark:text-amber-100">
                      Required build-time variables ({missingFirebaseEnvVars.length} missing):
                    </p>
                    <ul className="mt-1.5 list-inside list-disc space-y-1 font-mono text-xs">
                      {REQUIRED_FIREBASE_ENV_VARS.map((key) => {
                        const isMissing = missingFirebaseEnvVars.includes(key);
                        return (
                          <li
                            key={key}
                            className={
                              isMissing
                                ? "font-bold text-amber-950 dark:text-amber-200"
                                : "opacity-60 line-through"
                            }
                          >
                            {key} {isMissing ? "(missing)" : "(configured)"}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-amber-600/20 bg-white/60 p-3 text-xs leading-relaxed text-amber-900 dark:border-white/10 dark:bg-black/20 dark:text-amber-200">
                    <p className="font-semibold">Important:</p>
                    <p className="mt-0.5">
                      Do not put the Firebase service-account JSON in the frontend. Configure these public client variables in your frontend host settings (e.g., Hostinger’s build environment) or <code>frontend/.env</code>, then rebuild the application.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-6 rounded-2xl border border-terracotta/50 bg-terracotta/10 p-4 text-sm text-terracotta-dark dark:border-terracotta/45 dark:bg-terracotta/15 dark:text-[#F0A592]" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={handleSignIn}
            disabled={!firebaseConfigured || submitting}
            className="btn-interactive mt-8 w-full rounded-full bg-brand-blue px-6 py-3 font-medium text-white shadow-sm hover:bg-brand-blue-dark hover:shadow-[0_10px_22px_-8px_rgba(64,95,128,0.42)] dark:bg-[#496D92] dark:hover:bg-[#3B5B7D] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-3">
                <span className="loading-spinner" aria-hidden="true" />
                Verifying account…
              </span>
            ) : !firebaseConfigured ? (
              "Firebase configuration required"
            ) : (
              "Continue with Google"
            )}
          </button>
        </section>
      </main>
    </div>
  );
}
