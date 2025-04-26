import { Server } from "socket.io"
import jwt from "jsonwebtoken"
import dotenv from "dotenv"
import { getUserById } from "../models/userModel.js"
import { getConversationById } from "../models/messageModel.js"
import { checkMemberPermission, getGroupById } from "../models/groupModel.js"
import { EVENTS, userEvent } from "./socketEvents.js"

dotenv.config()

// Map to store active user connections
const userSocketMap = new Map() // userId -> Set of socket IDs
const socketUserMap = new Map() // socketId -> userId
const userConversationsMap = new Map() // userId -> Set of conversationIds
const userGroupsMap = new Map() // userId -> Set of groupIds

// Initialize Socket.IO server
export const initializeSocketServer = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST", "PUT", "DELETE"],
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
        avatarUrl: user.avatarUrl,
      }

      next()
    } catch (error) {
      console.error("Socket authentication error:", error)
      next(new Error("Authentication failed"))
    }
  })

  io.on(EVENTS.CONNECT, (socket) => {
    const userId = socket.user.userId

    console.log(`User connected: ${userId}, Socket ID: ${socket.id}`)

    // Add user to connection maps
    if (!userSocketMap.has(userId)) {
      userSocketMap.set(userId, new Set())
      userConversationsMap.set(userId, new Set())
      userGroupsMap.set(userId, new Set())
    }
    userSocketMap.get(userId).add(socket.id)
    socketUserMap.set(socket.id, userId)


    socket.join(userId)

  
    emitUserStatus(io, userId, true)

    socket.on(EVENTS.GROUP_CREATED, ({ groupId, conversationId, members }) => {
      try {
        const creatorId = socket.user.userId
        const creatorName = socket.user.fullName || "User"
        members.forEach((memberId) => {
          if (userSocketMap.has(memberId)) {
            io.to(memberId).emit(EVENTS.GROUP_CREATED, {
              groupId,
              conversationId,
              addedBy: {
                userId: creatorId,
                fullName: creatorName,
              },
              timestamp: new Date(),
            })

            console.log(`Emitted GROUP_CREATED event to member ${memberId} for group ${groupId}`)
          }
        })
      } catch (error) {
        console.error("Error emitting GROUP_CREATED event:", error)
        socket.emit(EVENTS.ERROR, { message: "Failed to notify group members", error: error.message })
      }
    })
    
    // Handle joining conversation rooms
    socket.on(EVENTS.JOIN_CONVERSATION, async (conversationId) => {
      try {
        const conversation = await getConversationById(conversationId)

        if (!conversation) {
          socket.emit(EVENTS.ERROR, { message: "Conversation not found" })
          return
        }

        if (!conversation.participants.includes(userId)) {
          socket.emit(EVENTS.ERROR, { message: "Not authorized to join this conversation" })
          return
        }

        socket.join(conversationId)
        userConversationsMap.get(userId).add(conversationId)
        console.log(`User ${userId} joined conversation: ${conversationId}`)

        // Emit user joined event to let others know user joined
        socket.to(conversationId).emit(EVENTS.USER_JOINED, {
          userId,
          fullName: socket.user.fullName,
          avatarUrl: socket.user.avatarUrl,
          conversationId,
          timestamp: new Date(),
        })
      } catch (error) {
        console.error("Error joining conversation:", error)
        socket.emit(EVENTS.ERROR, { message: "Failed to join conversation", error: error.message })
      }
    })

    // Handle leaving conversation rooms
    socket.on(EVENTS.LEAVE_CONVERSATION, (conversationId) => {
      socket.leave(conversationId)
      if (userConversationsMap.has(userId)) {
        userConversationsMap.get(userId).delete(conversationId)
      }
      console.log(`User ${userId} left conversation: ${conversationId}`)

      // Emit to others that user left
      socket.to(conversationId).emit(EVENTS.USER_LEFT, {
        userId,
        fullName: socket.user.fullName,
        conversationId,
        timestamp: new Date(),
      })
    })

    // Handle typing indicators
    socket.on(EVENTS.TYPING_INDICATOR, ({ conversationId, isTyping }) => {
      socket.to(conversationId).emit(EVENTS.TYPING_INDICATOR, {
        userId,
        fullName: socket.user.fullName,
        avatarUrl: socket.user.avatarUrl,
        conversationId,
        isTyping,
        timestamp: new Date(),
      })
    })

    // Handle joining group rooms
    socket.on(EVENTS.JOIN_GROUP, async ({ groupId }) => {
      try {
        const permission = await checkMemberPermission(groupId, userId)

        if (!permission.isMember) {
          socket.emit(EVENTS.ERROR, { message: "Not a member of this group" })
          return
        }

        const group = await getGroupById(groupId)
        if (!group) {
          socket.emit(EVENTS.ERROR, { message: "Group not found" })
          return
        }

        // Join both the group room and the conversation room
        socket.join(`group:${groupId}`)
        socket.join(group.conversationId)
        userGroupsMap.get(userId).add(groupId)
        userConversationsMap.get(userId).add(group.conversationId)

        console.log(`User ${userId} joined group: ${groupId} and conversation: ${group.conversationId}`)

        // Notify other group members
        socket.to(`group:${groupId}`).emit(EVENTS.USER_JOINED, {
          userId,
          fullName: socket.user.fullName,
          avatarUrl: socket.user.avatarUrl,
          groupId,
          timestamp: new Date(),
        })
      } catch (error) {
        console.error("Error joining group:", error)
        socket.emit(EVENTS.ERROR, { message: "Failed to join group", error: error.message })
      }
    })

    // Handle message read events
    socket.on(EVENTS.MESSAGE_READ, ({ messageId, conversationId }) => {
      try {
        // Broadcast to all users in the conversation that this user has read the message
        socket.to(conversationId).emit(EVENTS.MESSAGE_READ, {
          messageId,
          userId,
          conversationId,
          readAt: new Date(),
        })
      } catch (error) {
        console.error("Error handling message read:", error)
        socket.emit(EVENTS.ERROR, { message: "Failed to mark message as read", error: error.message })
      }
    })

    // Handle messages read (mark all as read) events
    socket.on(EVENTS.MESSAGES_READ, ({ conversationId }) => {
      try {
        // Broadcast to all users in the conversation that this user has read all messages
        socket.to(conversationId).emit(EVENTS.MESSAGES_READ, {
          userId,
          conversationId,
          readAt: new Date(),
        })
      } catch (error) {
        console.error("Error handling messages read:", error)
        socket.emit(EVENTS.ERROR, { message: "Failed to mark messages as read", error: error.message })
      }
    })

    // Handle message read by group member
    socket.on(EVENTS.MESSAGE_READ_BY_MEMBER, ({ groupId, messageId }) => {
      try {
        // Broadcast to all users in the group that this member has read the message
        socket.to(`group:${groupId}`).emit(EVENTS.MESSAGE_READ_BY_MEMBER, {
          messageId,
          userId,
          groupId,
          readAt: new Date(),
        })
      } catch (error) {
        console.error("Error handling message read by member:", error)
        socket.emit(EVENTS.ERROR, { message: "Failed to mark message as read by member", error: error.message })
      }
    })

    // Handle disconnection
    socket.on(EVENTS.DISCONNECT, () => {
      console.log(`User disconnected: ${userId}, Socket ID: ${socket.id}`)

      // Remove socket from user's set of connections
      if (userSocketMap.has(userId)) {
        userSocketMap.get(userId).delete(socket.id)

        // If user has no more active connections, they're offline
        if (userSocketMap.get(userId).size === 0) {
          // Clean up user's conversation and group memberships
          userConversationsMap.delete(userId)
          userGroupsMap.delete(userId)
          userSocketMap.delete(userId)
          emitUserStatus(io, userId, false)
        }
      }

      socketUserMap.delete(socket.id)
    })
  })

  return io
}

