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

router.post("/request-verification", validateRequest(["phoneNumber"]), requestVerificationCode)

router.post("/verify-phone", validateRequest(["sessionInfo", "code", "phoneNumber"]), verifyPhoneNumber)

router.post("/register", validateRequest(["phoneNumber", "password", "firebaseUid"]), completeRegistration)

router.post("/login", validateRequest(["phoneNumber", "password"]), login)

router.post("/request-password-reset-code", validateRequest(["phoneNumber"]), requestPasswordResetCode)
router.post("/verify-reset-code", validateRequest(["sessionInfo", "code", "phoneNumber"]), verifyPasswordResetCode)
router.post("/complete-password-reset", validateRequest(["resetToken", "newPassword"]), completePasswordReset)



export default router
