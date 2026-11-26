import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireFirebaseUser } from "../auth/firebaseAuth.js";
import {
  BookingError,
  createReservation,
  listCustomerBookings,
} from "../services/bookingService.js";
import {
  createBookingRequest,
  listCustomerRequests,
} from "../services/bookingRequestService.js";
import { validatePolicyAcceptance } from "../policy/policyAcceptance.js";

function validateParticipant(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BookingError(400, "Participant details are required.");
  }

  const fullName = typeof value.fullName === "string" ? value.fullName.trim() : "";
  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  const phone = typeof value.phone === "string" ? value.phone.trim() : "";

  if (fullName.length < 2 || fullName.length > 100) {
    throw new BookingError(400, "Enter a name between 2 and 100 characters.");
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BookingError(400, "Enter a valid email address.");
  }
  if (phone.length < 7 || phone.length > 25 || !/^[+()\d\s-]+$/.test(phone)) {
    throw new BookingError(400, "Enter a valid phone number.");
  }

  return { fullName, email, phone };
}

// Dependencies are injectable so the HTTP behaviour can be tested without Firebase.
export function createBookingsRouter({
  auth = requireFirebaseUser,
  services = {
    createReservation,
    listCustomerBookings,
    createBookingRequest,
    listCustomerRequests,
  },
} = {}) {
  const router = Router();

  // Per signed-in user: at most 5 reservation attempts every 30 minutes.
  const reservationLimiter = rateLimit({
    windowMs: 30 * 60 * 1000,
    limit: 5,
    keyGenerator: (req) => req.firebaseUser?.uid || req.ip,
    validate: { keyGeneratorIpFallback: false },
    message: { error: "Too many reservation attempts. Please try again later." },
  });

  router.get("/mine", auth, async (req, res) => {
    res.json({ bookings: await services.listCustomerBookings(req.firebaseUser.uid) });
  });

  router.post("/reservations", auth, reservationLimiter, async (req, res) => {
    const eventId = req.body?.eventId ?? req.body?.workshopId;
    if (
      typeof eventId !== "string" ||
      eventId.length > 120 ||
      !/^[a-zA-Z0-9_-]+$/.test(eventId)
    ) {
      throw new BookingError(400, "A valid event is required.");
    }
    // Policy acceptance is checked on the server before anything is reserved.
    const policyAcceptance = validatePolicyAcceptance({
      policyAccepted: req.body?.policyAccepted,
      policyVersion: req.body?.policyVersion,
    });

    const rawSeats = req.body?.seats;
    const seats =
      rawSeats !== undefined && rawSeats !== null ? Number(rawSeats) : 1;
    if (!Number.isInteger(seats) || seats < 1 || seats > 10) {
      throw new BookingError(400, "Please select between 1 and 10 seats.");
    }

    const reservation = await services.createReservation({
      uid: req.firebaseUser.uid,
      workshopId: eventId,
      participant: validateParticipant(req.body.participant),
      seats,
      policyAcceptance,
    });
    res.status(201).json(reservation);
  });

  router.get("/requests", auth, async (req, res) => {
    res.json({ requests: await services.listCustomerRequests(req.firebaseUser.uid) });
  });

  router.post("/requests", auth, async (req, res) => {
    const request = await services.createBookingRequest({
      uid: req.firebaseUser.uid,
      bookingId: req.body?.bookingId,
      type: req.body?.type,
      reason: req.body?.reason,
      preferredWorkshopId: req.body?.preferredWorkshopId,
    });
    res.status(201).json({ request });
  });

  return router;
}

export default createBookingsRouter();