// Emit user online status to all users
const emitUserStatus = (io, userId, isOnline) => {
  io.emit(userEvent(userId, EVENTS.USER_STATUS), {
    userId,
    isOnline,
    lastSeen: isOnline ? null : new Date(),
  })
}

// Utility functions to be used by controllers
export const emitToUser = (io, userId, event, data) => {
  if (!io) {
    console.error("Socket.io instance not available")
    return
  }

  try {
    io.to(userId).emit(event, {
      ...data,
      timestamp: new Date(),
    })
    console.log(`Emitted ${event} to user ${userId}`)
  } catch (error) {
    console.error(`Error emitting ${event} to user ${userId}:`, error)
  }
}

// Update the emitToConversation function to ensure all participants receive the update
export const emitToConversation = (io, conversationId, event, data) => {
  if (!io) {
    console.error("Socket.io instance not available")
    return
  }

  try {
    // For new_message event, ensure all participants receive the update
    if (event === EVENTS.NEW_MESSAGE) {
      // Get conversation to find all participants
      getConversationById(conversationId)
        .then((conversation) => {
          if (!conversation) {
            console.error(`Conversation ${conversationId} not found`)
            return
          }

          // Broadcast to all sockets in the conversation room
          io.to(conversationId).emit(event, {
            ...data,
            timestamp: new Date(),
          })

          // Also emit to each participant individually to ensure they receive it
          // even if they're not currently in the conversation room
          conversation.participants.forEach((participantId) => {
            io.to(participantId).emit(event, {
              ...data,
              timestamp: new Date(),
            })
          })

          console.log(
            `Emitted ${event} to conversation ${conversationId} with ${conversation.participants.length} participants`,
          )
        })
        .catch((error) => {
          console.error(`Error getting conversation ${conversationId}:`, error)
          // Fallback to standard room broadcast
          io.to(conversationId).emit(event, {
            ...data,
            timestamp: new Date(),
          })
        })
    } else if (event === EVENTS.MESSAGE_DELETED || event === EVENTS.MESSAGE_RECALLED) {
      // For message deletion/recall, ensure all participants are notified
      io.to(conversationId).emit(event, {
        ...data,
        timestamp: new Date(),
      })
      console.log(`Emitted ${event} for message in conversation ${conversationId}`)
    } else {
      // For other events, use standard room broadcast
      io.to(conversationId).emit(event, {
        ...data,
        timestamp: new Date(),
      })
      console.log(`Emitted ${event} to conversation ${conversationId}`)
    }
  } catch (error) {
    console.error(`Error emitting ${event} to conversation ${conversationId}:`, error)
  }
}

