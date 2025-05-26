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
      ref: "User",
    },
    type: {
      type: String,
      enum: ["text", "image", "file", "video", "emoji", "imageGroup", "deleted", "recalled", "system"],
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
    deletedBy: [
      {
        userId: { type: String, ref: "User" },
        deletedAt: { type: Date, default: Date.now },
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
    readBy: [
      {
        userId: { type: String },
        readAt: { type: Date, default: Date.now },
      },
    ],
    readAt: {
      type: Date,
      default: null,
    },
    forwardedFrom: {
      type: String,
      default: null,
    },
    replyTo: {
      type: String,
      ref: "Message",
      default: null,
    },
    mentions: [
      {
        userId: { type: String },
        name: { type: String },
      },
    ],
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
    isGroup: {
      type: Boolean,
      default: false,
    },
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

// Cập nhật index để hỗ trợ nhóm
conversationSchema.index({ participants: 1 })
conversationSchema.index({ isGroup: 1 })

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
      isGroup: false,
    })

    if (!conversation) {
      conversation = new Conversation({
        participants,
        isGroup: false,
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

export const createMessage = async (
  conversationId,
  senderId,
  receiverId,
  type,
  content,
  attachments = [],
  options = {},
) => {
  try {
    if (!conversationId || !senderId) {
      console.error("Missing required parameters for message creation:", {
        conversationId,
        senderId,
      })
      throw new Error("Conversation ID and sender ID are required")
    }

    const conversation = await getConversationById(conversationId)
    if (!conversation) {
      throw new Error("Conversation not found")
    }

    const messageData = {
      conversationId,
      senderId,
      type,
      content,
      attachments,
    }

    // Nếu là tin nhắn trả lời
    if (options.replyTo) {
      messageData.replyTo = options.replyTo
    }

    // Nếu là tin nhắn có đề cập
    if (options.mentions && options.mentions.length > 0) {
      messageData.mentions = options.mentions
    }

    // Nếu là tin nhắn nhóm, không cần receiverId
    if (!conversation.isGroup && receiverId) {
      messageData.receiverId = receiverId
    }

    const message = new Message(messageData)

    await message.save()

    await updateConversationLastMessage(conversationId, message.messageId)

    // Cập nhật tương tác cuối cùng giữa bạn bè (chỉ cho chat 1-1)
    if (!conversation.isGroup && receiverId) {
      await updateFriendshipLastInteraction(senderId, receiverId)
    }

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

export const markMessageAsRead = async (messageId, userId) => {
  try {
    // Kiểm tra xem người dùng đã đọc tin nhắn chưa
    const message = await Message.findOne({
      messageId,
      "readBy.userId": { $ne: userId },
    })

    if (!message) {
      return null // Tin nhắn không tồn tại hoặc đã được đọc
    }

    return await Message.findOneAndUpdate(
      { messageId },
      {
        $push: { readBy: { userId, readAt: new Date() } },
        $set: { readAt: new Date() }, // Giữ lại để tương thích ngược
      },
      { new: true },
    )
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
        senderId: { $ne: userId },
        "readBy.userId": { $ne: userId },
      },
      {
        $push: { readBy: { userId, readAt: new Date() } },
        $set: { readAt: new Date() }, // Giữ lại để tương thích ngược
      },
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
    return await Message.findOneAndUpdate(
      { messageId },
      {
        $push: {
          deletedBy: {
            userId: userId,
            deletedAt: new Date(),
          }
        }
      },
      { new: true }
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

export const forwardMessage = async (originalMessageId, conversationId, senderId, receiverId = null) => {
  try {
    const originalMessage = await Message.findOne({ messageId: originalMessageId })

    if (!originalMessage) {
      throw new Error("Original message not found")
    }

    if (originalMessage.isDeleted || originalMessage.isRecalled) {
      throw new Error("Cannot forward a deleted or recalled message")
    }

    const conversation = await getConversationById(conversationId)
    if (!conversation) {
      throw new Error("Conversation not found")
    }

    const newMessage = new Message({
      conversationId,
      senderId,
      receiverId: conversation.isGroup ? null : receiverId,
      type: originalMessage.type,
      content: originalMessage.content,
      attachments: originalMessage.attachments,
      forwardedFrom: originalMessage.messageId,
    })

    await newMessage.save()

    await updateConversationLastMessage(conversationId, newMessage.messageId)

    // Cập nhật tương tác cuối cùng giữa bạn bè (chỉ cho chat 1-1)
    if (!conversation.isGroup && receiverId) {
      await updateFriendshipLastInteraction(senderId, receiverId)
    }

    return newMessage
  } catch (error) {
    console.error("Error forwarding message:", error)
    throw error
  }
}

export const getUnreadMessageCount = async (userId, conversationId = null) => {
  try {
    const query = {
      senderId: { $ne: userId },
      "readBy.userId": { $ne: userId },
      isDeleted: false,
      isRecalled: false,
    }

    // Nếu conversationId được cung cấp, thêm vào query
    if (conversationId) {
      query.conversationId = conversationId
    } else {
      // Lấy tất cả các cuộc trò chuyện mà người dùng tham gia
      const conversations = await Conversation.find({ participants: userId })
      query.conversationId = { $in: conversations.map((conv) => conv.conversationId) }
    }

    return await Message.countDocuments(query)
  } catch (error) {
    console.error("Error getting unread message count:", error)
    throw error
  }
}

// Tạo tin nhắn hệ thống trong nhóm
export const createSystemMessage = async (conversationId, content) => {
  try {
    const message = new Message({
      conversationId,
      senderId: "system",
      type: "system",
      content,
    })

    await message.save()
    await updateConversationLastMessage(conversationId, message.messageId)

    return message
  } catch (error) {
    console.error("Error creating system message:", error)
    throw error
  }
}

// Tạo tin nhắn trả lời
export const createReplyMessage = async (
  conversationId,
  senderId,
  replyToMessageId,
  content,
  type = "text",
  attachments = [],
) => {
  try {
    const replyToMessage = await Message.findOne({ messageId: replyToMessageId })
    if (!replyToMessage) {
      throw new Error("Original message not found")
    }

    const conversation = await getConversationById(conversationId)
    if (!conversation) {
      throw new Error("Conversation not found")
    }

    let receiverId = null
    if (!conversation.isGroup) {
      receiverId = conversation.participants.find((id) => id !== senderId)
    }

    return await createMessage(conversationId, senderId, receiverId, type, content, attachments, {
      replyTo: replyToMessageId,
    })
  } catch (error) {
    console.error("Error creating reply message:", error)
    throw error
  }
}

// Tạo tin nhắn với đề cập
export const createMessageWithMentions = async (
  conversationId,
  senderId,
  content,
  mentions,
  type = "text",
  attachments = [],
) => {
  try {
    const conversation = await getConversationById(conversationId)
    if (!conversation) {
      throw new Error("Conversation not found")
    }

    let receiverId = null
    if (!conversation.isGroup) {
      receiverId = conversation.participants.find((id) => id !== senderId)
    }

    return await createMessage(conversationId, senderId, receiverId, type, content, attachments, {
      mentions,
    })
  } catch (error) {
    console.error("Error creating message with mentions:", error)
    throw error
  }
}
