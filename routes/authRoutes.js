import express from "express"
import {
  requestVerificationCode,
  verifyPhoneNumber,
  completeRegistration,
  login,
  requestPasswordReset,
  resetPassword,
} from "../controllers/authController.js"
import { validateRequest } from "../middleware/validationMiddleware.js"

const router = express.Router()

// Request verification code for registration
router.post("/request-verification", validateRequest(["phoneNumber"]), requestVerificationCode)

// Verify phone number with code
router.post("/verify-phone", validateRequest(["sessionInfo", "code", "phoneNumber"]), verifyPhoneNumber)

// Complete registration with user details
router.post("/register", validateRequest(["phoneNumber", "password", "firebaseUid"]), completeRegistration)

// Login with phone and password
router.post("/login", validateRequest(["phoneNumber", "password"]), login)

// Request password reset
router.post("/request-password-reset", validateRequest(["phoneNumber"]), requestPasswordReset)

// Reset password with verification code
router.post("/reset-password", validateRequest(["sessionInfo", "code", "phoneNumber", "newPassword"]), resetPassword)

export default router

