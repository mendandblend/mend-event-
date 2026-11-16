import test from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import {
  createBookingRequestWithDatabase,
  decideBookingRequestWithDatabase,
  listAdminRequestsWithDatabase,
  listCustomerRequestsWithDatabase,
} from "../src/services/bookingRequestService.js";
import { MemoryFirestore } from "./helpers/memoryFirestore.js";

const now = Timestamp.fromDate(new Date("2030-01-01T12:00:00.000Z"));
const workshop = (over = {}) => ({
  title: "Session A", date: "2030-01-15", start: "11:00", end: "12:30",
  price: 1500, capacity: 2, published: true, status: "published", ...over,
});

function makeDatabase(extra = {}) {
  return new MemoryFirestore({
    workshops: {
      "event-1": workshop(),
      "event-2": workshop({ title: "Session B", date: "2030-02-01", price: 1800 }),
      "event-3": workshop({ title: "Full session", date: "2030-02-02", capacity: 1 }),
      "event-draft": workshop({ title: "Draft", published: false, status: "draft" }),
    },
    bookings: {
      b1: {
        customerId: "u1", limitId: "u1_event-1", workshopId: "event-1", eventId: "event-1",
        workshopName: "Session A", sessionDate: "2030-01-15", start: "11:00", end: "12:30",
        amount: 1500, currency: "INR", status: "confirmed", razorpayOrderId: "order_1",
        participant: { fullName: "Test", email: "t@example.com", phone: "1234567" },
      },
      other: { customerId: "u9", workshopId: "event-3", status: "confirmed" },
    },
    tickets: { b1: { bookingId: "b1", customerId: "u1", workshopId: "event-1", status: "valid", isValid: true, qrToken: "tok" } },
    bookingLimits: { "u1_event-1": { customerId: "u1", workshopId: "event-1", bookingId: "b1", status: "confirmed" } },
    payments: { order_1: { bookingId: "b1", customerId: "u1", status: "captured", amountInSubunits: 150000 } },
    ...extra,
  });
}

const ask = (db, over = {}) => createBookingRequestWithDatabase({
  db, uid: "u1", bookingId: "b1", type: "reschedule", reason: "Clash", now, requestId: "r1", ...over,
});
const decide = (db, over = {}) => decideBookingRequestWithDatabase({
  db, requestId: "r1", adminUid: "admin-1", decision: "approve", note: "ok", now, ...over,
});

test("a participant can request cancellation or rescheduling of a confirmed booking", async () => {
  const db = makeDatabase();
  const request = await ask(db, { preferredWorkshopId: "event-2" });
  assert.equal(request.status, "pending");
  assert.equal(request.refundEligible, false);
  assert.equal(request.preferredWorkshopName, "Session B");
  assert.equal(db.records("bookings").get("b1").activeRequestId, "r1");
  assert.equal((await listCustomerRequestsWithDatabase({ db, uid: "u1" })).length, 1);
  assert.equal((await listCustomerRequestsWithDatabase({ db, uid: "u2" })).length, 0);
  assert.equal((await listAdminRequestsWithDatabase({ db, status: "pending" })).length, 1);
  assert.equal((await listAdminRequestsWithDatabase({ db, status: "approved" })).length, 0);
});

test("ineligible requests are rejected", async () => {
  await assert.rejects(ask(makeDatabase(), { type: "refund" }), (e) => e.status === 400);
  await assert.rejects(ask(makeDatabase(), { bookingId: "other" }), (e) => e.status === 404);
  await assert.rejects(ask(makeDatabase(), { uid: "u2" }), (e) => e.status === 404);
  await assert.rejects(ask(makeDatabase(), { reason: "x".repeat(1001) }), (e) => e.status === 400);
  await assert.rejects(ask(makeDatabase(), { preferredWorkshopId: "event-draft" }), (e) => e.status === 400);
  await assert.rejects(ask(makeDatabase(), { preferredWorkshopId: "event-1" }), (e) => e.status === 400);
  await assert.rejects(ask(makeDatabase(), { now: Timestamp.fromDate(new Date("2030-01-15T06:00:00Z")) }), (e) => e.status === 409);

  const unpaid = makeDatabase();
  unpaid.records("bookings").get("b1").status = "reserved";
  await assert.rejects(ask(unpaid), (e) => e.status === 409);

  const used = makeDatabase();
  used.records("tickets").get("b1").status = "redeemed";
  await assert.rejects(ask(used), (e) => e.status === 409);
});

