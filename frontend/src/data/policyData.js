// Payment, Cancellation & Rescheduling Policy.
// POLICY_VERSION must match PAYMENT_POLICY_VERSION in
// backend/src/policy/policyAcceptance.js. Change both whenever the wording changes.
export const POLICY_VERSION = "payment-cancellation-rescheduling-v1";
export const POLICY_PATH = "/policy";
export const POLICY_NAME = "Payment, Cancellation & Rescheduling Policy";

export const POLICY_SECTIONS = [
  {
    title: "Payment and Booking Confirmation",
    points: [
      "All workshop, session, and event registrations must be completed through the official payment link provided by Mend & Blend.",
      "A seat will be considered confirmed only after successful payment.",
      "Participants are required to pay the full registration fee at the time of booking.",
      "Participants should retain their payment confirmation or transaction proof for reference.",
    ],
  },
  {
    title: "No-Refund Policy",
    points: [
      "All payments made towards workshops, sessions, and events are non-refundable.",
      "Refunds will not be provided if a participant cancels their registration, changes their plans, has personal commitments, or is unable to attend.",
      "Participants are requested to carefully review the date, time, venue, and registration fee before completing payment.",
    ],
  },
  {
    title: "Cancellation and Rescheduling by Participants",
    points: [
      "Participants are requested to inform Mend & Blend as early as possible if they are unable to attend.",
      "Instead of a refund, participants may request to reschedule their registration to another available session.",
      "Rescheduling is subject to availability and approval by the Mend & Blend team.",
      "The amount already paid will be adjusted towards the rescheduled session. No cash reimbursement or additional refund will be provided.",
      "Rescheduling cannot be guaranteed if the requested session is fully booked.",
    ],
  },
  {
    title: "Non-Attendance",
    points: [
      "Participants who do not attend a booked session without prior communication will be considered a no-show.",
      "No refund will be provided for non-attendance.",
      "Rescheduling in such cases will be considered at the discretion of the Mend & Blend team.",
    ],
  },
  {
    title: "Cancellation or Changes by Mend & Blend",
    points: [
      "Mend & Blend reserves the right to modify workshop schedules, venues, or other arrangements when necessary.",
      "If Mend & Blend cancels a session and cannot provide a suitable alternative, an appropriate refund or alternative arrangement will be offered, as applicable under law.",
      "Participants will be informed of such changes in advance whenever reasonably possible.",
    ],
  },
  {
    title: "Workshop Participation",
    points: [
      "Participants are expected to arrive on time and follow the workshop guidelines.",
      "Registrations are valid only for the registered participant and are non-transferable without prior approval from Mend & Blend.",
      "Mend & Blend reserves the right to refuse participation in cases of disruptive or inappropriate conduct, subject to applicable law.",
    ],
  },
  {
    title: "Agreement to Terms",
    points: [
      "By completing the payment, participants confirm that they have read, understood, and agreed to the Payment, Cancellation & Rescheduling Policy of Mend & Blend.",
    ],
  },
];
