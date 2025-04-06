import jwt from "jsonwebtoken"
import { getUserById } from "../models/userModel.js"
import dotenv from "dotenv"

dotenv.config()

export const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authorization token required" })
    }

    const token = authHeader.split(" ")[1]

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Check if user exists
    const user = await getUserById(decoded.userId)

    if (!user) {
      return res.status(401).json({ message: "User not found" })
    }

    // Attach user to request
    req.user = {
      userId: user.userId,
      phoneNumber: user.phoneNumber,
      firebaseUid: user.firebaseUid,
    }

    next()
  } catch (error) {
    console.error("Authentication error:", error)

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token" })
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" })
    }

    res.status(500).json({ message: "Server error", error: error.message })
  }
}

