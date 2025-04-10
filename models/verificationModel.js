import mongoose from "mongoose"
import { VERIFICATION_CODES_COLLECTION } from "../config/mongodbConfig.js"

// Define the verification code schema
const verificationCodeSchema = new mongoose.Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
    },
    code: {
      type: String,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: {
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
  },
)

// Create the VerificationCode model
const VerificationCode = mongoose.model(VERIFICATION_CODES_COLLECTION, verificationCodeSchema)

// Create a verification code
export const createVerificationCode = async (phoneNumber) => {
  try {
    // Generate a random 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes expiry

    // Create or update the verification code
    const verificationCode = await VerificationCode.findOneAndUpdate(
      { phoneNumber },
      {
        code,
        attempts: 0,
        expiresAt,
      },
      { upsert: true, new: true },
    )

    return code
  } catch (error) {
    console.error("Error creating verification code:", error)
    throw error
  }
}

// Get verification code
export const getVerificationCode = async (phoneNumber) => {
  try {
    const verificationCode = await VerificationCode.findOne({ phoneNumber }).lean()
    return verificationCode
  } catch (error) {
    console.error("Error getting verification code:", error)
    throw error
  }
}

// Verify code
export const verifyCode = async (phoneNumber, code) => {
  try {
    const verificationData = await getVerificationCode(phoneNumber)

    if (!verificationData) {
      return { valid: false, message: "Verification code not found" }
    }

    // Check if code is expired
    if (new Date(verificationData.expiresAt) < new Date()) {
      await deleteVerificationCode(phoneNumber)
      return { valid: false, message: "Verification code has expired" }
    }

    // Update attempts
    const attempts = verificationData.attempts + 1

    // Check if too many attempts
    if (attempts > 3) {
      await deleteVerificationCode(phoneNumber)
      return { valid: false, message: "Too many attempts. Please request a new code" }
    }

    // Update attempts in database
    await updateVerificationAttempts(phoneNumber, attempts)

    // Check if code matches
    if (verificationData.code !== code) {
      return { valid: false, message: "Invalid verification code" }
    }

    // Code is valid, delete it from database
    await deleteVerificationCode(phoneNumber)

    return { valid: true, message: "Verification successful" }
  } catch (error) {
    console.error("Error verifying code:", error)
    throw error
  }
}

// Update verification attempts
export const updateVerificationAttempts = async (phoneNumber, attempts) => {
  try {
    await VerificationCode.updateOne({ phoneNumber }, { $set: { attempts } })
  } catch (error) {
    console.error("Error updating verification attempts:", error)
    throw error
  }
}

// Delete verification code
export const deleteVerificationCode = async (phoneNumber) => {
  try {
    await VerificationCode.deleteOne({ phoneNumber })
  } catch (error) {
    console.error("Error deleting verification code:", error)
    throw error
  }
}

export default VerificationCode
