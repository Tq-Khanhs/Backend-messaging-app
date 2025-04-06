import { auth } from "../config/firebaseConfig.js"
import dotenv from "dotenv"

dotenv.config()

// Create a new phone authentication session
export const createPhoneAuthSession = async (phoneNumber) => {
  try {
    // Format phone number to E.164 format if needed
    const formattedPhoneNumber = formatPhoneNumber(phoneNumber)

    // In a real Firebase implementation, you would use the Firebase Admin SDK
    // to create a verification session. For this implementation, we'll simulate
    // the process by generating a random 6-digit code and storing it.

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()

    // In a production environment, you would use Firebase Phone Auth directly
    // or send this code via a different service
    console.log(`Verification code for ${formattedPhoneNumber}: ${verificationCode}`)

    // Store the verification code (in a real app, Firebase would handle this)
    // For demo purposes, we'll return the code - in production, you would NOT do this
    return {
      sessionInfo: `firebase_session_${Date.now()}`,
      phoneNumber: formattedPhoneNumber,
      verificationCode, // Only for testing - remove in production
    }
  } catch (error) {
    console.error("Error creating phone auth session:", error)
    throw error
  }
}

// Verify phone number with code
export const verifyPhoneNumber = async (sessionInfo, code) => {
  try {
    // In a real implementation with Firebase, you would verify the code
    // using the Firebase Auth API. For this demo, we'll simulate verification.

    // For demonstration purposes, we'll accept any 6-digit code
    // In production, you would validate against the actual code sent by Firebase
    if (code.length === 6 && /^\d+$/.test(code)) {
      // Generate a Firebase UID for the new user
      const firebaseUid = `firebase_${Date.now()}`

      return {
        isValid: true,
        firebaseUid,
      }
    }

    return {
      isValid: false,
      error: "Invalid verification code",
    }
  } catch (error) {
    console.error("Error verifying phone number:", error)
    return {
      isValid: false,
      error: error.message,
    }
  }
}

// Create a custom token for Firebase Authentication
export const createCustomToken = async (uid) => {
  try {
    const customToken = await auth.createCustomToken(uid)
    return customToken
  } catch (error) {
    console.error("Error creating custom token:", error)
    throw error
  }
}

// Verify Firebase ID token
export const verifyIdToken = async (idToken) => {
  try {
    const decodedToken = await auth.verifyIdToken(idToken)
    return decodedToken
  } catch (error) {
    console.error("Error verifying ID token:", error)
    throw error
  }
}

// Helper function to format phone number to E.164 format
const formatPhoneNumber = (phoneNumber) => {
  // Remove any non-digit characters
  let cleaned = phoneNumber.replace(/\D/g, "")

  // If the number doesn't start with '+', add the country code
  if (!phoneNumber.startsWith("+")) {
    // Default to Vietnam (+84) if no country code
    if (cleaned.startsWith("0")) {
      cleaned = "84" + cleaned.substring(1)
    }
    cleaned = "+" + cleaned
  }

  return cleaned
}

