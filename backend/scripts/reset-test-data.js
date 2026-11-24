import "../src/loadEnv.js";
import { getDatabase } from "../src/firebaseAdmin.js";

async function resetTestData() {
  const db = getDatabase();
  console.log("Starting test data reset on Firestore project:", process.env.FIREBASE_PROJECT_ID);

  const collectionsToClear = [
    "bookings",
    "bookingLimits",
    "payments",
    "tickets",
    "bookingRequests",
    "policyAcceptances",
    "razorpayWebhookEvents",
  ];

  let totalDeleted = 0;

  for (const collectionName of collectionsToClear) {
    const snapshot = await db.collection(collectionName).get();
    if (snapshot.empty) {
      console.log(`- ${collectionName}: 0 documents (already clean)`);
      continue;
    }

    const batch = db.batch();
    for (const doc of snapshot.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    totalDeleted += snapshot.size;
    console.log(`✓ ${collectionName}: deleted ${snapshot.size} test document(s)`);
  }

  // Reset reservationVersion on all workshops
  const workshopsSnapshot = await db.collection("workshops").get();
  const workshopBatch = db.batch();
  for (const doc of workshopsSnapshot.docs) {
    workshopBatch.update(doc.ref, {
      reservationVersion: 0,
    });
  }
  await workshopBatch.commit();
  console.log(`✓ workshops: reset reservation counters on ${workshopsSnapshot.size} workshop(s)`);

  console.log(`\nAll done! Successfully deleted ${totalDeleted} test documents and reset all booking limits.`);
}

resetTestData().catch((err) => {
  console.error("Error resetting test data:", err);
  process.exit(1);
});