export const emitToGroup = (io, groupId, event, data) => {
  if (!io) {
    console.error("Socket.io instance not available")
    return
  }

  try {
    // For group events, emit to both the group room and the associated conversation
    getGroupById(groupId)
      .then((group) => {
        if (!group) {
          console.error(`Group ${groupId} not found`)
          // Fallback to just the group room
          io.to(`group:${groupId}`).emit(event, {
            ...data,
            timestamp: new Date(),
          })
          return
        }

        // Emit to group room
        io.to(`group:${groupId}`).emit(event, {
          ...data,
          timestamp: new Date(),
        })

        // For certain events, also emit to the conversation room
        if (
          [
            EVENTS.GROUP_UPDATED,
            EVENTS.GROUP_DISSOLVED,
            EVENTS.MEMBER_ADDED,
            EVENTS.MEMBER_REMOVED,
            EVENTS.MEMBER_LEFT,
            EVENTS.MEMBER_ROLE_UPDATED,
          ].includes(event)
        ) {
          io.to(group.conversationId).emit(event, {
            ...data,
            timestamp: new Date(),
          })
        }

        console.log(`Emitted ${event} to group ${groupId} and conversation ${group.conversationId}`)
      })
      .catch((error) => {
        console.error(`Error getting group ${groupId}:`, error)
        // Fallback to just the group room
        io.to(`group:${groupId}`).emit(event, {
          ...data,
          timestamp: new Date(),
        })
      })
  } catch (error) {
    console.error(`Error emitting ${event} to group ${groupId}:`, error)
  }
}

export const getUserOnlineStatus = (userId) => {
  return userSocketMap.has(userId)
}

export const getOnlineUsers = () => {
  return Array.from(userSocketMap.keys())
}

export const getUserActiveConversations = (userId) => {
  if (userConversationsMap.has(userId)) {
    return Array.from(userConversationsMap.get(userId))
  }
  return []
}

export const getUserActiveGroups = (userId) => {
  if (userGroupsMap.has(userId)) {
    return Array.from(userGroupsMap.get(userId))
  }
  return []
}
