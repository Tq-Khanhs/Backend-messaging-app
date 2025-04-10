import express from "express"
import {
  requestVerificationCode,
  verifyPhoneNumber,
  completeRegistration,
  login,
  requestPasswordResetCode,
  verifyPasswordResetCode,
  completePasswordReset,
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

// Password reset - new two-step flow
router.post("/request-password-reset-code", validateRequest(["phoneNumber"]), requestPasswordResetCode)
router.post("/verify-reset-code", validateRequest(["sessionInfo", "code", "phoneNumber"]), verifyPasswordResetCode)
router.post("/complete-password-reset", validateRequest(["resetToken", "newPassword"]), completePasswordReset)

// Legacy password reset endpoint - can be removed after updating clients
router.post("/reset-password", validateRequest(["sessionInfo", "code", "phoneNumber", "newPassword"]), resetPassword)

export default router