test("only one pending request per booking", async () => {
  const db = makeDatabase();
  await ask(db);
  await assert.rejects(ask(db, { requestId: "r2", type: "cancellation" }), (e) => e.status === 409);
});

test("approving a reschedule moves the paid booking, ticket and limit without any refund", async () => {
  const db = makeDatabase();
  await ask(db, { preferredWorkshopId: "event-2" });
  const result = await decide(db);
  const booking = db.records("bookings").get("b1");
  assert.equal(result.status, "approved");
  assert.equal(result.outcome, "rescheduled");
  assert.equal(booking.workshopId, "event-2");
  assert.equal(booking.sessionDate, "2030-02-01");
  assert.equal(booking.status, "confirmed");
  assert.equal(booking.amount, 1500);
  assert.equal(booking.activeRequestId, null);
  assert.equal(booking.rescheduledFrom.workshopId, "event-1");
  assert.equal(db.records("tickets").get("b1").workshopId, "event-2");
  assert.equal(db.records("tickets").get("b1").qrToken, "tok");
  assert.equal(db.records("bookingLimits").get("u1_event-1").status, "rescheduled");
  assert.equal(db.records("bookingLimits").get("u1_event-2").bookingId, "b1");
  assert.deepEqual(result.priceAdjustment, {
    amountPaid: 1500, newSessionPrice: 1800, balanceDue: 300, unusedAmount: 0, refundIssued: 0,
  });
  assert.equal(db.records("payments").get("order_1").status, "captured");
  assert.equal(result.decision.by, "admin-1");
  assert.deepEqual(result.history.map((h) => h.status), ["pending", "approved"]);
});

test("a reschedule needs a free, published, different session", async () => {
  for (const [target, status] of [
    ["event-3", 409], ["event-draft", 409], ["event-1", 400], [undefined, 400], ["missing", 409],
  ]) {
    const db = makeDatabase();
    db.records("bookings").get("other").status = "confirmed";
    await ask(db);
    await assert.rejects(decide(db, { targetWorkshopId: target }), (e) => e.status === status, String(target));
    assert.equal(db.records("bookings").get("b1").workshopId, "event-1");
    assert.equal(db.records("workshops").get("event-1").title, "Session A");
    assert.equal(db.records("bookingRequests").get("r1").status, "pending");
  }
});

test("approving a cancellation frees the seat and never touches the payment", async () => {
  const db = makeDatabase();
  await ask(db, { type: "cancellation", reason: "Cannot attend" });
  const result = await decide(db);
  assert.equal(result.outcome, "cancelled_no_refund");
  assert.equal(db.records("bookings").get("b1").status, "cancelled");
  assert.equal(db.records("tickets").get("b1").status, "cancelled");
  assert.equal(db.records("tickets").get("b1").isValid, false);
  assert.equal(db.records("bookingLimits").get("u1_event-1").status, "cancelled");
  assert.deepEqual(db.records("payments").get("order_1"), {
    bookingId: "b1", customerId: "u1", status: "captured", amountInSubunits: 150000,
  });
});

test("rejecting keeps the booking intact and records the admin decision", async () => {
  const db = makeDatabase();
  await ask(db, { type: "cancellation" });
  const result = await decide(db, { decision: "reject", note: "Please attend" });
  assert.equal(result.status, "rejected");
  assert.equal(result.decision.note, "Please attend");
  const booking = db.records("bookings").get("b1");
  assert.equal(booking.status, "confirmed");
  assert.equal(booking.activeRequestId, null);
  assert.equal(db.records("tickets").get("b1").status, "valid");
  // The participant may then submit a new request.
  assert.equal((await ask(db, { requestId: "r2" })).status, "pending");
});

test("a request cannot be decided twice and decisions are validated", async () => {
  const db = makeDatabase();
  await ask(db, { type: "cancellation" });
  await assert.rejects(decide(db, { decision: "maybe" }), (e) => e.status === 400);
  await decide(db);
  await assert.rejects(decide(db, { decision: "reject" }), (e) => e.status === 409);
  await assert.rejects(decide(db, { requestId: "missing" }), (e) => e.status === 404);
});
