import mongoose from "mongoose"
import { VERIFICATION_CODES_COLLECTION } from "../config/mongodbConfig.js"

const verificationCodeSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
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

const VerificationCode = mongoose.model(VERIFICATION_CODES_COLLECTION, verificationCodeSchema)

export const createVerificationCode = async (email) => {
  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes expiration

    await VerificationCode.findOneAndUpdate(
      { email: email.toLowerCase() },
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

export const getVerificationCode = async (email) => {
  try {
    const verificationCode = await VerificationCode.findOne({ email: email.toLowerCase() }).lean()
    return verificationCode
  } catch (error) {
    console.error("Error getting verification code:", error)
    throw error
  }
}

export const verifyCode = async (email, code) => {
  try {
    const verificationData = await getVerificationCode(email.toLowerCase())

    if (!verificationData) {
      return { valid: false, message: "Verification code not found" }
    }

    if (new Date(verificationData.expiresAt) < new Date()) {
      await deleteVerificationCode(email)
      return { valid: false, message: "Verification code has expired" }
    }

    const attempts = verificationData.attempts + 1

    if (attempts > 3) {
      await deleteVerificationCode(email)
      return { valid: false, message: "Too many attempts. Please request a new code" }
    }

    await updateVerificationAttempts(email, attempts)

    if (verificationData.code !== code) {
      return { valid: false, message: "Invalid verification code" }
    }

    await deleteVerificationCode(email)

    return { valid: true, message: "Verification successful" }
  } catch (error) {
    console.error("Error verifying code:", error)
    throw error
  }
}

export const updateVerificationAttempts = async (email, attempts) => {
  try {
    await VerificationCode.updateOne({ email: email.toLowerCase() }, { $set: { attempts } })
  } catch (error) {
    console.error("Error updating verification attempts:", error)
    throw error
  }
}

export const deleteVerificationCode = async (email) => {
  try {
    await VerificationCode.deleteOne({ email: email.toLowerCase() })
  } catch (error) {
    console.error("Error deleting verification code:", error)
    throw error
  }
}

export default VerificationCode
