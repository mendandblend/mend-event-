import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getDatabase } from "../firebaseAdmin.js";
import {
  BookingError,
  activeBookingQueries,
  countActiveBookings,
  isActive,
  ticketLimitDocumentId,
} from "./bookingService.js";
import { isPublicEvent } from "./eventService.js";

export const REQUEST_COLLECTION = "bookingRequests";
export const REQUEST_TYPES = ["cancellation", "reschedule"];
const MAX_TEXT_LENGTH = 1000;
const idPattern = /^[a-zA-Z0-9_-]{1,120}$/;

function cleanText(value, label) {
  if (value == null || value === "") return "";
  if (typeof value !== "string") {
    throw new BookingError(400, `${label} must be text.`);
  }
  const text = value.trim();
  if (text.length > MAX_TEXT_LENGTH) {
    throw new BookingError(400, `${label} must be ${MAX_TEXT_LENGTH} characters or fewer.`);
  }
  return text;
}

// Session start in India Standard Time. Falls back to the end of the session
// date when the stored time cannot be read, and to null when the date is unknown.
export function sessionStartMillis({ sessionDate, start }) {
  if (typeof sessionDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return null;
  }
  let time = "23:59";
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(String(start || "").trim());
  if (match) {
    let hours = Number(match[1]);
    const meridiem = match[3]?.toUpperCase();
    if (meridiem === "PM" && hours < 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;
    time = `${String(hours).padStart(2, "0")}:${match[2]}`;
  }
  const millis = Date.parse(`${sessionDate}T${time}:00+05:30`);
  return Number.isNaN(millis) ? null : millis;
}

const toIso = (value) => value?.toDate?.().toISOString() ?? null;

export function serializeBookingRequest(id, data) {
  return {
    ...data,
    id,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    decision: data.decision
      ? { ...data.decision, at: toIso(data.decision.at) }
      : null,
    history: (data.history || []).map((entry) => ({ ...entry, at: toIso(entry.at) })),
  };
}

function venueOf(workshop) {
  return workshop.venue ||
    [workshop.venueName, workshop.venueAddress].filter(Boolean).join(", ");
}

export async function createBookingRequestWithDatabase({
  db,
  uid,
  bookingId,
  type,
  reason,
  preferredWorkshopId,
  now = Timestamp.now(),
  requestId = randomUUID(),
}) {
  if (!REQUEST_TYPES.includes(type)) {
    throw new BookingError(400, "Choose cancellation or rescheduling.");
  }
  if (typeof bookingId !== "string" || !idPattern.test(bookingId)) {
    throw new BookingError(400, "A valid booking is required.");
  }
  const cleanReason = cleanText(reason, "Reason");
  let preferredId = null;
  if (type === "reschedule" && preferredWorkshopId) {
    if (typeof preferredWorkshopId !== "string" || !idPattern.test(preferredWorkshopId)) {
      throw new BookingError(400, "Choose a valid session to reschedule to.");
    }
    preferredId = preferredWorkshopId;
  }

  const bookingRef = db.collection("bookings").doc(bookingId);
  const ticketRef = db.collection("tickets").doc(bookingId);
  const requestRef = db.collection(REQUEST_COLLECTION).doc(requestId);

  return db.runTransaction(async (transaction) => {
    const [bookingSnapshot, ticketSnapshot, preferredSnapshot] = await Promise.all([
      transaction.get(bookingRef),
      transaction.get(ticketRef),
      preferredId
        ? transaction.get(db.collection("workshops").doc(preferredId))
        : Promise.resolve(null),
    ]);
    if (!bookingSnapshot.exists || bookingSnapshot.data().customerId !== uid) {
      throw new BookingError(404, "Booking not found.");
    }
    const booking = bookingSnapshot.data();
    if (booking.status !== "confirmed") {
      throw new BookingError(
        409,
        "Cancellation and rescheduling requests can only be made for confirmed bookings.",
      );
    }
    if (ticketSnapshot.exists && ticketSnapshot.data().status === "redeemed") {
      throw new BookingError(409, "This ticket has already been used.");
    }
    const startMillis = sessionStartMillis(booking);
    if (startMillis !== null && startMillis <= now.toMillis()) {
      throw new BookingError(
        409,
        "This session has already started or passed. Please contact Mend & Blend for help.",
      );
    }
    if (booking.activeRequestId) {
      const activeSnapshot = await transaction.get(
        db.collection(REQUEST_COLLECTION).doc(booking.activeRequestId),
      );
      if (activeSnapshot.exists && activeSnapshot.data().status === "pending") {
        throw new BookingError(
          409,
          "You already have a pending request for this booking.",
        );
      }
    }

    let preferred = null;
    if (preferredId) {
      if (
        !preferredSnapshot.exists ||
        !isPublicEvent(preferredSnapshot.data()) ||
        preferredId === (booking.workshopId || booking.eventId)
      ) {
        throw new BookingError(400, "The selected session is not available.");
      }
      preferred = preferredSnapshot.data();
    }

    const request = {
      customerId: uid,
      bookingId,
      type,
      status: "pending",
      reason: cleanReason,
      workshopId: booking.workshopId || booking.eventId,
      workshopName: booking.workshopName || "",
      sessionDate: booking.sessionDate || "",
      start: booking.start || "",
      end: booking.end || "",
      participant: booking.participant || null,
      amountPaid: booking.amount ?? null,
      currency: booking.currency || "INR",
      refundEligible: false,
      preferredWorkshopId: preferredId,
      preferredWorkshopName: preferred?.title || null,
      createdAt: now,
      updatedAt: now,
      decision: null,
      history: [{ status: "pending", at: now, by: uid, note: "Request submitted." }],
    };
    transaction.create(requestRef, request);
    transaction.update(bookingRef, {
      activeRequestId: requestId,
      activeRequestType: type,
      updatedAt: now,
    });
    return serializeBookingRequest(requestId, request);
  });
}

export async function listCustomerRequestsWithDatabase({ db, uid }) {
  const snapshot = await db
    .collection(REQUEST_COLLECTION)
    .where("customerId", "==", uid)
    .get();
  return snapshot.docs
    .map((document) => serializeBookingRequest(document.id, document.data()))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function listAdminRequestsWithDatabase({ db, status }) {
  const collection = db.collection(REQUEST_COLLECTION);
  const snapshot = await (["pending", "approved", "rejected"].includes(status)
    ? collection.where("status", "==", status)
    : collection
  ).get();
  return snapshot.docs
    .map((document) => serializeBookingRequest(document.id, document.data()))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function decideBookingRequestWithDatabase({
  db,
  requestId,
  adminUid,
  decision,
  note,
  targetWorkshopId,
  now = Timestamp.now(),
}) {
  if (!["approve", "reject"].includes(decision)) {
    throw new BookingError(400, "Choose approve or reject.");
  }
  if (typeof requestId !== "string" || !idPattern.test(requestId)) {
    throw new BookingError(400, "A valid request is required.");
  }
  const cleanNote = cleanText(note, "Note");
  const requestRef = db.collection(REQUEST_COLLECTION).doc(requestId);

  return db.runTransaction(async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists) throw new BookingError(404, "Request not found.");
    const request = requestSnapshot.data();
    if (request.status !== "pending") {
      throw new BookingError(409, "This request has already been decided.");
    }

    const bookingRef = db.collection("bookings").doc(request.bookingId);
    const ticketRef = db.collection("tickets").doc(request.bookingId);
    const [bookingSnapshot, ticketSnapshot] = await Promise.all([
      transaction.get(bookingRef),
      transaction.get(ticketRef),
    ]);
    const booking = bookingSnapshot.exists ? bookingSnapshot.data() : null;
    const nextStatus = decision === "approve" ? "approved" : "rejected";
    const decisionRecord = { by: adminUid, at: now, note: cleanNote };
    const history = [
      ...(request.history || []),
      { status: nextStatus, at: now, by: adminUid, note: cleanNote },
    ];
    const clearActive = { activeRequestId: null, activeRequestType: null, updatedAt: now };

    if (decision === "reject") {
      const updates = { status: "rejected", decision: decisionRecord, history, updatedAt: now };
      transaction.update(requestRef, updates);
      if (booking?.activeRequestId === requestId) {
        transaction.update(bookingRef, clearActive);
      }
      return serializeBookingRequest(requestId, { ...request, ...updates });
    }

    // Approval changes the booking, so it must still be a confirmed, unused one.
    if (!booking || booking.status !== "confirmed") {
      throw new BookingError(409, "The booking is no longer confirmed.");
    }
    if (ticketSnapshot.exists && ticketSnapshot.data().status === "redeemed") {
      throw new BookingError(409, "The ticket has already been used.");
    }
    const uid = booking.customerId;

    if (request.type === "cancellation") {
      const limitRef = db.collection("bookingLimits").doc(booking.limitId);
      const limitSnapshot = await transaction.get(limitRef);
      transaction.update(bookingRef, {
        status: "cancelled",
        cancelledBy: "participant_request",
        cancellationRequestId: requestId,
        ...clearActive,
      });
      if (ticketSnapshot.exists && ticketSnapshot.data().status === "valid") {
        transaction.update(ticketRef, { status: "cancelled", isValid: false, cancelledAt: now });
      }
      if (limitSnapshot.exists && limitSnapshot.data().bookingId === request.bookingId) {
        transaction.update(limitRef, { status: "cancelled", expiresAt: now, updatedAt: now });
      }
      // The captured payment is deliberately left untouched: the policy is
      // no-refund, so approving a cancellation never starts a refund.
      const updates = {
        status: "approved",
        outcome: "cancelled_no_refund",
        decision: decisionRecord,
        history,
        updatedAt: now,
      };
      transaction.update(requestRef, updates);
      return serializeBookingRequest(requestId, { ...request, ...updates });
    }

    // Reschedule approval: move the existing paid booking to another session.
    const targetId = typeof targetWorkshopId === "string" && targetWorkshopId
      ? targetWorkshopId
      : request.preferredWorkshopId;
    if (typeof targetId !== "string" || !idPattern.test(targetId)) {
      throw new BookingError(400, "Choose the session to move this booking to.");
    }
    const currentId = booking.workshopId || booking.eventId;
    if (targetId === currentId) {
      throw new BookingError(400, "Choose a different session from the current one.");
    }
    const newLimitId = ticketLimitDocumentId(uid, targetId);
    const [targetSnapshot, oldLimitSnapshot, newLimitSnapshot, ...activeReads] =
      await Promise.all([
        transaction.get(db.collection("workshops").doc(targetId)),
        transaction.get(db.collection("bookingLimits").doc(booking.limitId)),
        transaction.get(db.collection("bookingLimits").doc(newLimitId)),
        ...activeBookingQueries(db, targetId, now).map((query) => transaction.get(query)),
      ]);
    if (!targetSnapshot.exists || !isPublicEvent(targetSnapshot.data())) {
      throw new BookingError(409, "The selected session is not published.");
    }
    const target = targetSnapshot.data();
    const targetStart = sessionStartMillis({ sessionDate: target.date, start: target.start });
    if (targetStart !== null && targetStart <= now.toMillis()) {
      throw new BookingError(409, "The selected session has already started or passed.");
    }
    if (countActiveBookings(activeReads, now) >= target.capacity) {
      throw new BookingError(409, "The selected session is fully booked.");
    }
    if (
      newLimitId !== booking.limitId &&
      newLimitSnapshot.exists &&
      isActive(newLimitSnapshot.data(), now)
    ) {
      throw new BookingError(
        409,
        "The participant already has an active booking for the selected session.",
      );
    }

    const newLimitRef = db.collection("bookingLimits").doc(newLimitId);
    if (
      newLimitId !== booking.limitId &&
      oldLimitSnapshot.exists &&
      oldLimitSnapshot.data().bookingId === request.bookingId
    ) {
      transaction.update(db.collection("bookingLimits").doc(booking.limitId), {
        status: "rescheduled",
        expiresAt: now,
        updatedAt: now,
      });
    }
    transaction.set(newLimitRef, {
      customerId: uid,
      workshopId: targetId,
      bookingId: request.bookingId,
      status: "confirmed",
      updatedAt: now,
    });

    const details = {
      workshopId: targetId,
      eventId: targetId,
      workshopName: target.title,
      sessionDate: target.date,
      start: target.start,
      end: target.end,
      venue: venueOf(target),
    };
    transaction.update(bookingRef, {
      ...details,
      limitId: newLimitId,
      rescheduledFrom: {
        workshopId: currentId,
        workshopName: booking.workshopName || "",
        sessionDate: booking.sessionDate || "",
        start: booking.start || "",
        end: booking.end || "",
        requestId,
      },
      rescheduleCount: (booking.rescheduleCount || 0) + 1,
      ...clearActive,
    });
    if (ticketSnapshot.exists) {
      transaction.update(ticketRef, details);
    }

    // The amount already paid carries over to the new session. Any difference
    // is recorded for staff to follow up; nothing is charged or refunded here.
    const amountPaid = Number(booking.amount) || 0;
    const newSessionPrice = Number(target.price) || 0;
    const updates = {
      status: "approved",
      outcome: "rescheduled",
      targetWorkshopId: targetId,
      targetWorkshopName: target.title,
      targetSessionDate: target.date,
      priceAdjustment: {
        amountPaid,
        newSessionPrice,
        balanceDue: Math.max(0, newSessionPrice - amountPaid),
        unusedAmount: Math.max(0, amountPaid - newSessionPrice),
        refundIssued: 0,
      },
      decision: decisionRecord,
      history,
      updatedAt: now,
    };
    transaction.update(requestRef, updates);
    return serializeBookingRequest(requestId, { ...request, ...updates });
  });
}

export const createBookingRequest = (args) =>
  createBookingRequestWithDatabase({ db: getDatabase(), ...args });
export const listCustomerRequests = (uid) =>
  listCustomerRequestsWithDatabase({ db: getDatabase(), uid });
export const listAdminRequests = (status) =>
  listAdminRequestsWithDatabase({ db: getDatabase(), status });
export const decideBookingRequest = (args) =>
  decideBookingRequestWithDatabase({ db: getDatabase(), ...args });
