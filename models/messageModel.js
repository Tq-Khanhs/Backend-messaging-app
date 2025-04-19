import mongoose from "mongoose"
import { v4 as uuidv4 } from "uuid"
import { updateFriendshipLastInteraction } from "./friendModel.js"

const messageSchema = new mongoose.Schema(
  {
    messageId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    conversationId: {
      type: String,
      required: true,
      ref: "Conversation",
    },
    senderId: {
      type: String,
      required: true,
      ref: "User",
    },
    receiverId: {
      type: String,
      required: true,
      ref: "User",
    },
    type: {
      type: String,
      enum: ["text", "image", "file", "video", "emoji", "imageGroup", "deleted", "recalled"],
      default: "text",
    },
    content: {
      type: String,
      default: "",
    },
    attachments: [
      {
        url: { type: String },
        type: { type: String },
        name: { type: String },
        size: { type: Number },
        thumbnailUrl: { type: String },
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
    isRecalled: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    forwardedFrom: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
)

const conversationSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    participants: [
      {
        type: String,
        ref: "User",
      },
    ],
    lastMessageId: {
      type: String,
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
)

conversationSchema.index({ participants: 1 })

export const Message = mongoose.model("Message", messageSchema)
export const Conversation = mongoose.model("Conversation", conversationSchema)

export const getOrCreateConversation = async (user1Id, user2Id) => {
  try {
    if (!user1Id || !user2Id) {
      console.error("Missing user IDs for conversation:", { user1Id, user2Id })
      throw new Error("Both user IDs are required to create a conversation")
    }

    const participants = [user1Id, user2Id].sort()

  
    let conversation = await Conversation.findOne({
      participants: { $all: participants, $size: 2 },
    })

    if (!conversation) {
      conversation = new Conversation({
        participants,
      })
      await conversation.save()
    }

    return conversation
  } catch (error) {
    console.error("Error getting or creating conversation:", error)
    throw error
  }
}

export const getConversationById = async (conversationId) => {
  try {
    return await Conversation.findOne({ conversationId })
  } catch (error) {
    console.error("Error getting conversation:", error)
    throw error
  }
}

export const getUserConversations = async (userId) => {
  try {
    return await Conversation.find({
      participants: userId,
    }).sort({ lastMessageAt: -1 })
  } catch (error) {
    console.error("Error getting user conversations:", error)
    throw error
  }
}

export const updateConversationLastMessage = async (conversationId, messageId) => {
  try {
    return await Conversation.findOneAndUpdate(
      { conversationId },
      {
        lastMessageId: messageId,
        lastMessageAt: new Date(),
      },
      { new: true },
    )
  } catch (error) {
    console.error("Error updating conversation last message:", error)
    throw error
  }
}

export const createMessage = async (conversationId, senderId, receiverId, type, content, attachments = []) => {
  try {
    if (!conversationId || !senderId || !receiverId) {
      console.error("Missing required parameters for message creation:", {
        conversationId,
        senderId,
        receiverId,
      })
      throw new Error("Conversation ID, sender ID, and receiver ID are required")
    }

    const message = new Message({
      conversationId,
      senderId,
      receiverId,
      type,
      content,
      attachments,
    })

    await message.save()

    await updateConversationLastMessage(conversationId, message.messageId)

    await updateFriendshipLastInteraction(senderId, receiverId)

    return message
  } catch (error) {
    console.error("Error creating message:", error)
    throw error
  }
}

export const getMessageById = async (messageId) => {
  try {
    return await Message.findOne({ messageId })
  } catch (error) {
    console.error("Error getting message:", error)
    throw error
  }
}

export const getConversationMessages = async (conversationId, limit = 50, before = null) => {
  try {
    const query = { conversationId }

    if (before) {
      query.createdAt = { $lt: new Date(before) }
    }

    return await Message.find(query).sort({ createdAt: -1 }).limit(limit)
  } catch (error) {
    console.error("Error getting conversation messages:", error)
    throw error
  }
}

export const markMessageAsRead = async (messageId) => {
  try {
    return await Message.findOneAndUpdate({ messageId }, { readAt: new Date() }, { new: true })
  } catch (error) {
    console.error("Error marking message as read:", error)
    throw error
  }
}

export const markConversationAsRead = async (conversationId, userId) => {
  try {
    return await Message.updateMany(
      {
        conversationId,
        receiverId: userId,
        readAt: null,
      },
      { readAt: new Date() },
    )
  } catch (error) {
    console.error("Error marking conversation as read:", error)
    throw error
  }
}

export const deleteMessage = async (messageId, userId) => {
  try {
    const message = await Message.findOne({ messageId })

    if (!message) {
      throw new Error("Message not found")
    }

    if (message.senderId !== userId) {
      throw new Error("You can only delete your own messages")
    }

    return await Message.findOneAndUpdate(
      { messageId },
      {
        isDeleted: true,
        content: "",
        attachments: [],
        type: "deleted",
      },
      { new: true },
    )
  } catch (error) {
    console.error("Error deleting message:", error)
    throw error
  }
}

export const recallMessage = async (messageId, userId) => {
  try {
    const message = await Message.findOne({ messageId })

    if (!message) {
      throw new Error("Message not found")
    }

    if (message.senderId !== userId) {
      throw new Error("You can only recall your own messages")
    }

    const messageTime = new Date(message.createdAt).getTime()
    const currentTime = new Date().getTime()
    const hourInMillis = 60 * 60 * 1000

    if (currentTime - messageTime > hourInMillis) {
      throw new Error("Messages can only be recalled within 1 hour of sending")
    }

    return await Message.findOneAndUpdate(
      { messageId },
      {
        isRecalled: true,
        content: "",
        attachments: [],
        type: "recalled",
      },
      { new: true },
    )
  } catch (error) {
    console.error("Error recalling message:", error)
    throw error
  }
}

export const forwardMessage = async (originalMessageId, conversationId, senderId, receiverId) => {
  try {
    const originalMessage = await Message.findOne({ messageId: originalMessageId })

    if (!originalMessage) {
      throw new Error("Original message not found")
    }

    if (originalMessage.isDeleted || originalMessage.isRecalled) {
      throw new Error("Cannot forward a deleted or recalled message")
    }

    const newMessage = new Message({
      conversationId,
      senderId,
      receiverId,
      type: originalMessage.type,
      content: originalMessage.content,
      attachments: originalMessage.attachments,
      forwardedFrom: originalMessage.messageId,
    })

    await newMessage.save()

    await updateConversationLastMessage(conversationId, newMessage.messageId)
    await updateFriendshipLastInteraction(senderId, receiverId)

    return newMessage
  } catch (error) {
    console.error("Error forwarding message:", error)
    throw error
  }
}

export const getUnreadMessageCount = async (userId, conversationId = null) => {
  try {
    const query = {
      receiverId: userId,
      readAt: null,
      isDeleted: false,
      isRecalled: false,
    }

    // If conversationId is provided, add it to the query
    if (conversationId) {
      query.conversationId = conversationId
    }

    return await Message.countDocuments(query)
  } catch (error) {
    console.error("Error getting unread message count:", error)
    throw error
  }
}
