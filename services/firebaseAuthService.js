import { auth } from "../config/firebaseConfig.js"
import dotenv from "dotenv"

dotenv.config()


export const verifyPhoneNumber = async (sessionInfo, code) => {
  try {
    if (!sessionInfo || !sessionInfo.startsWith('firebase_session_')) {
      return {
        isValid: false,
        error: "Invalid session information"
      };
    }

    const verificationData = await getVerificationDataFromSession(sessionInfo);

    if (!verificationData) {
      return {
        isValid: false,
        error: "Session expired or not found"
      };
    }

    if (verificationData.code !== code) {
      verificationData.attempts += 1;
      if (verificationData.attempts >= 3) {
        await removeVerificationSession(sessionInfo);
        return {
          isValid: false,
          error: "Too many failed attempts. Please request a new code."
        };
      }
      await updateVerificationAttempts(sessionInfo, verificationData.attempts);

      return {
        isValid: false,
        error: "Invalid verification code"
      };
    }

    const now = Date.now();
    if (now > verificationData.expiresAt) {
      await removeVerificationSession(sessionInfo);
      return {
        isValid: false,
        error: "Verification code has expired"
      };
    }
    await removeVerificationSession(sessionInfo);
    const firebaseUid = `firebase_${Date.now()}`;

    return {
      isValid: true,
      firebaseUid,
      phoneNumber: verificationData.phoneNumber
    };
  } catch (error) {
    console.error("Error verifying phone number:", error);
    return {
      isValid: false,
      error: error.message
    };
  }
};


const verificationSessions = new Map();

async function getVerificationDataFromSession(sessionInfo) {
  return verificationSessions.get(sessionInfo);
}

async function updateVerificationAttempts(sessionInfo, attempts) {
  const data = verificationSessions.get(sessionInfo);
  if (data) {
    data.attempts = attempts;
    verificationSessions.set(sessionInfo, data);
  }
}

async function removeVerificationSession(sessionInfo) {
  verificationSessions.delete(sessionInfo);
}


export const createPhoneAuthSession = async (phoneNumber) => {
  try {
    const formattedPhoneNumber = formatPhoneNumber(phoneNumber);
    const e164PhoneNumber = formattedPhoneNumber.startsWith("+")
      ? formattedPhoneNumber
      : "+" + formattedPhoneNumber;

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const sessionInfo = `firebase_session_${Date.now()}`;

    console.log(`Verification code for ${e164PhoneNumber}: ${verificationCode}`);
    return {
      sessionInfo,
      phoneNumber: e164PhoneNumber,
      verificationCode
    };
  } catch (error) {
    console.error("Error creating phone auth session:", error);
    throw error;
  }
};

export const createCustomToken = async (uid) => {
  try {
    const customToken = await auth.createCustomToken(uid)
    return customToken
  } catch (error) {
    console.error("Error creating custom token:", error)
    throw error
  }
}


export const verifyIdToken = async (idToken) => {
  try {
    const decodedToken = await auth.verifyIdToken(idToken)
    return decodedToken
  } catch (error) {
    console.error("Error verifying ID token:", error)
    throw error
  }
}


const formatPhoneNumber = (phoneNumber) => {
  if (phoneNumber.startsWith("+")) {
    return "+" + phoneNumber.replace(/\D/g, "");
  }

  let cleaned = phoneNumber.replace(/\D/g, "");

  if (cleaned.startsWith("0")) {
    cleaned = "84" + cleaned.substring(1);
  }

  return "+" + cleaned;
};

