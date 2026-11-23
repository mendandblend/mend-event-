import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { bookingApi, formatWorkshopDate } from "../booking/api.js";
import { validateCheckoutOrder } from "../booking/checkoutOrder.js";
import { loadRazorpayCheckout } from "../booking/razorpay.js";
import { formatINR } from "../data/siteData.js";
import { POLICY_NAME, POLICY_PATH, POLICY_VERSION } from "../data/policyData.js";
import Button from "./ui/Button.jsx";

export default function RegisterDialog({ workshop, user, onClose, onReserved }) {
  const ref = useRef(null);
  const checkoutDialogCloseRef = useRef(false);
  const [participant, setParticipant] = useState({ fullName: "", email: "", phone: "" });
  const [seats, setSeats] = useState(1);
  const [reservation, setReservation] = useState(null);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [policyError, setPolicyError] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const paymentConfirmed = /your booking is confirmed|booking is already confirmed/i.test(
    paymentMessage,
  );

  const initialSeatsRef = useRef(workshop?.availableSeats ?? 0);
  useEffect(() => {
    if (workshop?.id) {
      initialSeatsRef.current = workshop.availableSeats ?? 0;
    }
  }, [workshop?.id]);

  const hasHeldOrConfirmedSeat = Boolean(reservation || paymentConfirmed);
  const bookedSeatsCount = Number(reservation?.seats) || seats;
  const baseSeats = typeof workshop?.availableSeats === "number" ? workshop.availableSeats : 0;
  const displayedSeats = Math.max(
    0,
    hasHeldOrConfirmedSeat
      ? (baseSeats < initialSeatsRef.current
          ? baseSeats
          : baseSeats - bookedSeatsCount)
      : baseSeats,
  );
  const maxSelectableSeats = Math.max(1, Math.min(10, baseSeats));

  function closeDialogForCheckout() {
    checkoutDialogCloseRef.current = true;
    if (ref.current?.open) ref.current.close();
  }

  function restoreDialogAfterCheckout() {
    window.requestAnimationFrame(() => {
      if (workshop && ref.current && !ref.current.open) ref.current.showModal();
    });
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (workshop && !dialog.open) dialog.showModal();
    if (!workshop && dialog.open) dialog.close();
  }, [workshop]);

  useEffect(() => {
    setParticipant({
      fullName: user?.displayName || "",
      email: user?.email || "",
      phone: "",
    });
    setSeats(1);
    setReservation(null);
    setPolicyAccepted(false);
    setPolicyError("");
    setError("");
    setPaymentMessage("");
  }, [user?.uid, workshop?.id]);

  useEffect(() => {
    if (!reservation) return undefined;
    const updateRemaining = () => {
      const seconds = Math.max(
        0,
        Math.ceil((new Date(reservation.expiresAt).getTime() - Date.now()) / 1000),
      );
      setRemainingSeconds(seconds);
    };
    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(intervalId);
  }, [reservation]);

  async function submitReservation(event) {
    event.preventDefault();
    if (!workshop || !user) return;
    if (!policyAccepted) {
      setPolicyError(`Please accept the ${POLICY_NAME} to continue to payment.`);
      return;
    }
    setSubmitting(true);
    setError("");
    setPolicyError("");
    try {
      // The server validates this again and records the acceptance itself.
      const result = await bookingApi("/bookings/reservations", user, {
        method: "POST",
        body: JSON.stringify({
          eventId: workshop.id,
          participant,
          seats,
          policyAccepted: true,
          policyVersion: POLICY_VERSION,
        }),
      });
      setReservation(result);
      onReserved();
    } catch (reservationError) {
      setError(reservationError.message || "Could not reserve a place.");
    } finally {
      setSubmitting(false);
    }
  }

  async function completeCheckout(result) {
    try {
      const verified = await bookingApi("/payments/verify", user, {
        method: "POST",
        body: JSON.stringify({ bookingId: reservation.bookingId, ...result }),
      });
      if (verified.bookingStatus === "confirmed" || verified.paymentStatus === "captured") {
        setPaymentMessage("Payment verified. Your booking is confirmed.");
        await onReserved();
        return;
      }
      if (verified.paymentStatus === "refund_required") {
        setRemainingSeconds(0);
        setPaymentMessage(
          "Payment was captured after the reservation expired, so the booking was not confirmed. Please contact Mend and Blend to arrange a refund.",
        );
      } else if (verified.paymentStatus === "failed") {
        setRemainingSeconds(0);
        setPaymentMessage("Payment failed. Your reservation has been released.");
      } else {
        setPaymentMessage(
          "Payment is still processing. We will update your booking when Razorpay confirms it.",
        );
      }
    } catch (verificationError) {
      try {
        const status = await bookingApi(
          `/payments/${encodeURIComponent(reservation.bookingId)}/status`,
          user,
        );
        if (status.bookingStatus === "confirmed" || status.paymentStatus === "captured") {
          setPaymentMessage("Payment verified. Your booking is confirmed.");
          await onReserved();
          return;
        }
        if (status.paymentStatus === "refund_required") {
          setRemainingSeconds(0);
          setPaymentMessage(
            "Payment was captured after the reservation expired, so the booking was not confirmed. Please contact Mend and Blend to arrange a refund.",
          );
          return;
        }
        setPaymentMessage(
          "We could not confirm the payment yet. Do not pay again; your booking status is " +
            `${status.paymentStatus.replaceAll("_", " ")}. Please wait and check again.`,
        );
      } catch {
        setError(
          verificationError.message ||
            "Payment verification is pending. Do not pay again; please check your booking status shortly.",
        );
      }
    }
  }

  async function startPayment() {
    if (!reservation || !user) return;
    setSubmitting(true);
    setError("");
    setPaymentMessage("");
    try {
      const orderResponse = await bookingApi("/payments/orders", user, {
        method: "POST",
        body: JSON.stringify({ bookingId: reservation.bookingId }),
      });
      if (orderResponse.alreadyPaid) {
        setPaymentMessage("This booking is already confirmed.");
        return;
      }
      const order = validateCheckoutOrder(orderResponse, reservation.bookingId);
      setReservation((current) => ({ ...current, expiresAt: order.expiresAt }));
      await loadRazorpayCheckout();
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Mend and Blend",
        description: `${reservation.workshopName} (${reservation.seats || 1} ${(reservation.seats || 1) === 1 ? "seat" : "seats"})`,
        order_id: order.orderId,
        prefill: {
          name: participant.fullName,
          email: participant.email,
          contact: participant.phone,
        },
        notes: { bookingId: reservation.bookingId },
        theme: { color: "#405F80" },
        modal: {
          ondismiss: async () => {
            try {
              const status = await bookingApi(
                `/payments/${encodeURIComponent(reservation.bookingId)}/cancel`,
                user,
                { method: "POST", body: JSON.stringify({}) },
              );
              setPaymentMessage(
                status.status === "confirmed"
                  ? "Your payment was verified and your booking is confirmed."
                  : status.status === "pending"
                    ? "Payment authorization is pending. Your seat remains held temporarily."
                    : "Checkout closed. Any unpaid temporary seat hold has been released.",
              );
              if (!["confirmed", "pending"].includes(status.status)) setRemainingSeconds(0);
              await onReserved();
            } catch (cancelError) {
              setError(
                cancelError.message ||
                  "Checkout closed, but we could not update its status. Please check again.",
              );
            } finally {
              restoreDialogAfterCheckout();
            }
          },
        },
        handler: async (result) => {
          try {
            await completeCheckout(result);
          } finally {
            restoreDialogAfterCheckout();
          }
        },
      });
      checkout.on("payment.failed", async (failure) => {
        const failureMessage = failure.error?.description?.trim();
        const retryMessage = "If your seat hold is still active, you can retry in Razorpay.";
        setPaymentMessage(
          failureMessage
            ? `${failureMessage} ${retryMessage}`
            : `That payment attempt did not go through. ${retryMessage}`,
        );
        try {
          await onReserved();
        } catch (refreshError) {
          setError(refreshError.message || "Could not refresh your reservation status.");
        }
      });
      closeDialogForCheckout();
      checkout.open();
    } catch (paymentError) {
      if (checkoutDialogCloseRef.current) restoreDialogAfterCheckout();
      setError(paymentError.message || "Could not start Razorpay Checkout.");
    } finally {
      setSubmitting(false);
    }
  }

  async function checkPaymentStatus() {
    if (!reservation || !user) return;
    setSubmitting(true);
    setError("");
    try {
      const status = await bookingApi(
        `/payments/${encodeURIComponent(reservation.bookingId)}/status`,
        user,
      );
      if (status.bookingStatus === "confirmed" || status.paymentStatus === "captured") {
        setPaymentMessage("Payment verified. Your booking is confirmed.");
        await onReserved();
      } else if (status.paymentStatus === "refund_required") {
        setRemainingSeconds(0);
        setPaymentMessage(
          "Payment was captured after the reservation expired, so the booking was not confirmed. Please contact Mend and Blend to arrange a refund.",
        );
      } else if (status.paymentStatus === "failed" || status.bookingStatus === "payment_failed") {
        setRemainingSeconds(0);
        setPaymentMessage("Payment failed. Your reservation has been released.");
      } else if (status.bookingStatus === "expired" || status.bookingStatus === "cancelled") {
        setRemainingSeconds(0);
        setPaymentMessage("The reservation expired or was cancelled. No booking was confirmed.");
      } else {
        setPaymentMessage(
          "Payment is not confirmed yet. Do not retry while the payment is processing.",
        );
      }
    } catch (statusError) {
      setError(statusError.message || "Could not check the payment status.");
    } finally {
      setSubmitting(false);
    }
  }

  function updateParticipant(event) {
    setParticipant((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="register-title"
      onClose={() => {
        if (checkoutDialogCloseRef.current) {
          checkoutDialogCloseRef.current = false;
          return;
        }
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[34rem] overflow-y-auto rounded-3xl border border-sage/45 border-t-4 border-t-terracotta bg-brand-ivory p-0 text-charcoal shadow-2xl backdrop:bg-charcoal/55 backdrop:backdrop-blur-xs dark:border-white/15 dark:border-t-terracotta dark:bg-[#21292E] dark:text-brand-ivory dark:backdrop:bg-black/70"
    >
      {workshop && (
        <div className="p-5 sm:p-10">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-sage-dark dark:text-sage">
            <span className="h-px w-5 bg-terracotta" aria-hidden="true" />
            Reserve your place
          </p>
          <h3 id="register-title" className="mt-3 break-words text-3xl font-medium text-brand-blue dark:text-[#96B7DA]">
            {workshop.title}
          </h3>
          <p className="mt-2 text-charcoal/80 dark:text-brand-ivory/80">
            {formatWorkshopDate(workshop.date)} · {workshop.start}–{workshop.end}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sage/40 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-[#181E22]">
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-charcoal/70 dark:text-brand-ivory/70">Session price</span>
              <strong className="font-serif text-2xl font-semibold text-brand-blue dark:text-[#96B7DA]">{formatINR(workshop.price)}</strong>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-charcoal/70 dark:text-brand-ivory/70">Available seats</span>
              <strong className="rounded-full border border-sage/50 bg-sage/20 px-2.5 py-0.5 text-sm font-semibold text-sage-dark dark:border-sage/35 dark:bg-sage/15 dark:text-sage">
                {displayedSeats}
              </strong>
            </div>
          </div>

          {!reservation && displayedSeats > 0 && (
            <div className="mt-4 rounded-2xl border border-sage/40 bg-white p-4 shadow-xs dark:border-white/10 dark:bg-[#181E22]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="block text-sm font-medium text-charcoal dark:text-brand-ivory">
                    Number of seats
                  </span>
                  <span className="text-xs text-charcoal/65 dark:text-brand-ivory/60">
                    {formatINR(workshop.price)} per attendee
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Decrease seat count"
                    disabled={seats <= 1 || submitting}
                    onClick={() => setSeats((s) => Math.max(1, s - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-charcoal/20 bg-brand-ivory text-base font-bold text-charcoal hover:bg-sage/20 disabled:cursor-not-allowed disabled:opacity-35 dark:border-white/20 dark:bg-[#21292E] dark:text-brand-ivory"
                  >
                    −
                  </button>
                  <span className="min-w-8 text-center font-serif text-lg font-bold tabular-nums text-brand-blue dark:text-[#96B7DA]">
                    {seats}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase seat count"
                    disabled={seats >= maxSelectableSeats || submitting}
                    onClick={() => setSeats((s) => Math.min(maxSelectableSeats, s + 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-charcoal/20 bg-brand-ivory text-base font-bold text-charcoal hover:bg-sage/20 disabled:cursor-not-allowed disabled:opacity-35 dark:border-white/20 dark:bg-[#21292E] dark:text-brand-ivory"
                  >
                    +
                  </button>
                </div>
              </div>
              {seats > 1 && (
                <div className="mt-3 flex items-center justify-between border-t border-charcoal/10 pt-2.5 text-xs sm:text-sm dark:border-white/10">
                  <span className="text-charcoal/70 dark:text-brand-ivory/70">
                    Total for {seats} seats
                  </span>
                  <span className="font-serif text-base font-bold text-brand-blue dark:text-[#96B7DA]">
                    {formatINR(workshop.price * seats)}
                  </span>
                </div>
              )}
            </div>
          )}

          {reservation ? (
            <div className="mt-6" role="status">
              <h4 className="text-xl font-medium text-brand-blue dark:text-[#96B7DA]">
                {paymentConfirmed
                  ? "Booking confirmed"
                  : `${(reservation.seats || 1) > 1 ? `${reservation.seats} seats are` : "Your seat is"} temporarily reserved`}
              </h4>
              <p
                className={`mt-3 rounded-2xl border p-4 leading-relaxed ${
                  paymentConfirmed
                    ? "border-sage/60 bg-sage/20 text-charcoal dark:border-sage/40 dark:bg-sage/15 dark:text-brand-ivory"
                    : "border-gold/70 bg-gold/20 text-charcoal dark:border-gold/45 dark:bg-gold/15 dark:text-brand-ivory"
                }`}
              >
                {paymentConfirmed ? paymentMessage : (
                  <>
                    This reservation expires in{" "}
                    <strong className="font-semibold text-brand-blue tabular-nums dark:text-gold">
                      {Math.floor(remainingSeconds / 60)}:
                      {String(remainingSeconds % 60).padStart(2, "0")}
                    </strong>
                    . Complete payment before the timer ends to confirm your booking.
                  </>
                )}
              </p>
              {paymentMessage && !paymentConfirmed && (
                <p className="mt-3 rounded-xl border border-brand-blue/20 bg-white p-3.5 text-sm text-charcoal dark:border-white/15 dark:bg-[#181E22] dark:text-brand-ivory">{paymentMessage}</p>
              )}
              {remainingSeconds === 0 && !paymentConfirmed && (
                <p className="mt-3 rounded-xl border border-terracotta/50 bg-terracotta/12 p-3 text-sm text-terracotta-dark dark:border-terracotta/45 dark:bg-terracotta/15 dark:text-[#F0A592]">
                  The reservation has expired. Close this window and select the session again.
                </p>
              )}
              <p className="mt-3 break-all text-xs text-charcoal/60 dark:text-brand-ivory/55">
                Reservation ID: {reservation.bookingId}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                {paymentMessage &&
                  !paymentConfirmed &&
                  !paymentMessage.includes("released") && (
                    <Button variant="secondary" onClick={checkPaymentStatus} disabled={submitting}>
                      Check payment status
                    </Button>
                  )}
                {!paymentMessage && remainingSeconds > 0 && (
                  <Button type="button" variant="accent" onClick={startPayment} disabled={submitting}>
                    {submitting ? "Opening checkout…" : `Pay ${formatINR(reservation.amount)}`}
                  </Button>
                )}
                <Button variant="secondary" onClick={onClose}>Close</Button>
              </div>
            </div>
          ) : !user ? (
            <>
              <p className="mt-5 leading-relaxed text-charcoal/85 dark:text-brand-ivory/80">
                Sign in with Google before reserving. Your selected session will be waiting when
                you return.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/login"
                  state={{ from: { pathname: "/", hash: "#workshops" } }}
                  className="inline-flex items-center justify-center rounded-full bg-brand-blue px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-brand-blue-dark dark:bg-[#5B81A8] dark:hover:bg-[#6E93B8]"
                >
                  Sign in with Google
                </Link>
                <Button variant="secondary" onClick={onClose}>Close</Button>
              </div>
            </>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={submitReservation}>
              <p className="text-sm leading-relaxed text-charcoal/80 dark:text-brand-ivory/75">
                A seat is temporarily held while you continue. You will pay securely with Razorpay
                after reserving.
              </p>
              <label className="block text-sm font-medium text-charcoal dark:text-brand-ivory">
                Participant name
                <input
                  name="fullName"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                  value={participant.fullName}
                  onChange={updateParticipant}
                  className="mt-1 w-full rounded-xl border border-charcoal/25 bg-white px-4 py-3 font-normal text-charcoal dark:border-white/15 dark:bg-[#181E22] dark:text-brand-ivory"
                />
              </label>
              <label className="block text-sm font-medium text-charcoal dark:text-brand-ivory">
                Participant email
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={participant.email}
                  onChange={updateParticipant}
                  className="mt-1 w-full rounded-xl border border-charcoal/25 bg-white px-4 py-3 font-normal text-charcoal dark:border-white/15 dark:bg-[#181E22] dark:text-brand-ivory"
                />
              </label>
              <label className="block text-sm font-medium text-charcoal dark:text-brand-ivory">
                Participant phone
                <input
                  type="tel"
                  name="phone"
                  autoComplete="tel"
                  required
                  minLength={7}
                  maxLength={25}
                  pattern="[0-9\\s\\(\\)\\+\\-]+"
                  value={participant.phone}
                  onChange={updateParticipant}
                  className="mt-1 w-full rounded-xl border border-charcoal/25 bg-white px-4 py-3 font-normal text-charcoal dark:border-white/15 dark:bg-[#181E22] dark:text-brand-ivory"
                />
              </label>
              <div>
                <p className="mb-2 text-sm leading-relaxed text-charcoal/80 dark:text-brand-ivory/75">
                  Payments are non-refundable. If you cannot attend, you can request to reschedule,
                  subject to availability and approval.
                </p>
                <label className="flex items-start gap-3 rounded-xl border border-sage/50 bg-white p-3.5 text-sm text-charcoal dark:border-white/15 dark:bg-[#181E22] dark:text-brand-ivory">
                  <input
                    type="checkbox"
                    name="policyAccepted"
                    checked={policyAccepted}
                    onChange={(event) => {
                      setPolicyAccepted(event.target.checked);
                      if (event.target.checked) setPolicyError("");
                    }}
                    aria-invalid={policyError ? "true" : undefined}
                    aria-describedby={policyError ? "policy-error" : undefined}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-terracotta-dark"
                  />
                  <span>
                    I have read and agree to the{" "}
                    <Link
                      to={POLICY_PATH}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-terracotta-dark underline underline-offset-4 hover:text-brand-blue dark:text-[#F0A592] dark:hover:text-[#96B7DA]"
                    >
                      {POLICY_NAME}
                    </Link>
                    .
                  </span>
                </label>
                {policyError && (
                  <p id="policy-error" className="mt-2 rounded-xl border border-terracotta/50 bg-terracotta/10 p-3 text-sm text-terracotta-dark dark:border-terracotta/45 dark:bg-terracotta/15 dark:text-[#F0A592]" role="alert">
                    {policyError}
                  </p>
                )}
              </div>
              {error && (
                <p className="rounded-xl border border-terracotta/50 bg-terracotta/10 p-3 text-sm text-terracotta-dark dark:border-terracotta/45 dark:bg-terracotta/15 dark:text-[#F0A592]" role="alert">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-3 pt-2">
                <Button type="submit" variant="accent" disabled={submitting || displayedSeats === 0 || seats > displayedSeats}>
                  {submitting ? "Reserving…" : seats > 1 ? `Reserve ${seats} seats` : "Reserve seat"}
                </Button>
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
              </div>
            </form>
          )}
        </div>
      )}
    </dialog>
  );
}
