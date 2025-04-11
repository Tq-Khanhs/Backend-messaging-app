import { getUserById, updateUser } from "../models/userModel.js"
import {
  uploadAvatar,
  getAvatarUrl,
  deleteAvatar,
  generatePresignedUploadUrl,
} from "../services/supabaseStorageService.js"
import { validateEmail } from "../services/emailService.js"

export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId

    const user = await getUserById(userId)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    let avatarUrl = null
    if (user.avatarUrl) {
      avatarUrl = await getAvatarUrl(user.avatarUrl)
    }

    res.status(200).json({
      userId: user.userId,
      email: user.email,
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

export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId
    const { fullName, birthdate, gender, email } = req.body

    const updateData = {
      fullName,
      birthdate,
      gender,
    }

    // If email is being updated, validate it
    if (email) {
      if (!validateEmail(email)) {
        return res.status(400).json({ message: "Invalid email format" })
      }
      updateData.email = email
    }

    const updatedUser = await updateUser(userId, updateData)

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" })
    }

    let avatarUrl = null
    if (updatedUser.avatarUrl) {
      avatarUrl = await getAvatarUrl(updatedUser.avatarUrl)
    }

    res.status(200).json({
      message: "Profile updated successfully",
      user: {
        userId: updatedUser.userId,
        email: updatedUser.email,
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

export const uploadUserAvatar = async (req, res) => {
  try {
    const userId = req.user.userId

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" })
    }

    const user = await getUserById(userId)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    if (user.avatarUrl) {
      await deleteAvatar(user.avatarUrl)
    }
    const key = await uploadAvatar(userId, req.file.buffer, req.file.mimetype)
    const updatedUser = await updateUser(userId, { avatarUrl: key })
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

export const getAvatarUploadUrl = async (req, res) => {
  try {
    const userId = req.user.userId
    const { fileType } = req.body

    if (!fileType) {
      return res.status(400).json({ message: "File type is required" })
    }

    const { url, key, headers } = await generatePresignedUploadUrl(userId, fileType)

    res.status(200).json({
      uploadUrl: url,
      key,
      headers,
    })
  } catch (error) {
    console.error("Error in getAvatarUploadUrl:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const confirmAvatarUpload = async (req, res) => {
  try {
    const userId = req.user.userId
    const { key } = req.body

    if (!key) {
      return res.status(400).json({ message: "Avatar key is required" })
    }
    const user = await getUserById(userId)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }
    if (user.avatarUrl) {
      await deleteAvatar(user.avatarUrl)
    }

    const updatedUser = await updateUser(userId, { avatarUrl: key })

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
