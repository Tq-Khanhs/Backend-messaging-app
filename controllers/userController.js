import { getUserById, updateUser, verifyPassword } from "../models/userModel.js"
import {
  uploadAvatar,
  getAvatarUrl,
  deleteAvatar,
  generatePresignedUploadUrl,
} from "../services/supabaseStorageService.js"
import { validateEmail } from "../services/emailService.js"
import { checkFriendship, getFriendRequests, getSentFriendRequests } from "../models/friendModel.js"
import mongoose from "mongoose"

export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId

    const user = await getUserById(userId)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    let avatarUrl = null
    if (user.avatarUrl) {
      try {
   
        if (user.avatarUrl.startsWith("http")) {
          avatarUrl = user.avatarUrl
        } else {
          avatarUrl = await getAvatarUrl(user.avatarUrl)
        }
      } catch (avatarError) {
        console.warn("Error fetching avatar URL:", avatarError)
      }
    }

    res.status(200).json({
      userId: user.userId,
      email: user.email,
      fullName: user.fullName,
      birthdate: user.birthdate,
      gender: user.gender,
      avatarUrl: user.avatarUrl,
    })
  } catch (error) {
    console.error("Error in getUserProfile:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getUser = async (req, res) => {
  try {
    const { userId } = req.params

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" })
    }

    const user = await getUserById(userId)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    let avatarUrl = null
    if (user.avatarUrl) {
      try {
        if (user.avatarUrl.startsWith("http")) {
          avatarUrl = user.avatarUrl
        } else {
          avatarUrl = await getAvatarUrl(user.avatarUrl)
        }
      } catch (avatarError) {
        console.warn("Error fetching avatar URL:", avatarError)
      }
    }

    // Return only public information about the user
    res.status(200).json({
      userId: user.userId,
      fullName: user.fullName,
      avatarUrl: avatarUrl,
      // Note: We're not returning email, birthdate, or other private information
    })
  } catch (error) {
    console.error("Error in getUser:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const searchUsers = async (req, res) => {
  try {
    const { query } = req.query
    const currentUserId = req.user.userId

    if (!query || query.trim() === "") {
      return res.status(400).json({ message: "Search query is required" })
    }

    const searchQuery = {
      $or: [{ email: { $regex: query, $options: "i" } }, { fullName: { $regex: query, $options: "i" } }],
      userId: { $ne: currentUserId },
      isActive: true,
    }

    const User = mongoose.model("users")

    const users = await User.find(searchQuery).limit(20).lean()

    const sentRequests = await getSentFriendRequests(currentUserId)
    const sentRequestsMap = new Map(sentRequests.map((req) => [req.receiverId, req.requestId]))

    const receivedRequests = await getFriendRequests(currentUserId)
    const receivedRequestsMap = new Map(receivedRequests.map((req) => [req.senderId, req.requestId]))

    const usersWithFriendshipStatus = await Promise.all(
      users.map(async (user) => {
        let friendshipStatus = "not_friends"
        let requestId = null

        const areFriends = await checkFriendship(currentUserId, user.userId)
        if (areFriends) {
          friendshipStatus = "friends"
        }
        else if (sentRequestsMap.has(user.userId)) {
          friendshipStatus = "request_sent"
          requestId = sentRequestsMap.get(user.userId)
        }
        else if (receivedRequestsMap.has(user.userId)) {
          friendshipStatus = "request_received"
          requestId = receivedRequestsMap.get(user.userId)
        }

        let avatarUrl = null
        if (user.avatarUrl) {
          try {
            if (user.avatarUrl.startsWith("http")) {
              avatarUrl = user.avatarUrl
            } else {
              avatarUrl = await getAvatarUrl(user.avatarUrl)
            }
          } catch (avatarError) {
            console.warn("Error fetching avatar URL:", avatarError)
          }
        }

        return {
          userId: user.userId,
          email: user.email,
          fullName: user.fullName,
          avatarUrl: avatarUrl,
          friendshipStatus,
          requestId,
        }
      }),
    )

    res.status(200).json({
      message: "Users found",
      users: usersWithFriendshipStatus,
    })
  } catch (error) {
    console.error("Error in searchUsers:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId
    const { fullName, birthdate, gender, email, avatarUrl, avatarKey } = req.body

    const updateData = {}
    
    if (fullName !== undefined) updateData.fullName = fullName
    if (birthdate !== undefined) updateData.birthdate = birthdate
    if (gender !== undefined) updateData.gender = gender
    
    if (avatarUrl !== undefined) {
      updateData.avatarUrl = avatarUrl
    }
  
    if (avatarKey !== undefined) {
      updateData.avatarUrl = avatarKey
    }

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

    let finalAvatarUrl = null
    if (updatedUser.avatarUrl) {
      try {
        if (updatedUser.avatarUrl.startsWith("http")) {
          finalAvatarUrl = updatedUser.avatarUrl
        } else {
          finalAvatarUrl = await getAvatarUrl(updatedUser.avatarUrl)
        }
      } catch (avatarError) {
        console.warn("Error fetching avatar URL:", avatarError)
      }
    }

    res.status(200).json({
      message: "Profile updated successfully",
      user: {
        userId: updatedUser.userId,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        birthdate: updatedUser.birthdate,
        gender: updatedUser.gender,
        avatarUrl: finalAvatarUrl,
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

export const updatePassword = async (req, res) => {
  try {
    const userId = req.user.userId
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current password and new password are required",
      })
    }

    const user = await getUserById(userId)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Verify current password
    const isMatch = await verifyPassword(currentPassword, user.password)

    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" })
    }

    // Update with new password
    await updateUser(userId, { password: newPassword })

    res.status(200).json({ message: "Password updated successfully" })
  } catch (error) {
    console.error("Error in updatePassword:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
