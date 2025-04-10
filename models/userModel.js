import mongoose from "mongoose"
import bcrypt from "bcryptjs"
import { v4 as uuidv4 } from "uuid"
import { USERS_COLLECTION } from "../config/mongodbConfig.js"

// Helper function to parse date in format "DD/MM/YYYY"
const parseDateString = (dateString) => {
  if (!dateString) return null

  // Split the date string by "/"
  const parts = dateString.split("/")
  if (parts.length !== 3) return null

  // Parse day, month, and year
  const day = Number.parseInt(parts[0], 10)
  const month = Number.parseInt(parts[1], 10) - 1 // Month is 0-indexed in JavaScript Date
  const year = Number.parseInt(parts[2], 10)

  // Create date using UTC to avoid timezone issues
  const date = new Date(Date.UTC(year, month, day))

  // Validate the date is correct (handles cases like 31/2/2023)
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month || date.getUTCFullYear() !== year) {
    return null
  }

  return date
}

// Define the user schema
const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    fullName: {
      type: String,
      default: null,
    },
    birthdate: {
      type: Date, 
      default: null,
    },
    gender: {
      type: String,
      enum: [ "Nam", "Nữ", "Không chia sẻ"], 
      default: null,
    },
    avatarUrl: {
      type: String,
      default: null,
    },
    firebaseUid: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: {
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
  },
)

// Create the User model
const User = mongoose.model(USERS_COLLECTION, userSchema)

// Create a new user
export const createUser = async (userData) => {
  try {
    const userId = userData.firebaseUid || uuidv4()

    // Hash password if provided
    if (userData.password) {
      const salt = await bcrypt.genSalt(10)
      userData.password = await bcrypt.hash(userData.password, salt)
    }

    // Parse birthdate if it's a string in format DD/MM/YYYY
    let birthdate = null
    if (userData.birthdate) {
      if (typeof userData.birthdate === "string") {
        birthdate = parseDateString(userData.birthdate)
        if (!birthdate) {
          console.warn(`Invalid birthdate format: ${userData.birthdate}. Expected format: DD/MM/YYYY`)
        }
      } else if (userData.birthdate instanceof Date) {
        birthdate = userData.birthdate
      }
    }

    const user = new User({
      userId,
      phoneNumber: userData.phoneNumber,
      password: userData.password || null,
      fullName: userData.fullName || null,
      birthdate: birthdate,
      gender: userData.gender || null,
      avatarUrl: userData.avatarUrl || null,
      firebaseUid: userData.firebaseUid || null,
    })

    await user.save()
    return user.toObject()
  } catch (error) {
    console.error("Error creating user in MongoDB:", error)
    throw error
  }
}

// Get user by phone number
export const getUserByPhoneNumber = async (phoneNumber) => {
  try {
    const user = await User.findOne({ phoneNumber }).lean()
    return user
  } catch (error) {
    console.error("Error getting user by phone number from MongoDB:", error)
    throw error
  }
}

// Get user by Firebase UID
export const getUserByFirebaseUid = async (firebaseUid) => {
  try {
    const user = await User.findOne({ firebaseUid }).lean()
    return user
  } catch (error) {
    console.error("Error getting user by Firebase UID from MongoDB:", error)
    throw error
  }
}

// Get user by ID
export const getUserById = async (userId) => {
  try {
    const user = await User.findOne({ userId }).lean()
    return user
  } catch (error) {
    console.error("Error getting user by ID from MongoDB:", error)
    throw error
  }
}

// Update user
export const updateUser = async (userId, updateData) => {
  try {
    // Hash password if provided
    if (updateData.password) {
      const salt = await bcrypt.genSalt(10)
      updateData.password = await bcrypt.hash(updateData.password, salt)
    }

    // Parse birthdate if it's a string in format DD/MM/YYYY
    if (updateData.birthdate && typeof updateData.birthdate === "string") {
      const birthdate = parseDateString(updateData.birthdate)
      if (birthdate) {
        updateData.birthdate = birthdate
      } else {
        console.warn(`Invalid birthdate format: ${updateData.birthdate}. Expected format: DD/MM/YYYY`)
        delete updateData.birthdate // Remove invalid birthdate from update
      }
    }

    const updatedUser = await User.findOneAndUpdate({ userId }, { $set: updateData }, { new: true }).lean()

    return updatedUser
  } catch (error) {
    console.error("Error updating user in MongoDB:", error)
    throw error
  }
}


export const verifyPassword = async (plainPassword, hashedPassword) => {
  return await bcrypt.compare(plainPassword, hashedPassword)
}

export default User
