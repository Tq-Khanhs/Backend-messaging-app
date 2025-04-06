import express from "express"
import multer from "multer"
import {
  getUserProfile,
  updateUserProfile,
  uploadUserAvatar,
  getAvatarUploadUrl,
  confirmAvatarUpload,
} from "../controllers/userController.js"
import { authenticate } from "../middleware/authMiddleware.js"
import { validateRequest } from "../middleware/validationMiddleware.js"

const router = express.Router()

// Configure multer for memory storage
const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
})

// Get user profile
router.get("/profile", authenticate, getUserProfile)

// Update user profile
router.put("/profile", authenticate, validateRequest(["fullName"]), updateUserProfile)

// Upload avatar (direct upload)
router.post("/avatar", authenticate, upload.single("avatar"), uploadUserAvatar)

// Get presigned URL for client-side upload
router.post("/avatar-upload-url", authenticate, validateRequest(["fileType"]), getAvatarUploadUrl)

// Confirm avatar upload and update user profile
router.post("/confirm-avatar", authenticate, validateRequest(["key"]), confirmAvatarUpload)

export default router

