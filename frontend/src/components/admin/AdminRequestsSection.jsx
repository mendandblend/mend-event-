import { useCallback, useEffect, useMemo, useState } from "react";
import { bookingApi, formatWorkshopDate } from "../../booking/api.js";
import { formatINR } from "../../data/siteData.js";

const typeLabels = { cancellation: "Cancellation", reschedule: "Rescheduling" };
const statusLabels = { pending: "Pending", approved: "Approved", rejected: "Rejected" };
const statusStyles = {
  pending: "border-gold/70 bg-gold/25 text-[#6B4D16] dark:border-gold/45 dark:bg-gold/15 dark:text-gold",
  approved: "border-sage/60 bg-sage/30 text-sage-dark dark:border-sage/45 dark:bg-sage/18 dark:text-sage",
  rejected: "border-terracotta/45 bg-terracotta/15 text-terracotta-dark dark:border-terracotta/45 dark:bg-terracotta/15 dark:text-[#F09E88]",
};
const fieldClass =
  "mt-1 w-full rounded-xl border border-charcoal/20 bg-white px-3 py-2.5 font-normal text-charcoal dark:border-white/15 dark:bg-[#192024] dark:text-[#E8ECEF]";

function displayDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date);
}

function Detail({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wider text-sage-dark dark:text-sage">{label}</dt>
      <dd className="mt-1 break-words text-sm text-charcoal dark:text-[#E8ECEF]">{children}</dd>
    </div>
  );
}

