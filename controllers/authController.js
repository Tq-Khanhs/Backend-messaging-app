import { createUser, getUserByPhoneNumber, verifyPassword, updateUser } from "../models/userModel.js"
import {
  createPhoneAuthSession,
  verifyPhoneNumber as verifyPhone,
  createCustomToken,
} from "../services/firebaseAuthService.js"
import jwt from "jsonwebtoken"
import dotenv from "dotenv"

dotenv.config()

// Request verification code for registration
export const requestVerificationCode = async (req, res) => {
  try {
    const { phoneNumber } = req.body

    if (!phoneNumber) {
      return res.status(400).json({ message: "Phone number is required" })
    }

    // Check if user already exists
    const existingUser = await getUserByPhoneNumber(phoneNumber)
    if (existingUser) {
      return res.status(400).json({ message: "User with this phone number already exists" })
    }

    // Create a Firebase phone auth session
    const session = await createPhoneAuthSession(phoneNumber)

    // In a real implementation, Firebase would send the SMS automatically
    // For this demo, we'll return the session info to the client
    // Note: In production, you would NOT return the verification code to the client
    res.status(200).json({
      message: "Verification code sent successfully",
      sessionInfo: session.sessionInfo,
      phoneNumber: session.phoneNumber,
      // Only for testing - remove in production:
      verificationCode: session.verificationCode,
    })
  } catch (error) {
    console.error("Error in requestVerificationCode:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Verify code and register user
export const verifyPhoneNumber = async (req, res) => {
  try {
    const { sessionInfo, code, phoneNumber } = req.body

    if (!sessionInfo || !code || !phoneNumber) {
      return res.status(400).json({ message: "Session info, verification code, and phone number are required" })
    }

    // Verify the code with Firebase
    const verification = await verifyPhone(sessionInfo, code)

    if (!verification.isValid) {
      return res.status(400).json({ message: "Invalid verification code" })
    }

    // At this point, verification is successful
    // We'll return a temporary token that can be used for the next steps of registration
    const tempToken = jwt.sign({ phoneNumber, firebaseUid: verification.firebaseUid }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    })

    res.status(200).json({
      message: "Phone number verified successfully",
      tempToken,
      firebaseUid: verification.firebaseUid,
    })
  } catch (error) {
    console.error("Error in verifyPhoneNumber:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Complete registration with user details
export const completeRegistration = async (req, res) => {
  try {
    const { phoneNumber, password, fullName, birthdate, gender, firebaseUid } = req.body

    if (!phoneNumber || !password || !firebaseUid) {
      return res.status(400).json({ message: "Phone number, password, and Firebase UID are required" })
    }

    // Create user in database
    const user = await createUser({
      phoneNumber,
      password,
      fullName,
      birthdate,
      gender,
      firebaseUid,
    })

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.userId, phoneNumber: user.phoneNumber, firebaseUid: user.firebaseUid },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    )

    // Create a Firebase custom token
    const firebaseCustomToken = await createCustomToken(firebaseUid)

    res.status(201).json({
      message: "User registered successfully",
      token,
      firebaseCustomToken,
      user: {
        userId: user.userId,
        phoneNumber: user.phoneNumber,
        fullName: user.fullName,
        birthdate: user.birthdate,
        gender: user.gender,
      },
    })
  } catch (error) {
    console.error("Error in completeRegistration:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Login with phone and password
export const login = async (req, res) => {
  try {
    const { phoneNumber, password } = req.body

    if (!phoneNumber || !password) {
      return res.status(400).json({ message: "Phone number and password are required" })
    }

    // Get user by phone number
    const user = await getUserByPhoneNumber(phoneNumber)

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    // Verify password
    const isMatch = await verifyPassword(password, user.password)

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.userId, phoneNumber: user.phoneNumber, firebaseUid: user.firebaseUid },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    )

    // Create a Firebase custom token if user has a Firebase UID
    let firebaseCustomToken = null
    if (user.firebaseUid) {
      firebaseCustomToken = await createCustomToken(user.firebaseUid)
    }

    res.status(200).json({
      message: "Login successful",
      token,
      firebaseCustomToken,
      user: {
        userId: user.userId,
        phoneNumber: user.phoneNumber,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
      },
    })
  } catch (error) {
    console.error("Error in login:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Request password reset
export const requestPasswordReset = async (req, res) => {
  try {
    const { phoneNumber } = req.body

    if (!phoneNumber) {
      return res.status(400).json({ message: "Phone number is required" })
    }

    // Check if user exists
    const user = await getUserByPhoneNumber(phoneNumber)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Create a Firebase phone auth session
    const session = await createPhoneAuthSession(phoneNumber)

    // In a real implementation, Firebase would send the SMS automatically

    res.status(200).json({
      message: "Password reset code sent successfully",
      sessionInfo: session.sessionInfo,
      phoneNumber: session.phoneNumber,
    })
  } catch (error) {
    console.error("Error in requestPasswordReset:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Verify reset code and reset password
export const resetPassword = async (req, res) => {
  try {
    const { sessionInfo, code, phoneNumber, newPassword } = req.body

    if (!sessionInfo || !code || !phoneNumber || !newPassword) {
      return res.status(400).json({
        message: "Session info, verification code, phone number, and new password are required",
      })
    }

    // Verify the code with Firebase
    const verification = await verifyPhone(sessionInfo, code)

    if (!verification.isValid) {
      return res.status(400).json({ message: "Invalid verification code" })
    }

    // Get user
    const user = await getUserByPhoneNumber(phoneNumber)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Update user's password
    await updateUser(user.userId, { password: newPassword })

    res.status(200).json({ message: "Password reset successfully" })
  } catch (error) {
    console.error("Error in resetPassword:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

