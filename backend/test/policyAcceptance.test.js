import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import express from "express";
import { Timestamp } from "firebase-admin/firestore";
import {
  PAYMENT_POLICY_VERSION,
  PolicyAcceptanceError,
  assertStoredPolicyAcceptance,
  validatePolicyAcceptance,
} from "../src/policy/policyAcceptance.js";
import { createReservationWithDatabase } from "../src/services/bookingService.js";
import { createBookingsRouter } from "../src/routes/bookings.js";
import { MemoryFirestore } from "./helpers/memoryFirestore.js";

const now = Timestamp.fromDate(new Date("2030-01-01T12:00:00.000Z"));
const participant = { fullName: "Test Customer", email: "c@example.com", phone: "+91 98400 43145" };
const accepted = { policyAccepted: true, policyVersion: PAYMENT_POLICY_VERSION };

function makeDatabase() {
  return new MemoryFirestore({
    workshops: {
      "event-1": {
        title: "Test event", date: "2030-01-15", start: "11:00", end: "12:30",
        price: 1500, capacity: 5, published: true, status: "published",
        registrationOpenAt: Timestamp.fromMillis(now.toMillis() - 60_000),
        registrationCloseAt: Timestamp.fromMillis(now.toMillis() + 3_600_000),
      },
    },
  });
}

test("acceptance must be the boolean true for the current policy version", () => {
  for (const bad of [
    undefined, null, {}, [], "true",
    { policyAccepted: false, policyVersion: PAYMENT_POLICY_VERSION },
    { policyAccepted: "true", policyVersion: PAYMENT_POLICY_VERSION },
    { policyAccepted: 1, policyVersion: PAYMENT_POLICY_VERSION },
    { policyAccepted: true },
    { policyAccepted: true, policyVersion: "old-version" },
  ]) {
    assert.throws(() => validatePolicyAcceptance(bad), (error) =>
      error instanceof PolicyAcceptanceError && error.status === 400);
  }
  assert.deepEqual(validatePolicyAcceptance(accepted), accepted);
});

test("a reservation without valid acceptance is rejected and writes nothing", async () => {
  for (const policyAcceptance of [undefined, { policyAccepted: false, policyVersion: PAYMENT_POLICY_VERSION }]) {
    const db = makeDatabase();
    await assert.rejects(
      createReservationWithDatabase({ db, uid: "u1", workshopId: "event-1", participant, policyAcceptance, now, bookingId: "b1" }),
      (error) => error.status === 400,
    );
    assert.equal(db.records("bookings").size, 0);
    assert.equal(db.records("bookingLimits").size, 0);
    assert.equal(db.records("policyAcceptances").size, 0);
  }
});

test("the stored acceptance is built by the server for the authenticated user and booking", async () => {
  const db = makeDatabase();
  const reservation = await createReservationWithDatabase({
    db, uid: "u1", workshopId: "event-1", participant, now, bookingId: "b1",
    // Extra client-supplied values must never reach the stored record.
    policyAcceptance: { ...accepted, customerId: "someone-else", acceptedAt: "1999-01-01", bookingId: "other" },
  });
  const record = db.records("policyAcceptances").get("b1");
  assert.equal(record.accepted, true);
  assert.equal(record.policyVersion, PAYMENT_POLICY_VERSION);
  assert.equal(record.customerId, "u1");
  assert.equal(record.bookingId, "b1");
  assert.equal(record.acceptedAt.toMillis(), now.toMillis());
  assert.equal(reservation.policyVersion, PAYMENT_POLICY_VERSION);
  assert.equal(db.records("bookings").get("b1").status, "reserved");
});

test("stored acceptance is re-checked before payment for user, booking, version and server time", () => {
  const good = { accepted: true, policyVersion: PAYMENT_POLICY_VERSION, acceptedAt: now, customerId: "u1", bookingId: "b1" };
  assert.doesNotThrow(() => assertStoredPolicyAcceptance(good, { uid: "u1", bookingId: "b1" }));
  for (const [record, ctx] of [
    [null, { uid: "u1", bookingId: "b1" }],
    [{ ...good, accepted: false }, { uid: "u1", bookingId: "b1" }],
    [{ ...good, policyVersion: "old" }, { uid: "u1", bookingId: "b1" }],
    [{ ...good, acceptedAt: "2030-01-01" }, { uid: "u1", bookingId: "b1" }],
    [good, { uid: "u2", bookingId: "b1" }],
    [good, { uid: "u1", bookingId: "b2" }],
  ]) {
    assert.throws(() => assertStoredPolicyAcceptance(record, ctx), (error) => error.status === 403);
  }
});

async function withApp(services, run) {
  const app = express();
  app.use(express.json());
  const auth = (req, res, next) => {
    if (!req.get("authorization")) return res.status(401).json({ error: "token required" });
    req.firebaseUser = { uid: "u1" };
    return next();
  };
  app.use("/api/bookings", createBookingsRouter({ auth, services }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0);
  try {
    await run(`http://127.0.0.1:${server.address().port}/api/bookings/reservations`);
  } finally {
    server.close();
  }
}

test("direct API calls without valid acceptance are rejected before reaching the booking service", async () => {
  const calls = [];
  const services = { createReservation: async (args) => { calls.push(args); return { bookingId: "b1" }; } };
  await withApp(services, async (url) => {
    const post = (body) => fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ eventId: "event-1", participant, ...body }),
    });
    for (const body of [
      {},
      { policyAccepted: false, policyVersion: PAYMENT_POLICY_VERSION },
      { policyAccepted: "true", policyVersion: PAYMENT_POLICY_VERSION },
      { policyAccepted: true, policyVersion: "stale" },
    ]) {
      const response = await post(body);
      assert.equal(response.status, 400);
    }
    assert.equal(calls.length, 0);

    const ok = await post(accepted);
    assert.equal(ok.status, 201);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].uid, "u1");
    assert.deepEqual(calls[0].policyAcceptance, accepted);
  });
});

test("backend and frontend use the same policy version identifier", () => {
  const frontend = readFileSync(new URL("../../frontend/src/data/policyData.js", import.meta.url), "utf8");
  assert.match(frontend, new RegExp(`POLICY_VERSION\\s*=\\s*"${PAYMENT_POLICY_VERSION}"`));
});
