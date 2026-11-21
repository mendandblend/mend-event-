import Razorpay from "razorpay";

let client;

export function isRazorpayTestKey(keyId) {
  return typeof keyId === "string" && /^rzp_test_[A-Za-z0-9]+$/.test(keyId);
}

export function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const mode = process.env.RAZORPAY_MODE?.trim() || "test";
  if (!keyId || !keySecret) {
    const error = new Error("Razorpay is not configured on the backend.");
    error.status = 503;
    throw error;
  }
  if (mode !== "test" && mode !== "live") {
    const error = new Error("RAZORPAY_MODE must be either test or live.");
    error.status = 503;
    throw error;
  }

  const keyMatchesMode =
    mode === "live"
      ? /^rzp_live_[A-Za-z0-9]+$/.test(keyId)
      : isRazorpayTestKey(keyId);
  if (!keyMatchesMode) {
    const error = new Error(
      mode === "test" && keyId.startsWith("rzp_live_")
        ? "Razorpay live mode is disabled. Use test-mode credentials until production launch is approved."
        : `Razorpay ${mode} mode requires a matching ${mode}-mode Key ID.`,
    );
    error.status = 503;
    throw error;
  }

  if (!client) client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return client;
}