export default function AdminRequestsSection({ user, onChanged }) {
  const [requests, setRequests] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [notes, setNotes] = useState({});
  const [targets, setTargets] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [requestResult, sessionResult] = await Promise.all([
        bookingApi("/admin/booking-requests", user),
        bookingApi("/events").catch(() => ({ workshops: [] })),
      ]);
      setRequests(requestResult.requests || []);
      setSessions(sessionResult.workshops || []);
    } catch (loadError) {
      setError(loadError.message || "Could not load requests.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () => requests.filter((request) => filter === "all" || request.status === filter),
    [requests, filter],
  );
  const pendingCount = requests.filter((request) => request.status === "pending").length;

  async function decide(request, decision) {
    const target = targets[request.id] ?? request.preferredWorkshopId ?? "";
    if (decision === "approve" && request.type === "reschedule" && !target) {
      setError("Choose the session to move this booking to before approving.");
      return;
    }
    const confirmation = decision === "reject"
      ? "Decline this request? The booking will stay as it is."
      : request.type === "cancellation"
        ? "Approve this cancellation? The seat will be released and the ticket cancelled. No refund will be issued, as per the policy."
        : "Approve this rescheduling? The booking and ticket will move to the selected session and the amount already paid is carried over.";
    if (!window.confirm(confirmation)) return;
    setBusy(request.id);
    setError("");
    setMessage("");
    try {
      await bookingApi(`/admin/booking-requests/${encodeURIComponent(request.id)}`, user, {
        method: "PATCH",
        body: JSON.stringify({
          decision,
          note: (notes[request.id] || "").trim(),
          ...(decision === "approve" && request.type === "reschedule" ? { targetWorkshopId: target } : {}),
        }),
      });
      setMessage(decision === "approve" ? "Request approved." : "Request declined.");
      await load();
      onChanged?.();
    } catch (decisionError) {
      setError(decisionError.message || "Could not update the request.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section id="booking-requests" className="mt-12 scroll-mt-24">
      <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sage-dark dark:text-sage">
        <span className="h-px w-4 bg-terracotta" aria-hidden="true" />
        Participant requests
      </p>
      <h2 className="mt-2 text-3xl font-medium text-brand-blue dark:text-[#96B7DA]">Cancellation &amp; rescheduling</h2>
      <p className="mt-2 max-w-3xl text-sm text-charcoal/75 dark:text-[#C5CCD1]">
        Payments are non-refundable. Approving a cancellation releases the seat and never starts a refund.
        Approving a rescheduling moves the booking and carries the amount already paid to the new session.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label="Filter requests">
        {[["pending", `Pending (${pendingCount})`], ["all", "All"], ["approved", "Approved"], ["rejected", "Rejected"]].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium ${filter === value
              ? "border-brand-blue bg-brand-blue text-white dark:border-[#96B7DA] dark:bg-[#3B5B7D]"
              : "border-charcoal/25 text-charcoal hover:bg-charcoal/5 dark:border-white/20 dark:text-[#E8ECEF] dark:hover:bg-white/10"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="mt-5 rounded-2xl border border-terracotta/50 bg-terracotta/10 p-4 text-sm text-terracotta-dark dark:border-terracotta/45 dark:bg-terracotta/15 dark:text-[#F09E88]" role="alert">{error}</p>}
      {message && <p className="mt-5 rounded-2xl border border-sage/60 bg-sage/20 p-4 text-sm text-charcoal dark:border-sage/45 dark:bg-sage/15 dark:text-[#E8ECEF]" role="status">{message}</p>}
      {loading && <p className="mt-5 text-charcoal/75 dark:text-[#C5CCD1]" role="status">Loading requests…</p>}
      {!loading && visible.length === 0 && (
        <p className="mt-5 rounded-2xl border border-sage/35 bg-white p-6 text-center text-sm text-charcoal/65 dark:border-white/10 dark:bg-[#21292E] dark:text-[#9DA7AE]">
          No {filter === "all" ? "" : `${statusLabels[filter].toLowerCase()} `}requests.
        </p>
      )}

      <ul className="mt-5 grid gap-4">
        {visible.map((request) => {
          const selectableSessions = sessions.filter((session) => session.id !== request.workshopId);
          const adjustment = request.priceAdjustment;
          return (
            <li key={request.id} className="min-w-0 rounded-3xl border border-sage/45 bg-white p-5 shadow-xs dark:border-white/10 dark:bg-[#21292E] sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-xl font-medium text-brand-blue dark:text-[#96B7DA]">
                    {typeLabels[request.type] || request.type} request
                  </h3>
                  <p className="mt-1 text-sm text-charcoal/70 dark:text-[#9DA7AE]">Submitted {displayDateTime(request.createdAt)}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[request.status] || ""}`}>
                  {statusLabels[request.status] || request.status}
                </span>
              </div>

              <dl className="mt-4 grid gap-4 border-t border-charcoal/10 pt-4 dark:border-white/10 sm:grid-cols-2 lg:grid-cols-3">
                <Detail label="Participant">
                  {request.participant?.fullName || "—"}
                  <span className="block break-all text-xs text-charcoal/65 dark:text-[#9DA7AE]">{request.participant?.email}</span>
                  <span className="block text-xs text-charcoal/65 dark:text-[#9DA7AE]">{request.participant?.phone}</span>
                </Detail>
                <Detail label="Current session">
                  {request.workshopName || "—"}
                  <span className="block text-xs text-charcoal/65 dark:text-[#9DA7AE]">
                    {request.sessionDate ? formatWorkshopDate(request.sessionDate) : ""} {request.start}{request.end ? `–${request.end}` : ""}
                  </span>
                </Detail>
                <Detail label="Amount paid">{request.amountPaid != null ? formatINR(request.amountPaid) : "—"}</Detail>
                {request.type === "reschedule" && (
                  <Detail label="Preferred session">{request.preferredWorkshopName || "No preference"}</Detail>
                )}
                <Detail label="Booking ID"><span className="break-all text-xs">{request.bookingId}</span></Detail>
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-sage-dark dark:text-sage">Reason</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-charcoal dark:text-[#E8ECEF]">{request.reason || "No reason given."}</dd>
                </div>
              </dl>

              {request.status === "pending" ? (
                <div className="mt-5 grid gap-3 border-t border-charcoal/10 pt-4 dark:border-white/10">
                  {request.type === "reschedule" && (
                    <label className="block text-sm font-medium text-charcoal dark:text-[#D9DFE3]">
                      Move booking to
                      <select
                        value={targets[request.id] ?? request.preferredWorkshopId ?? ""}
                        onChange={(event) => setTargets((current) => ({ ...current, [request.id]: event.target.value }))}
                        className={fieldClass}
                      >
                        <option value="">Select a published session…</option>
                        {selectableSessions.map((session) => (
                          <option key={session.id} value={session.id} disabled={session.availableSeats === 0}>
                            {session.title} · {formatWorkshopDate(session.date)} · {formatINR(session.price)} · {session.availableSeats} seat{session.availableSeats === 1 ? "" : "s"} left
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="block text-sm font-medium text-charcoal dark:text-[#D9DFE3]">
                    Note to participant (optional)
                    <textarea
                      rows={2}
                      maxLength={1000}
                      value={notes[request.id] || ""}
                      onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                      className={fieldClass}
                    />
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={busy !== ""}
                      onClick={() => decide(request, "approve")}
                      className="btn-interactive rounded-full bg-terracotta-dark px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-[#9D4D38] disabled:opacity-50 dark:bg-terracotta dark:font-semibold dark:text-[#181E22]"
                    >
                      {busy === request.id ? "Saving…" : request.type === "cancellation" ? "Approve cancellation (no refund)" : "Approve rescheduling"}
                    </button>
                    <button
                      type="button"
                      disabled={busy !== ""}
                      onClick={() => decide(request, "reject")}
                      className="btn-interactive rounded-full border border-terracotta/50 px-5 py-3 text-sm font-medium text-terracotta-dark hover:bg-terracotta/10 disabled:opacity-50 dark:border-terracotta/45 dark:text-[#F09E88] dark:hover:bg-terracotta/15"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-5 border-t border-charcoal/10 pt-4 text-sm text-charcoal dark:border-white/10 dark:text-[#E8ECEF]">
                  <p>
                    <span className="font-semibold">{statusLabels[request.status]}</span> on {displayDateTime(request.decision?.at)}
                    {request.decision?.note ? ` — “${request.decision.note}”` : ""}
                  </p>
                  {request.outcome === "rescheduled" && (
                    <p className="mt-1">
                      Moved to {request.targetWorkshopName}{request.targetSessionDate ? ` (${formatWorkshopDate(request.targetSessionDate)})` : ""}.
                      {adjustment && adjustment.balanceDue > 0 && ` Balance due from participant: ${formatINR(adjustment.balanceDue)} (collect separately).`}
                      {adjustment && adjustment.unusedAmount > 0 && ` New session costs ${formatINR(adjustment.unusedAmount)} less; the difference is not refunded.`}
                    </p>
                  )}
                  {request.outcome === "cancelled_no_refund" && (
                    <p className="mt-1">Seat released and ticket cancelled. No refund was issued.</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
