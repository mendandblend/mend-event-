import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { bookingApi, formatWorkshopDate } from "../booking/api.js";
import { POLICY_NAME, POLICY_PATH } from "../data/policyData.js";
import { SITE } from "../data/siteData.js";

const fieldClass =
  "mt-1 w-full rounded-xl border border-charcoal/25 bg-white px-4 py-3 font-normal text-charcoal dark:border-white/15 dark:bg-[#181E22] dark:text-brand-ivory";

// Lets a participant ask to cancel or reschedule a confirmed booking.
// Nothing here changes the booking: the Mend & Blend team reviews each request.
export default function BookingRequestPanel({ reservation, user, onSubmitted, onClose }) {
  const [type, setType] = useState("reschedule");
  const [reason, setReason] = useState("");
  const [preferredWorkshopId, setPreferredWorkshopId] = useState("");
  const [sessions, setSessions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    bookingApi("/events")
      .then((result) => {
        if (active) setSessions(result.workshops || []);
      })
      .catch(() => {
        if (active) setSessions([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const currentId = reservation.workshopId || reservation.eventId;
  const otherSessions = sessions.filter((session) => session.id !== currentId);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await bookingApi("/bookings/requests", user, {
        method: "POST",
        body: JSON.stringify({
          bookingId: reservation.id,
          type,
          reason: reason.trim(),
          ...(type === "reschedule" && preferredWorkshopId ? { preferredWorkshopId } : {}),
        }),
      });
      onSubmitted(
        type === "reschedule"
          ? "Your rescheduling request was sent. The Mend & Blend team will review it."
          : "Your cancellation request was sent. The Mend & Blend team will review it.",
      );
    } catch (submitError) {
      setError(submitError.message || "Could not send your request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      aria-label="Cancellation or rescheduling request"
      className="mt-6 space-y-4 rounded-2xl border border-sage/45 bg-brand-ivory/70 p-5 dark:border-white/10 dark:bg-[#181E22]"
    >
      <div className="rounded-xl border border-gold/60 bg-gold/20 p-3.5 text-sm leading-relaxed text-charcoal dark:border-gold/40 dark:bg-gold/12 dark:text-brand-ivory">
        <p>
          <strong>Payments are non-refundable.</strong> Cancelling does not automatically qualify for a refund.
          Instead of a refund, you can ask to reschedule to another available session. Rescheduling is
          subject to availability and approval, and the amount already paid is adjusted towards the new
          session. See the{" "}
          <Link to={POLICY_PATH} target="_blank" rel="noopener noreferrer" className="font-medium text-terracotta-dark underline underline-offset-4 dark:text-[#F0A592]">
            {POLICY_NAME}
          </Link>.
        </p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-charcoal dark:text-brand-ivory">What would you like to request?</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {[
            ["reschedule", "Reschedule to another session"],
            ["cancellation", "Cancel my registration"],
          ].map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-2 rounded-full border border-charcoal/20 bg-white px-4 text-sm text-charcoal dark:border-white/15 dark:bg-[#21292E] dark:text-brand-ivory">
              <input
                type="radio"
                name={`request-type-${reservation.id}`}
                value={value}
                checked={type === value}
                onChange={() => setType(value)}
                className="accent-terracotta-dark"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {type === "reschedule" && (
        <label className="block text-sm font-medium text-charcoal dark:text-brand-ivory">
          Preferred session (optional)
          <select
            value={preferredWorkshopId}
            onChange={(event) => setPreferredWorkshopId(event.target.value)}
            className={fieldClass}
          >
            <option value="">No preference — the team will suggest one</option>
            {otherSessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title} · {formatWorkshopDate(session.date)}
                {session.availableSeats === 0 ? " (fully booked)" : ""}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs font-normal text-charcoal/65 dark:text-brand-ivory/60">
            Rescheduling cannot be guaranteed if the requested session is fully booked.
          </span>
        </label>
      )}

      <label className="block text-sm font-medium text-charcoal dark:text-brand-ivory">
        Reason or additional details
        <textarea
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className={fieldClass}
        />
      </label>

      {error && (
        <p className="rounded-xl border border-terracotta/50 bg-terracotta/10 p-3 text-sm text-terracotta-dark dark:border-terracotta/45 dark:bg-terracotta/15 dark:text-[#F0A592]" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="btn-interactive rounded-full bg-terracotta-dark px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-[#9D4D38] disabled:opacity-60 dark:bg-terracotta dark:font-semibold dark:text-[#181E22]"
        >
          {submitting ? "Sending…" : "Send request"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="btn-interactive rounded-full border border-charcoal/25 px-5 py-3 text-sm font-medium text-charcoal hover:bg-charcoal/5 dark:border-white/20 dark:text-[#E8ECEF] dark:hover:bg-white/10"
        >
          Close
        </button>
      </div>

      <p className="text-xs text-charcoal/70 dark:text-brand-ivory/65">
        Need help with this booking? Email{" "}
        <a className="underline underline-offset-4" href={`mailto:${SITE.email}`}>{SITE.email}</a> or call{" "}
        <a className="underline underline-offset-4" href={`tel:${SITE.phoneTel}`}>{SITE.phoneDisplay}</a>.
      </p>
    </form>
  );
}
