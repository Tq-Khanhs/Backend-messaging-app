import express from "express"
import multer from "multer"
import { uploadImageAndGetUrl, getImageUploadUrl } from "../controllers/imageController.js"
import { authenticate } from "../middleware/authMiddleware.js"
import { validateRequest } from "../middleware/validationMiddleware.js"

const router = express.Router()

// Configure multer for memory storage
const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
})

// Route for direct image upload (server-side)
router.post("/upload", upload.single("image"), uploadImageAndGetUrl)

// Route for getting a presigned URL for client-side upload
router.post("/upload-url", validateRequest(["fileType"]), getImageUploadUrl)

// Authenticated routes - require login
router.post("/secure/upload", authenticate, upload.single("image"), uploadImageAndGetUrl)

router.post("/secure/upload-url", authenticate, validateRequest(["fileType"]), getImageUploadUrl)

export default router
