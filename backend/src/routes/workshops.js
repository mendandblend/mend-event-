import { Router } from "express";
import {
  getPublishedWorkshops,
  getWorkshopAvailability,
} from "../services/bookingService.js";

const router = Router();

// Reuse the public list briefly so traffic spikes do not repeat every query.
const CACHE_MS = 20_000;
let cached = null;

function getCachedWorkshops() {
  if (!cached || cached.expiresAt <= Date.now()) {
    const entry = { expiresAt: Date.now() + CACHE_MS };
    entry.result = getPublishedWorkshops().catch((error) => {
      if (cached === entry) cached = null;
      throw error;
    });
    cached = entry;
  }
  return cached.result;
}

router.get("/", async (req, res) => {
  res.json(await getCachedWorkshops());
});

router.get("/:workshopId/availability", async (req, res) => {
  res.json(await getWorkshopAvailability(req.params.workshopId));
});

export default router;
