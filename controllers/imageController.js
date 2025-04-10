import { uploadImage, generatePresignedUploadUrl } from "../services/supabaseStorageService.js"

// Upload image and return URL
export const uploadImageAndGetUrl = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" })
    }

    // Optional folder parameter from request
    const folder = req.body.folder || "images"

    // Upload image to Supabase
    const result = await uploadImage(req.file.buffer, req.file.mimetype, folder)

    res.status(200).json({
      message: "Image uploaded successfully",
      key: result.key,
      imageUrl: result.url,
    })
  } catch (error) {
    console.error("Error in uploadImageAndGetUrl:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Generate presigned URL for client-side image upload
export const getImageUploadUrl = async (req, res) => {
  try {
    const { fileType, folder } = req.body

    if (!fileType) {
      return res.status(400).json({ message: "File type is required" })
    }

    // Use the existing function from supabaseStorageService
    const { url, key, headers } = await generatePresignedUploadUrl(req.user ? req.user.userId : "anonymous", fileType)

    res.status(200).json({
      uploadUrl: url,
      key,
      headers,
      message: "Upload URL generated successfully",
    })
  } catch (error) {
    console.error("Error in getImageUploadUrl:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
