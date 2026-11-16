import test from "node:test";
import assert from "node:assert/strict";
import { POLICY_NAME, POLICY_PATH, POLICY_SECTIONS, POLICY_VERSION } from "../src/data/policyData.js";

test("the policy keeps its seven sections and a stable version identifier", () => {
  assert.equal(POLICY_SECTIONS.length, 7);
  assert.deepEqual(POLICY_SECTIONS.map((section) => section.title), [
    "Payment and Booking Confirmation",
    "No-Refund Policy",
    "Cancellation and Rescheduling by Participants",
    "Non-Attendance",
    "Cancellation or Changes by Mend & Blend",
    "Workshop Participation",
    "Agreement to Terms",
  ]);
  for (const section of POLICY_SECTIONS) assert.ok(section.points.length > 0);
  assert.equal(POLICY_NAME, "Payment, Cancellation & Rescheduling Policy");
  assert.equal(POLICY_PATH, "/policy");
  assert.match(POLICY_VERSION, /^[a-z0-9-]+$/);
});
