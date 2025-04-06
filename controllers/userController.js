import { getUserById, updateUser } from "../models/userModel.js"
import { uploadAvatar, getAvatarUrl, deleteAvatar, generatePresignedUploadUrl } from "../services/s3Service.js"

// Get user profile
export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId

    const user = await getUserById(userId)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Generate signed URL for avatar if exists
    let avatarUrl = null
    if (user.avatarUrl) {
      avatarUrl = await getAvatarUrl(user.avatarUrl)
    }

    res.status(200).json({
      userId: user.userId,
      phoneNumber: user.phoneNumber,
      fullName: user.fullName,
      birthdate: user.birthdate,
      gender: user.gender,
      avatarUrl,
    })
  } catch (error) {
    console.error("Error in getUserProfile:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Update user profile
export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId
    const { fullName, birthdate, gender } = req.body

    // Update user in database
    const updatedUser = await updateUser(userId, {
      fullName,
      birthdate,
      gender,
    })

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" })
    }

    // Generate signed URL for avatar if exists
    let avatarUrl = null
    if (updatedUser.avatarUrl) {
      avatarUrl = await getAvatarUrl(updatedUser.avatarUrl)
    }

    res.status(200).json({
      message: "Profile updated successfully",
      user: {
        userId: updatedUser.userId,
        phoneNumber: updatedUser.phoneNumber,
        fullName: updatedUser.fullName,
        birthdate: updatedUser.birthdate,
        gender: updatedUser.gender,
        avatarUrl,
      },
    })
  } catch (error) {
    console.error("Error in updateUserProfile:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Upload avatar
export const uploadUserAvatar = async (req, res) => {
  try {
    const userId = req.user.userId

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" })
    }

    // Get user
    const user = await getUserById(userId)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Delete old avatar if exists
    if (user.avatarUrl) {
      await deleteAvatar(user.avatarUrl)
    }

    // Upload new avatar
    const key = await uploadAvatar(userId, req.file.buffer, req.file.mimetype)

    // Update user with new avatar URL
    const updatedUser = await updateUser(userId, { avatarUrl: key })

    // Generate signed URL for avatar
    const avatarUrl = await getAvatarUrl(key)

    res.status(200).json({
      message: "Avatar uploaded successfully",
      avatarUrl,
    })
  } catch (error) {
    console.error("Error in uploadUserAvatar:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get presigned URL for client-side upload
export const getAvatarUploadUrl = async (req, res) => {
  try {
    const userId = req.user.userId
    const { fileType } = req.body

    if (!fileType) {
      return res.status(400).json({ message: "File type is required" })
    }

    // Generate presigned URL
    const { url, key } = await generatePresignedUploadUrl(userId, fileType)

    res.status(200).json({
      uploadUrl: url,
      key,
    })
  } catch (error) {
    console.error("Error in getAvatarUploadUrl:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Confirm avatar upload and update user profile
export const confirmAvatarUpload = async (req, res) => {
  try {
    const userId = req.user.userId
    const { key } = req.body

    if (!key) {
      return res.status(400).json({ message: "Avatar key is required" })
    }

    // Get user
    const user = await getUserById(userId)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Delete old avatar if exists
    if (user.avatarUrl) {
      await deleteAvatar(user.avatarUrl)
    }

    // Update user with new avatar URL
    const updatedUser = await updateUser(userId, { avatarUrl: key })

    // Generate signed URL for avatar
    const avatarUrl = await getAvatarUrl(key)

    res.status(200).json({
      message: "Avatar updated successfully",
      avatarUrl,
    })
  } catch (error) {
    console.error("Error in confirmAvatarUpload:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

