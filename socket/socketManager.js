import { Server } from "socket.io"
import jwt from "jsonwebtoken"
import dotenv from "dotenv"
import { getUserById } from "../models/userModel.js"
import { getConversationById } from "../models/messageModel.js"
import { checkMemberPermission } from "../models/groupModel.js"

dotenv.config()

// Map to store active user connections
const userSocketMap = new Map() // userId -> Set of socket IDs
const socketUserMap = new Map() // socketId -> userId

// Initialize Socket.IO server
export const initializeSocketServer = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000,
  })

  // Middleware for authentication
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token

      if (!token) {
        return next(new Error("Authentication token is required"))
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      const user = await getUserById(decoded.userId)

      if (!user) {
        return next(new Error("User not found"))
      }

      socket.user = {
        userId: user.userId,
        email: user.email,
        fullName: user.fullName,
      }

      next()
    } catch (error) {
      console.error("Socket authentication error:", error)
      next(new Error("Authentication failed"))
    }
  })

  io.on("connection", (socket) => {
    const userId = socket.user.userId

    console.log(`User connected: ${userId}, Socket ID: ${socket.id}`)

    // Add user to connection maps
    if (!userSocketMap.has(userId)) {
      userSocketMap.set(userId, new Set())
    }
    userSocketMap.get(userId).add(socket.id)
    socketUserMap.set(socket.id, userId)

    // Join user to their personal room
    socket.join(userId)

    // Emit online status to friends
    emitUserStatus(io, userId, true)

    // Handle joining conversation rooms
    socket.on("join_conversation", async (conversationId) => {
      try {
        const conversation = await getConversationById(conversationId)

        if (!conversation) {
          socket.emit("error", { message: "Conversation not found" })
          return
        }

        if (!conversation.participants.includes(userId)) {
          socket.emit("error", { message: "Not authorized to join this conversation" })
          return
        }

        socket.join(conversationId)
        console.log(`User ${userId} joined conversation: ${conversationId}`)

        // Emit typing status to let others know user joined
        socket.to(conversationId).emit("user_joined", {
          userId,
          fullName: socket.user.fullName,
          conversationId,
        })
      } catch (error) {
        console.error("Error joining conversation:", error)
        socket.emit("error", { message: "Failed to join conversation" })
      }
    })

    // Handle leaving conversation rooms
    socket.on("leave_conversation", (conversationId) => {
      socket.leave(conversationId)
      console.log(`User ${userId} left conversation: ${conversationId}`)

      // Emit to others that user left
      socket.to(conversationId).emit("user_left", {
        userId,
        fullName: socket.user.fullName,
        conversationId,
      })
    })

    // Handle typing indicators
    socket.on("typing", ({ conversationId, isTyping }) => {
      socket.to(conversationId).emit("typing_indicator", {
        userId,
        fullName: socket.user.fullName,
        conversationId,
        isTyping,
      })
    })

    // Handle joining group rooms
    socket.on("join_group", async ({ groupId }) => {
      try {
        const permission = await checkMemberPermission(groupId, userId)

        if (!permission.isMember) {
          socket.emit("error", { message: "Not a member of this group" })
          return
        }

        socket.join(`group:${groupId}`)
        console.log(`User ${userId} joined group: ${groupId}`)
      } catch (error) {
        console.error("Error joining group:", error)
        socket.emit("error", { message: "Failed to join group" })
      }
    })

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${userId}, Socket ID: ${socket.id}`)

      // Remove socket from user's set of connections
      if (userSocketMap.has(userId)) {
        userSocketMap.get(userId).delete(socket.id)

        // If user has no more active connections, they're offline
        if (userSocketMap.get(userId).size === 0) {
          userSocketMap.delete(userId)
          emitUserStatus(io, userId, false)
        }
      }

      socketUserMap.delete(socket.id)
    })
  })

  return io
}

// Emit user online status to friends
const emitUserStatus = (io, userId, isOnline) => {
  io.emit(`user_status_${userId}`, {
    userId,
    isOnline,
    lastSeen: isOnline ? null : new Date(),
  })
}

// Utility functions to be used by controllers
export const emitToUser = (io, userId, event, data) => {
  io.to(userId).emit(event, data)
}

export const emitToConversation = (io, conversationId, event, data) => {
  io.to(conversationId).emit(event, data)
}

export const emitToGroup = (io, groupId, event, data) => {
  io.to(`group:${groupId}`).emit(event, data)
}

export const getUserOnlineStatus = (userId) => {
  return userSocketMap.has(userId)
}

export const getOnlineUsers = () => {
  return Array.from(userSocketMap.keys())
}
