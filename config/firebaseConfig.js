import { initializeApp, cert } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import dotenv from "dotenv"

dotenv.config()

const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
}

// Add this function to check Firebase credentials on startup
const validateFirebaseCredentials = () => {
  const requiredEnvVars = [
    "FIREBASE_TYPE",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_PRIVATE_KEY_ID",
    "FIREBASE_PRIVATE_KEY",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_CLIENT_ID",
  ]

  const missingVars = requiredEnvVars.filter((varName) => !process.env[varName])

  if (missingVars.length > 0) {
    console.warn(`⚠️ Missing Firebase environment variables: ${missingVars.join(", ")}`)
    console.warn("Firebase functionality may be limited.")
    return false
  }

  // Check if private key is properly formatted
  if (process.env.FIREBASE_PRIVATE_KEY && !process.env.FIREBASE_PRIVATE_KEY.includes("-----BEGIN PRIVATE KEY-----")) {
    console.warn(
      "⚠️ FIREBASE_PRIVATE_KEY may not be properly formatted. Make sure it includes the BEGIN/END markers and newlines.",
    )
  }

  return true
}

// Call the validation function
const hasValidCredentials = validateFirebaseCredentials()

// Initialize Firebase only if credentials are valid
let app, auth, db

try {
  if (hasValidCredentials) {
    app = initializeApp({
      credential: cert(serviceAccount),
    })

    auth = getAuth(app)
    db = getFirestore(app)

    console.log("✅ Firebase initialized successfully")
  } else {
    console.log("⚠️ Firebase initialization skipped due to missing credentials")
    // Create mock objects for auth and db
    auth = {
      createCustomToken: () => Promise.resolve("mock-token"),
      verifyIdToken: () => Promise.resolve({ uid: "mock-uid" }),
    }
    db = {
      collection: () => ({
        doc: () => ({
          set: () => Promise.resolve(),
          get: () => Promise.resolve({ exists: false, data: () => null }),
          update: () => Promise.resolve(),
        }),
        where: () => ({
          limit: () => ({
            get: () => Promise.resolve({ empty: true, docs: [] }),
          }),
        }),
      }),
    }
  }
} catch (error) {
  console.error("❌ Firebase initialization error:", error)
  // Create mock objects as above
  auth = {
    createCustomToken: () => Promise.resolve("mock-token"),
    verifyIdToken: () => Promise.resolve({ uid: "mock-uid" }),
  }
  db = {
    collection: () => ({
      doc: () => ({
        set: () => Promise.resolve(),
        get: () => Promise.resolve({ exists: false, data: () => null }),
        update: () => Promise.resolve(),
      }),
      where: () => ({
        limit: () => ({
          get: () => Promise.resolve({ empty: true, docs: [] }),
        }),
      }),
    }),
  }
}

export { auth, db }
export const USERS_COLLECTION = "users"
export const VERIFICATION_CODES_COLLECTION = "verification_codes"

export default app
