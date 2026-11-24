import { Router } from "express";
import { getRazorpay } from "../payments/razorpay.js";

const router = Router();

router.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Mend and Blend backend",
    time: new Date().toISOString(),
  });
});

router.get("/razorpay", async (req, res) => {
  try {
    const mode = process.env.RAZORPAY_MODE?.trim() || "test";
    const keyId = process.env.RAZORPAY_KEY_ID?.trim() || "";
    const gateway = getRazorpay();
    // Safe, read-only check: fetches order history without charging any money or creating writes
    const result = await gateway.orders.all({ count: 1 });
    res.json({
      status: "ok",
      mode,
      keyPrefix: keyId.slice(0, 9),
      razorpayAuthenticated: true,
      readOnlyCheck: "passed",
      itemsCount: result.items?.length ?? 0,
    });
  } catch (error) {
    res.status(502).json({
      status: "failed",
      error: error.message,
      description: error.error?.description || null,
      mode: process.env.RAZORPAY_MODE?.trim() || "test",
    });
  }
});

export default router;
