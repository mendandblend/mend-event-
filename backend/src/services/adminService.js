import { Timestamp } from "firebase-admin/firestore";
import { getDatabase } from "../firebaseAdmin.js";
import { isPublicEvent, serializeEvent } from "./eventService.js";

const activeBookingStatuses = ["reserved", "order_creating", "payment_pending"];

function bookingEventId(booking) {
  return booking.workshopId || booking.eventId;
}

function isActiveHold(booking, now) {
  return (
    activeBookingStatuses.includes(booking.status) &&
    booking.expiresAt instanceof Timestamp &&
    booking.expiresAt.toMillis() > now.toMillis()
  );
}

function toIso(value) {
  return value?.toDate?.().toISOString() ?? null;
}

export async function getAdminDashboard(searchTerm = "") {
  const db = getDatabase();
  const [workshopSnapshot, bookingSnapshot, paymentSnapshot, ticketSnapshot] =
    await Promise.all([
      db.collection("workshops").get(),
      db.collection("bookings").get(),
      db.collection("payments").get(),
      db.collection("tickets").get(),
    ]);

  const workshops = workshopSnapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));
  const bookings = bookingSnapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));
  const paymentsByBooking = new Map(
    paymentSnapshot.docs.map((document) => {
      const payment = document.data();
      return [payment.bookingId, { id: document.id, ...payment }];
    }),
  );
  const ticketsByBooking = new Map(
    ticketSnapshot.docs.map((document) => {
      const ticket = document.data();
      return [ticket.bookingId, { id: document.id, ...ticket }];
    }),
  );

  const now = Timestamp.now();
  const bookingsByWorkshop = new Map();
  const bookingsById = new Map(bookings.map((booking) => [booking.id, booking]));
  const revenueByWorkshop = new Map();
  for (const paymentDocument of paymentSnapshot.docs) {
    const payment = paymentDocument.data();
    const booking = bookingsById.get(payment.bookingId);
    if (payment.status === "captured" && booking) {
      const eventId = bookingEventId(booking);
      revenueByWorkshop.set(
        eventId,
        (revenueByWorkshop.get(eventId) || 0) +
          (payment.amountInSubunits || 0) / 100,
      );
    }
  }
  for (const booking of bookings) {
    const eventId = bookingEventId(booking);
    const workshopBookings = bookingsByWorkshop.get(eventId) || [];
    workshopBookings.push(booking);
    bookingsByWorkshop.set(eventId, workshopBookings);
  }

  const workshopSummaries = workshops
    .map((workshop) => {
      const workshopBookings = bookingsByWorkshop.get(workshop.id) || [];
      const registrations = workshopBookings
        .filter((booking) => booking.status === "confirmed")
        .reduce((sum, b) => sum + (Number(b.seats) || 1), 0);
      const bookedSeats = workshopBookings
        .filter((booking) => booking.status === "confirmed" || isActiveHold(booking, now))
        .reduce((sum, b) => sum + (Number(b.seats) || 1), 0);

      const availableSeats = Math.max(0, workshop.capacity - bookedSeats);
      return {
        ...serializeEvent(workshop, now.toMillis(), availableSeats),
        id: workshop.id,
        registrationCount: registrations,
        bookedSeats,
        availableSeats,
        revenue: revenueByWorkshop.get(workshop.id) || 0,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  const registrations = bookings
    .map((booking) => {
      const payment = paymentsByBooking.get(booking.id);
      const ticket = ticketsByBooking.get(booking.id);
      const isRegistered = booking.status === "confirmed" && payment?.status === "captured";
      const isScanned = ticket?.status === "redeemed" || Boolean(booking.checkedIn);
      return {
        bookingId: booking.id,
        customerId: booking.customerId,
        customerName: booking.participant?.fullName || "",
        email: booking.participant?.email || "",
        phone: booking.participant?.phone || "",
        workshopId: bookingEventId(booking),
        workshopName: booking.workshopName || "",
        sessionDate: booking.sessionDate || "",
        start: booking.start || "",
        end: booking.end || "",
        seats: Number(booking.seats) || Number(ticket?.seats) || 1,
        amount: booking.amount,
        bookingStatus: booking.status,
        paymentStatus: payment?.status || "not_started",
        ticketStatus: ticket?.status || "none",
        isRegistered,
        registrationStatus: isRegistered ? "registered" : "not_registered",
        isScanned,
        scannedStatus: isScanned ? "already_scanned" : "not_scanned",
        scannedAt: toIso(ticket?.redeemedAt || booking.scannedAt),
        createdAt: toIso(booking.createdAt),
      };
    })
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const filteredRegistrations = normalizedSearch
    ? registrations.filter((registration) =>
        [
          registration.customerName,
          registration.email,
          registration.bookingId,
          registration.phone,
          registration.workshopName,
          registration.sessionDate,
          registration.bookingStatus,
          registration.paymentStatus,
          registration.ticketStatus,
          registration.isRegistered ? "registered" : "not registered",
          registration.isScanned ? "already scanned" : "not scanned",
        ].some((value) => value.toLocaleLowerCase().includes(normalizedSearch)),
      )
    : registrations;

  const capturedPayments = paymentSnapshot.docs
    .map((document) => document.data())
    .filter((payment) => payment.status === "captured");

  return {
    summary: {
      totalRegistrations: bookings.filter((booking) => booking.status === "confirmed").length,
      successfulPayments: capturedPayments.length,
      totalRevenue: capturedPayments.reduce(
        (total, payment) => total + (payment.amountInSubunits || 0),
        0,
      ) / 100,
      availableSeats: workshopSummaries.reduce(
        (total, workshop) => total + workshop.availableSeats,
        0,
      ),
      bookedSeats: workshopSummaries.reduce(
        (total, workshop) => total + workshop.bookedSeats,
        0,
      ),
      activeEvents: workshopSummaries.filter(isPublicEvent).length,
      unpublishedEvents: workshopSummaries.filter(
        (workshop) => !isPublicEvent(workshop) && workshop.status !== "completed",
      ).length,
    },
    events: workshopSummaries,
    registrations: filteredRegistrations,
  };
}

export async function redeemTicket(qrToken, adminUid) {
  const db = getDatabase();
  const tickets = db.collection("tickets");
  return db.runTransaction(async (transaction) => {
    const ticketQuery = tickets.where("qrToken", "==", qrToken).limit(1);
    const ticketSnapshot = await transaction.get(ticketQuery);
    if (ticketSnapshot.empty) {
      return { status: "invalid", message: "This ticket is invalid or could not be found." };
    }

    const ticketDocument = ticketSnapshot.docs[0];
    const ticketRef = ticketDocument.ref;
    const ticket = ticketDocument.data();
    const bookingRef = db.collection("bookings").doc(ticket.bookingId);
    const bookingSnapshot = await transaction.get(bookingRef);
    if (!bookingSnapshot.exists) {
      return { status: "invalid", message: "This ticket has no valid booking." };
    }

    const booking = bookingSnapshot.data();
    const paymentRef = booking.razorpayOrderId
      ? db.collection("payments").doc(booking.razorpayOrderId)
      : null;
    const paymentSnapshot = paymentRef
      ? await transaction.get(paymentRef)
      : null;

    if (
      ticket.status === "redeemed" ||
      ticket.isValid === false ||
      ticket.redeemedAt
    ) {
      return {
        status: "already_used",
        message: "This ticket has already been scanned.",
        workshopName: ticket.workshopName || booking.workshopName || "",
        customerName: ticket.customerName || booking.participant?.fullName || "",
        sessionDate: ticket.sessionDate || booking.sessionDate || "",
        start: ticket.start || booking.start || "",
        end: ticket.end || booking.end || "",
        seats: Number(ticket.seats) || Number(booking.seats) || 1,
        redeemedAt: ticket.redeemedAt?.toDate ? ticket.redeemedAt.toDate().toISOString() : null,
      };
    }

    const valid =
      ticket.status === "valid" &&
      ticket.isValid === true &&
      ticket.customerId === booking.customerId &&
      ticket.bookingId === bookingSnapshot.id &&
      ticket.workshopId === bookingEventId(booking) &&
      booking.status === "confirmed" &&
      Boolean(paymentSnapshot?.exists) &&
      paymentSnapshot.data().status === "captured" &&
      paymentSnapshot.data().bookingId === bookingSnapshot.id &&
      paymentSnapshot.data().customerId === booking.customerId &&
      paymentSnapshot.data().razorpayOrderId === booking.razorpayOrderId;
    if (!valid) {
      return { status: "invalid", message: "This ticket is invalid or not paid." };
    }

    const redeemedAt = Timestamp.now();
    transaction.update(ticketRef, {
      status: "redeemed",
      isValid: false,
      redeemedAt,
      redeemedBy: adminUid,
    });
    transaction.update(bookingRef, {
      checkedIn: true,
      scannedAt: redeemedAt,
      scannedBy: adminUid,
    });

    return {
      status: "valid",
      message: "Ticket is valid and has been redeemed.",
      workshopName: ticket.workshopName || booking.workshopName,
      sessionDate: ticket.sessionDate || booking.sessionDate,
      start: ticket.start || booking.start,
      end: ticket.end || booking.end,
      customerName: ticket.customerName || booking.participant?.fullName,
      seats: Number(ticket.seats) || Number(booking.seats) || 1,
      redeemedAt: redeemedAt.toDate().toISOString(),
    };
  });
}

export async function resetTestDataAndCleanup() {
  const db = getDatabase();

  const collectionsToClear = [
    "bookings",
    "bookingLimits",
    "payments",
    "tickets",
    "bookingRequests",
    "policyAcceptances",
    "razorpayWebhookEvents",
  ];

  const deletedCollections = {};
  let totalDeleted = 0;

  for (const collectionName of collectionsToClear) {
    const snapshot = await db.collection(collectionName).get();
    let count = 0;
    const batch = db.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
      count++;
    }
    if (count > 0) {
      await batch.commit();
    }
    deletedCollections[collectionName] = count;
    totalDeleted += count;
  }

  const workshopsSnapshot = await db.collection("workshops").get();
  const deletedEvents = [];
  const resetEvents = [];

  for (const doc of workshopsSnapshot.docs) {
    const data = doc.data();
    const isNominalOrCopy =
      (data.price != null && Number(data.price) <= 1) ||
      (typeof data.title === "string" && (data.title.includes("(copy)") || data.title.toLowerCase().includes("test"))) ||
      data.status === "draft" ||
      data.published !== true;

    if (isNominalOrCopy) {
      await doc.ref.delete();
      deletedEvents.push({ id: doc.id, title: data.title, price: data.price, status: data.status });
    } else {
      const capacity = Number(data.capacity) || 12;
      await doc.ref.update({
        reservationVersion: 0,
        bookedSeats: 0,
        availableSeats: capacity,
        salesPaused: false,
        published: true,
        status: "published",
        registrationClosedManually: false,
      });
      resetEvents.push({ id: doc.id, title: data.title, availableSeats: capacity });
    }
  }

  return {
    success: true,
    totalDeleted,
    deletedCollections,
    deletedEvents,
    resetEventsCount: resetEvents.length,
    resetEvents,
    message: `Reset complete. Deleted ${totalDeleted} test documents, removed ${deletedEvents.length} test/unpublished event(s), and reset seats on ${resetEvents.length} event(s). Ready for live execution.`,
  };
}
