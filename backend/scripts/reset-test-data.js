import "../src/loadEnv.js";
import { resetTestDataAndCleanup } from "../src/services/adminService.js";

async function main() {
  console.log("Starting test data reset and system preparation on Firestore project:", process.env.FIREBASE_PROJECT_ID);
  const result = await resetTestDataAndCleanup();
  console.log(`\n✓ ${result.message}`);
  console.log("Deleted collections:", result.deletedCollections);
  if (result.deletedEvents?.length > 0) {
    console.log("Deleted test events:", result.deletedEvents);
  }
  console.log(`Reset ${result.resetEventsCount} live workshops with full available seats.`);
}

main().catch((err) => {
  console.error("Error resetting test data:", err);
  process.exit(1);
});
