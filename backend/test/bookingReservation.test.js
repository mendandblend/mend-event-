import test from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import {
  BookingError,
  createReservationWithDatabase,
} from "../src/services/bookingService.js";
import { bookingHoldMinutes } from "../src/bookingPolicy.js";
import { PAYMENT_POLICY_VERSION } from "../src/policy/policyAcceptance.js";
import { MemoryFirestore } from "./helpers/memoryFirestore.js";

const now = Timestamp.fromDate(new Date("2030-01-01T12:00:00.000Z"));
const participant = {
  fullName: "Test Customer",
  email: "customer@example.com",
  phone: "+1 555 0100",
};

function makeDatabase({ capacity = 2, published = true, bookings = {} } = {}) {
  return new MemoryFirestore({
    workshops: {
      "event-1": {
        title: "Test event",
        date: "2030-01-15",
        start: "11:00",
        end: "12:30",
        price: 1500,
        capacity,
        published,
        status: published ? "published" : "draft",
        registrationOpenAt: Timestamp.fromMillis(now.toMillis() - 60_000),
        registrationCloseAt: Timestamp.fromMillis(now.toMillis() + 60 * 60_000),
      },
    },
    bookings,
  });
}

async function reserve(db, overrides = {}) {
  return createReservationWithDatabase({
    db,
    uid: "customer-1",
    workshopId: "event-1",
    participant,
    policyAcceptance: { policyAccepted: true, policyVersion: PAYMENT_POLICY_VERSION },
    now,
    bookingId: "new-booking",
    ...overrides,
  });
}

test("a successful reservation atomically records the booking and a ten-minute hold", async () => {
  assert.equal(bookingHoldMinutes, 10);
  const db = makeDatabase();
  const reservation = await reserve(db);
  const booking = db.records("bookings").get("new-booking");
  const limit = db.records("bookingLimits").get("customer-1_event-1");

  assert.equal(reservation.status, "reserved");
  assert.equal(reservation.holdMinutes, 10);
  assert.equal(
    new Date(reservation.expiresAt).getTime() - now.toMillis(),
    10 * 60_000,
  );
  assert.equal(booking.eventId, "event-1");
  assert.equal(booking.customerId, "customer-1");
  assert.equal(booking.status, "reserved");
  assert.equal(limit.bookingId, "new-booking");
  assert.equal(db.records("workshops").get("event-1").reservationVersion, 1);
});

test("unpublished events and full-capacity events reject reservations without writes", async () => {
  const unpublished = makeDatabase({ published: false });
  await assert.rejects(reserve(unpublished), (error) => error.status === 404);
  assert.equal(unpublished.records("bookings").size, 0);

  const full = makeDatabase({
    capacity: 1,
    bookings: {
      existing: {
        workshopId: "event-1",
        status: "confirmed",
      },
    },
  });
  await assert.rejects(reserve(full), (error) => error.status === 409);
  assert.equal(full.records("bookings").size, 1);
});

test("duplicate active reservations are rejected and expired holds can be replaced", async () => {
  const db = makeDatabase();
  await reserve(db);
  await assert.rejects(
    reserve(db, { bookingId: "duplicate-booking" }),
    (error) => error instanceof BookingError && error.status === 409,
  );

  const afterExpiry = Timestamp.fromMillis(now.toMillis() + 11 * 60_000);
  const replacement = await reserve(db, {
    now: afterExpiry,
    bookingId: "replacement-booking",
  });
  assert.equal(replacement.status, "reserved");
  assert.equal(db.records("bookings").get("replacement-booking").status, "reserved");
});

test("multiple seats can be booked in a single reservation and atomically reserve capacity", async () => {
  const db = makeDatabase({ capacity: 5 });
  const reservation = await reserve(db, { seats: 3 });
  assert.equal(reservation.seats, 3);
  assert.equal(reservation.amount, 1500 * 3);
  assert.equal(reservation.availableSeats, 2);

  const booking = db.records("bookings").get("new-booking");
  assert.equal(booking.seats, 3);
  assert.equal(booking.amount, 4500);

  // Attempting to reserve 3 more seats when only 2 remain rejects with 409
  await assert.rejects(
    createReservationWithDatabase({
      db,
      uid: "customer-2",
      workshopId: "event-1",
      participant,
      seats: 3,
      policyAcceptance: { policyAccepted: true, policyVersion: PAYMENT_POLICY_VERSION },
      now,
      bookingId: "overbooking",
    }),
    (error) => error instanceof BookingError && error.status === 409,
  );
});
