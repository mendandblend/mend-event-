import "../src/loadEnv.js";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "../src/firebaseAdmin.js";

const identifier = process.argv[2]?.trim();
const role = process.argv[3]?.trim() || "super_admin";

if (!identifier) {
  console.error("Usage: node scripts/set-admin-claim.js <email-or-uid> [super_admin|event_admin]");
  process.exitCode = 1;
} else {
  try {
    const auth = getAuth(getFirebaseAdminApp());
    let user;
    try {
      user = identifier.includes("@")
        ? await auth.getUserByEmail(identifier)
        : await auth.getUser(identifier);
    } catch (error) {
      if (error.code === "auth/user-not-found" && identifier.includes("@")) {
        console.log(`User ${identifier} not found in Firebase. Creating pre-registered account...`);
        user = await auth.createUser({
          email: identifier,
          emailVerified: true,
        });
      } else {
        throw error;
      }
    }

    await auth.setCustomUserClaims(user.uid, {
      ...user.customClaims,
      admin: true,
      adminRole: role,
    });
    console.log(`✓ Granted ${role} access to ${user.email || user.uid} (UID: ${user.uid}).`);
    console.log("The user must sign out and sign in again (or refresh their ID token) to activate admin access.");
  } catch (error) {
    console.error("Could not grant administrator access:", error.message);
    process.exitCode = 1;
  }
}
