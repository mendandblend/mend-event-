import assert from "node:assert/strict";
import test from "node:test";
import { validateCheckoutOrder } from "../src/booking/checkoutOrder.js";

test("valid Razorpay order details retain the server amount, currency, ID and test or live key", () => {
  const order = {
    orderId: "order_test_123",
    amount: 150000,
    currency: "INR",
    keyId: "rzp_test_example",
    bookingId: "booking-123",
    expiresAt: "2030-01-15T10:00:00.000Z",
  };
  assert.deepEqual(validateCheckoutOrder(order, order.bookingId), order);

  const liveOrder = {
    ...order,
    keyId: "rzp_live_example",
  };
  assert.deepEqual(validateCheckoutOrder(liveOrder, liveOrder.bookingId), liveOrder);
});

test("invalid order details are rejected before checkout opens", () => {
  const order = {
    orderId: "order_test_123",
    amount: 150000,
    currency: "INR",
    keyId: "rzp_live_example",
    bookingId: "booking-123",
    expiresAt: "2030-01-15T10:00:00.000Z",
  };
  for (const invalidOrder of [
    { ...order, amount: 150000.5 },
    { ...order, currency: "USD" },
    { ...order, keyId: "invalid_key_format" },
    { ...order, bookingId: "another-booking" },
    { ...order, orderId: "" },
  ]) {
    assert.throws(
      () => validateCheckoutOrder(invalidOrder, order.bookingId),
      /incomplete or invalid Razorpay order details/,
    );
  }
});
