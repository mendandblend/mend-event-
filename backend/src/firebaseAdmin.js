import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getFirebaseCredential(projectId) {
  const encodedServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

  if (encodedServiceAccount && serviceAccountJson) {
    throw new Error(
      "Set only one of FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 or FIREBASE_SERVICE_ACCOUNT_JSON.",
    );
  }

  if (encodedServiceAccount || serviceAccountJson) {
    let serviceAccount;
    try {
      const json = encodedServiceAccount
        ? Buffer.from(encodedServiceAccount, "base64").toString("utf8")
        : serviceAccountJson;
      serviceAccount = JSON.parse(json);
    } catch {
      throw new Error("Firebase service-account JSON is not valid JSON.");
    }

    const credentialProjectId = serviceAccount.projectId || serviceAccount.project_id;
    const clientEmail = serviceAccount.clientEmail || serviceAccount.client_email;
    const privateKey = serviceAccount.privateKey || serviceAccount.private_key;

    if (credentialProjectId !== projectId) {
      throw new Error(
        `Firebase service-account project does not match FIREBASE_PROJECT_ID (${projectId}).`,
      );
    }
    if (!clientEmail || !privateKey) {
      throw new Error("Firebase service-account JSON is missing its email or private key.");
    }

    return cert({
      projectId: credentialProjectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    });
  }

  return applicationDefault();
}

export function getFirebaseAdminApp() {
  const existingApp = getApps().find(
    (candidate) => candidate.name === "mend-and-blend-api",
  );
  if (existingApp) return existingApp;

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) {
    const error = new Error(
      "Firebase Admin is not configured. Set FIREBASE_PROJECT_ID and provide service-account credentials or Application Default Credentials.",
    );
    error.code = "firebase-admin/not-configured";
    throw error;
  }

  return initializeApp(
    {
      credential: getFirebaseCredential(projectId),
      projectId,
    },
    "mend-and-blend-api",
  );
}

export function getDatabase() {
  return getFirestore(getFirebaseAdminApp());
}
