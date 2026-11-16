import { Timestamp } from "firebase-admin/firestore";

// Keep in sync with POLICY_VERSION in frontend/src/data/policyData.js.
// Change this identifier whenever the policy wording changes so that earlier
// acceptances remain traceable to the exact version that was accepted.
export const PAYMENT_POLICY_VERSION = "payment-cancellation-rescheduling-v1";
export const POLICY_ACCEPTANCE_COLLECTION = "policyAcceptances";

export class PolicyAcceptanceError extends Error {
  constructor(status, message, reason) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

// Validates the acceptance values sent by a client. The client value is never
// trusted on its own: it must be the boolean `true` and name the current
// policy version. Anything else is rejected before any write happens.
export function validatePolicyAcceptance(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PolicyAcceptanceError(
      400,
      "You must accept the Payment, Cancellation & Rescheduling Policy to continue.",
      "policy_not_accepted",
    );
  }
  if (input.policyAccepted !== true) {
    throw new PolicyAcceptanceError(
      400,
      "You must accept the Payment, Cancellation & Rescheduling Policy to continue.",
      "policy_not_accepted",
    );
  }
  if (input.policyVersion !== PAYMENT_POLICY_VERSION) {
    throw new PolicyAcceptanceError(
      400,
      "The Payment, Cancellation & Rescheduling Policy has changed. Please reload the page and review it again.",
      "policy_version_mismatch",
    );
  }
  return { policyAccepted: true, policyVersion: PAYMENT_POLICY_VERSION };
}

// The server builds the stored record itself. The authenticated user ID, booking
// ID, version and timestamp never come from the request body.
export function createPolicyAcceptanceRecord({ uid, bookingId, now = Timestamp.now() }) {
  return {
    accepted: true,
    policyVersion: PAYMENT_POLICY_VERSION,
    acceptedAt: now,
    customerId: uid,
    bookingId,
  };
}

// Re-checks a stored record before a payment order is created.
export function assertStoredPolicyAcceptance(record, { uid, bookingId }) {
  const valid =
    record &&
    record.accepted === true &&
    record.policyVersion === PAYMENT_POLICY_VERSION &&
    record.customerId === uid &&
    record.bookingId === bookingId &&
    record.acceptedAt instanceof Timestamp;
  if (!valid) {
    throw new PolicyAcceptanceError(
      403,
      "This reservation has no recorded acceptance of the Payment, Cancellation & Rescheduling Policy. Please reserve a seat again and accept the policy.",
      "policy_acceptance_missing",
    );
  }
}
