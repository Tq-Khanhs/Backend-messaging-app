import {
  getOrCreateConversation,
  getConversationById,
  getUserConversations,
  createMessage,
  getMessageById,
  getConversationMessages,
  markMessageAsRead,
  markConversationAsRead,
  deleteMessage,
  recallMessage,
  forwardMessage,
  getUnreadMessageCount,
  createReplyMessage,
  createMessageWithMentions,
} from "../models/messageModel.js"
import { checkFriendship } from "../models/friendModel.js"
import { getUserById } from "../models/userModel.js"
import { uploadImage } from "../services/supabaseStorageService.js"
import { getGroupByConversationId } from "../models/groupModel.js"
import { emitToConversation, emitToUser } from "../socket/socketManager.js"

export const getConversations = async (req, res) => {
  try {
    const userId = req.user.userId

    const conversations = await getUserConversations(userId)

    // Use Promise.allSettled instead of Promise.all to prevent one failed promise from rejecting all
    const conversationsWithDetailsPromises = conversations.map(async (conversation) => {
      try {
        // Xử lý khác nhau cho nhóm và chat 1-1
        if (conversation.isGroup) {
          // Lấy thông tin nhóm
          const group = await getGroupByConversationId(conversation.conversationId)

          if (!group) {
            console.warn(`Group not found for conversation ${conversation.conversationId}`)
            return null
          }

          let lastMessage = null
          if (conversation.lastMessageId) {
            lastMessage = await getMessageById(conversation.lastMessageId)
          }

          const unreadCount = await getUnreadMessageCount(userId, conversation.conversationId)

          return {
            conversationId: conversation.conversationId,
            isGroup: true,
            group: {
              groupId: group.groupId,
              name: group.name,
              avatarUrl: group.avatarUrl,
              memberCount: group.members.length,
            },
            lastMessage: lastMessage
              ? {
                  messageId: lastMessage.messageId,
                  senderId: lastMessage.senderId,
                  type: lastMessage.type,
                  content: lastMessage.content,
                  isDeleted: lastMessage.isDeleted,
                  isRecalled: lastMessage.isRecalled,
                  createdAt: lastMessage.createdAt,
                }
              : null,
            lastMessageAt: conversation.lastMessageAt,
            unreadCount,
          }
        } else {
          // Xử lý cho chat 1-1 (giữ nguyên code cũ)
          const otherParticipantId = conversation.participants.find((id) => id !== userId)

          if (!otherParticipantId) {
            console.warn(`Could not find other participant in conversation ${conversation.conversationId}`)
            return null
          }

          let otherParticipant = await getUserById(otherParticipantId)

          // If participant doesn't exist, create a fallback participant object
          if (!otherParticipant) {
            console.warn(
              `Other participant with ID ${otherParticipantId} not found for conversation ${conversation.conversationId}`,
            )

            // Create a fallback participant object
            otherParticipant = {
              userId: otherParticipantId,
              fullName: "Deleted User",
              avatarUrl: null,
              email: "deleted@user.com",
            }
          }

          let lastMessage = null
          if (conversation.lastMessageId) {
            lastMessage = await getMessageById(conversation.lastMessageId)
          }

          const unreadCount = await getUnreadMessageCount(userId, conversation.conversationId)

          return {
            conversationId: conversation.conversationId,
            isGroup: false,
            participant: {
              userId: otherParticipant.userId,
              fullName: otherParticipant.fullName,
              avatarUrl: otherParticipant.avatarUrl,
            },
            lastMessage: lastMessage
              ? {
                  messageId: lastMessage.messageId,
                  senderId: lastMessage.senderId,
                  type: lastMessage.type,
                  content: lastMessage.content,
                  isDeleted: lastMessage.isDeleted,
                  isRecalled: lastMessage.isRecalled,
                  createdAt: lastMessage.createdAt,
                }
              : null,
            lastMessageAt: conversation.lastMessageAt,
            unreadCount,
          }
        }
      } catch (error) {
        console.error(`Error processing conversation ${conversation.conversationId}:`, error)
        return null
      }
    })

    const conversationsWithDetailsResults = await Promise.allSettled(conversationsWithDetailsPromises)

    // Filter out rejected promises and null results
    const conversationsWithDetails = conversationsWithDetailsResults
      .filter((result) => result.status === "fulfilled" && result.value !== null)
      .map((result) => result.value)

    res.status(200).json({
      message: "Conversations retrieved successfully",
      conversations: conversationsWithDetails,
    })
  } catch (error) {
    console.error("Error in getConversations:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params
    const userId = req.user.userId
    const { before, limit = 50 } = req.query

    const conversation = await getConversationById(conversationId)

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" })
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: "You are not a participant in this conversation" })
    }

    const messages = await getConversationMessages(conversationId, Number.parseInt(limit), before)

    // Đánh dấu tin nhắn đã đọc
    await markConversationAsRead(conversationId, userId)

    // Emit read status to other participants
    conversation.participants.forEach((participantId) => {
      if (participantId !== userId) {
        emitToUser(req.io, participantId, "messages_read", {
          conversationId,
          userId,
          readAt: new Date(),
        })
      }
    })

    // Lấy thông tin người gửi cho mỗi tin nhắn
    const messagesWithSenderInfo = await Promise.all(
      messages.map(async (msg) => {
        let sender = null

        if (msg.senderId === "system") {
          sender = {
            userId: "system",
            fullName: "System",
            avatarUrl: null,
          }
        } else {
          const user = await getUserById(msg.senderId)
          sender = user
            ? {
                userId: user.userId,
                fullName: user.fullName,
                avatarUrl: user.avatarUrl,
              }
            : {
                userId: msg.senderId,
                fullName: "Unknown User",
                avatarUrl: null,
              }
        }

        // Lấy thông tin tin nhắn trả lời nếu có
        let replyToMessage = null
        if (msg.replyTo) {
          const originalMsg = await getMessageById(msg.replyTo)
          if (originalMsg) {
            const originalSender = await getUserById(originalMsg.senderId)
            replyToMessage = {
              messageId: originalMsg.messageId,
              content: originalMsg.content,
              type: originalMsg.type,
              attachments: originalMsg.attachments,
              sender: originalSender
                ? {
                    userId: originalSender.userId,
                    fullName: originalSender.fullName,
                  }
                : {
                    userId: originalMsg.senderId,
                    fullName: "Unknown User",
                  },
            }
          }
        }

        return {
          messageId: msg.messageId,
          senderId: msg.senderId,
          sender,
          type: msg.type,
          content: msg.content,
          attachments: msg.attachments,
          isDeleted: msg.isDeleted,
          isRecalled: msg.isRecalled,
          readBy: msg.readBy,
          createdAt: msg.createdAt,
          forwardedFrom: msg.forwardedFrom,
          replyTo: replyToMessage,
          mentions: msg.mentions,
        }
      }),
    )

    res.status(200).json({
      message: "Messages retrieved successfully",
      messages: messagesWithSenderInfo,
      isGroup: conversation.isGroup,
    })
  } catch (error) {
    console.error("Error in getMessages:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getOrStartConversation = async (req, res) => {
  try {
    const { userId: otherUserId } = req.params
    const userId = req.user.userId

    if (userId === otherUserId) {
      return res.status(400).json({ message: "Cannot start a conversation with yourself" })
    }

    const otherUser = await getUserById(otherUserId)
    if (!otherUser) {
      return res.status(404).json({ message: "User not found" })
    }

    const areFriends = await checkFriendship(userId, otherUserId)
    if (!areFriends) {
      return res.status(403).json({ message: "You must be friends to start a conversation" })
    }

    const conversation = await getOrCreateConversation(userId, otherUserId)

    if (!conversation) {
      return res.status(500).json({ message: "Failed to create or retrieve conversation" })
    }

    res.status(200).json({
      message: "Conversation retrieved successfully",
      conversation: {
        conversationId: conversation.conversationId,
        isGroup: false,
        participant: {
          userId: otherUser.userId,
          fullName: otherUser.fullName,
          avatarUrl: otherUser.avatarUrl,
        },
      },
    })
  } catch (error) {
    console.error("Error in getOrStartConversation:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const sendTextMessage = async (req, res) => {
  try {
    const { conversationId, content } = req.body
    const senderId = req.user.userId

    if (!content || content.trim() === "") {
      return res.status(400).json({ message: "Message content cannot be empty" })
    }

    const conversation = await getConversationById(conversationId)

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" })
    }

    if (!conversation.participants.includes(senderId)) {
      return res.status(403).json({ message: "You are not a participant in this conversation" })
    }

    let receiverId = null
    if (!conversation.isGroup) {
      receiverId = conversation.participants.find((id) => id !== senderId)

      if (!receiverId) {
        return res.status(400).json({ message: "Could not determine message recipient" })
      }
    }

    const message = await createMessage(conversationId, senderId, receiverId, "text", content)

    // Lấy thông tin người gửi
    const sender = await getUserById(senderId)
    const senderInfo = sender
      ? {
          userId: sender.userId,
          fullName: sender.fullName,
          avatarUrl: sender.avatarUrl,
        }
      : {
          userId: senderId,
          fullName: "Unknown User",
          avatarUrl: null,
        }

    const messageData = {
      messageId: message.messageId,
      conversationId: message.conversationId,
      senderId: message.senderId,
      sender: senderInfo,
      type: message.type,
      content: message.content,
      createdAt: message.createdAt,
    }

    // Emit message to all participants in the conversation
    emitToConversation(req.io, conversationId, "new_message", messageData)

    res.status(201).json({
      message: "Message sent successfully",
      messageData,
    })
  } catch (error) {
    console.error("Error in sendTextMessage:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const sendEmojiMessage = async (req, res) => {
  try {
    const { conversationId, emoji } = req.body
    const senderId = req.user.userId

    if (!emoji) {
      return res.status(400).json({ message: "Emoji cannot be empty" })
    }

    const conversation = await getConversationById(conversationId)

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" })
    }

    if (!conversation.participants.includes(senderId)) {
      return res.status(403).json({ message: "You are not a participant in this conversation" })
    }

    let receiverId = null
    if (!conversation.isGroup) {
      receiverId = conversation.participants.find((id) => id !== senderId)

      if (!receiverId) {
        return res.status(400).json({ message: "Could not determine message recipient" })
      }
    }

    const message = await createMessage(conversationId, senderId, receiverId, "emoji", emoji)

    // Lấy thông tin người gửi
    const sender = await getUserById(senderId)
    const senderInfo = sender
      ? {
          userId: sender.userId,
          fullName: sender.fullName,
          avatarUrl: sender.avatarUrl,
        }
      : {
          userId: senderId,
          fullName: "Unknown User",
          avatarUrl: null,
        }

    const messageData = {
      messageId: message.messageId,
      conversationId: message.conversationId,
      senderId: message.senderId,
      sender: senderInfo,
      type: message.type,
      content: message.content,
      createdAt: message.createdAt,
    }

    // Emit message to all participants in the conversation
    emitToConversation(req.io, conversationId, "new_message", messageData)

    res.status(201).json({
      message: "Emoji sent successfully",
      messageData,
    })
  } catch (error) {
    console.error("Error in sendEmojiMessage:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const sendImageMessage = async (req, res) => {
  try {
    const { conversationId } = req.body
    const senderId = req.user.userId

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No images uploaded" })
    }

    const conversation = await getConversationById(conversationId)

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" })
    }

    if (!conversation.participants.includes(senderId)) {
      return res.status(403).json({ message: "You are not a participant in this conversation" })
    }

    let receiverId = null
    if (!conversation.isGroup) {
      receiverId = conversation.participants.find((id) => id !== senderId)

      if (!receiverId) {
        return res.status(400).json({ message: "Could not determine message recipient" })
      }
    }

    const attachments = await Promise.all(
      req.files.map(async (file) => {
        const result = await uploadImage(file.buffer, file.mimetype, "messages")
        return {
          url: result.url,
          type: file.mimetype,
          name: file.originalname,
          size: file.size,
        }
      }),
    )

    const messageType = attachments.length > 1 ? "imageGroup" : "image"

    const message = await createMessage(conversationId, senderId, receiverId, messageType, "", attachments)

    // Lấy thông tin người gửi
    const sender = await getUserById(senderId)
    const senderInfo = sender
      ? {
          userId: sender.userId,
          fullName: sender.fullName,
          avatarUrl: sender.avatarUrl,
        }
      : {
          userId: senderId,
          fullName: "Unknown User",
          avatarUrl: null,
        }

    const messageData = {
      messageId: message.messageId,
      conversationId: message.conversationId,
      senderId: message.senderId,
      sender: senderInfo,
      type: message.type,
      attachments: message.attachments,
      createdAt: message.createdAt,
    }

    // Emit message to all participants in the conversation
    emitToConversation(req.io, conversationId, "new_message", messageData)

    res.status(201).json({
      message: "Image(s) sent successfully",
      messageData,
    })
  } catch (error) {
    console.error("Error in sendImageMessage:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const sendFileMessage = async (req, res) => {
  try {
    const { conversationId } = req.body
    const senderId = req.user.userId

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" })
    }

    const conversation = await getConversationById(conversationId)

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" })
    }

    if (!conversation.participants.includes(senderId)) {
      return res.status(403).json({ message: "You are not a participant in this conversation" })
    }

    let receiverId = null
    if (!conversation.isGroup) {
      receiverId = conversation.participants.find((id) => id !== senderId)

      if (!receiverId) {
        return res.status(400).json({ message: "Could not determine message recipient" })
      }
    }

    const result = await uploadImage(req.file.buffer, req.file.mimetype, "files")

    const attachments = [
      {
        url: result.url,
        type: req.file.mimetype,
        name: req.file.originalname,
        size: req.file.size,
      },
    ]

    const message = await createMessage(conversationId, senderId, receiverId, "file", "", attachments)

    // Lấy thông tin người gửi
    const sender = await getUserById(senderId)
    const senderInfo = sender
      ? {
          userId: sender.userId,
          fullName: sender.fullName,
          avatarUrl: sender.avatarUrl,
        }
      : {
          userId: senderId,
          fullName: "Unknown User",
          avatarUrl: null,
        }

    const messageData = {
      messageId: message.messageId,
      conversationId: message.conversationId,
      senderId: message.senderId,
      sender: senderInfo,
      type: message.type,
      attachments: message.attachments,
      createdAt: message.createdAt,
    }

    // Emit message to all participants in the conversation
    emitToConversation(req.io, conversationId, "new_message", messageData)

    res.status(201).json({
      message: "File sent successfully",
      messageData,
    })
  } catch (error) {
    console.error("Error in sendFileMessage:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const sendVideoMessage = async (req, res) => {
  try {
    const { conversationId } = req.body
    const senderId = req.user.userId

    if (!req.file) {
      return res.status(400).json({ message: "No video uploaded" })
    }

    if (!req.file.mimetype.startsWith("video/")) {
      return res.status(400).json({ message: "Uploaded file is not a video" })
    }

    const conversation = await getConversationById(conversationId)

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" })
    }

    if (!conversation.participants.includes(senderId)) {
      return res.status(403).json({ message: "You are not a participant in this conversation" })
    }

    let receiverId = null
    if (!conversation.isGroup) {
      receiverId = conversation.participants.find((id) => id !== senderId)

      if (!receiverId) {
        return res.status(400).json({ message: "Could not determine message recipient" })
      }
    }

    const result = await uploadImage(req.file.buffer, req.file.mimetype, "videos")

    const attachments = [
      {
        url: result.url,
        type: req.file.mimetype,
        name: req.file.originalname,
        size: req.file.size,
      },
    ]

    const message = await createMessage(conversationId, senderId, receiverId, "video", "", attachments)

    // Lấy thông tin người gửi
    const sender = await getUserById(senderId)
    const senderInfo = sender
      ? {
          userId: sender.userId,
          fullName: sender.fullName,
          avatarUrl: sender.avatarUrl,
        }
      : {
          userId: senderId,
          fullName: "Unknown User",
          avatarUrl: null,
        }

    const messageData = {
      messageId: message.messageId,
      conversationId: message.conversationId,
      senderId: message.senderId,
      sender: senderInfo,
      type: message.type,
      attachments: message.attachments,
      createdAt: message.createdAt,
    }

    // Emit message to all participants in the conversation
    emitToConversation(req.io, conversationId, "new_message", messageData)

    res.status(201).json({
      message: "Video sent successfully",
      messageData,
    })
  } catch (error) {
    console.error("Error in sendVideoMessage:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const markAsRead = async (req, res) => {
  try {
    const { messageId } = req.params
    const userId = req.user.userId

    const message = await getMessageById(messageId)

    if (!message) {
      return res.status(404).json({ message: "Message not found" })
    }

    // Kiểm tra xem người dùng có phải là người nhận tin nhắn không (cho chat 1-1)
    // Hoặc là thành viên của nhóm (cho chat nhóm)
    const conversation = await getConversationById(message.conversationId)

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" })
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: "You are not a participant in this conversation" })
    }

    // Không đánh dấu đã đọc tin nhắn của chính mình
    if (message.senderId === userId) {
      return res.status(400).json({ message: "Cannot mark your own message as read" })
    }

    const updatedMessage = await markMessageAsRead(messageId, userId)

    if (!updatedMessage) {
      return res.status(400).json({ message: "Message already marked as read or not found" })
    }

    // Emit read status to sender
    emitToUser(req.io, message.senderId, "message_read", {
      messageId,
      conversationId: message.conversationId,
      readBy: {
        userId,
        readAt: new Date(),
      },
    })

    res.status(200).json({
      message: "Message marked as read",
      messageData: {
        messageId: updatedMessage.messageId,
        readBy: updatedMessage.readBy,
      },
    })
  } catch (error) {
    console.error("Error in markAsRead:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const deleteUserMessage = async (req, res) => {
  try {
    const { messageId } = req.params
    const userId = req.user.userId

    const message = await getMessageById(messageId)
    if (!message) {
      return res.status(404).json({ message: "Message not found" })
    }

    const deletedMessage = await deleteMessage(messageId, userId)

    // Notify all participants in the conversation about the deleted message
    emitToConversation(req.io, message.conversationId, "message_deleted", {
      messageId: deletedMessage.messageId,
      conversationId: message.conversationId,
      isDeleted: deletedMessage.isDeleted,
    })

    res.status(200).json({
      message: "Message deleted successfully",
      messageData: {
        messageId: deletedMessage.messageId,
        isDeleted: deletedMessage.isDeleted,
      },
    })
  } catch (error) {
    console.error("Error in deleteUserMessage:", error)

    if (error.message === "Message not found" || error.message === "You can only delete your own messages") {
      return res.status(403).json({ message: error.message })
    }

    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const recallUserMessage = async (req, res) => {
  try {
    const { messageId } = req.params
    const userId = req.user.userId

    const message = await getMessageById(messageId)
    if (!message) {
      return res.status(404).json({ message: "Message not found" })
    }

    const recalledMessage = await recallMessage(messageId, userId)

    // Notify all participants in the conversation about the recalled message
    emitToConversation(req.io, message.conversationId, "message_recalled", {
      messageId: recalledMessage.messageId,
      conversationId: message.conversationId,
      isRecalled: recalledMessage.isRecalled,
    })

    res.status(200).json({
      message: "Message recalled successfully",
      messageData: {
        messageId: recalledMessage.messageId,
        isRecalled: recalledMessage.isRecalled,
      },
    })
  } catch (error) {
    console.error("Error in recallUserMessage:", error)

    if (
      error.message === "Message not found" ||
      error.message === "You can only recall your own messages" ||
      error.message === "Messages can only be recalled within 1 hour of sending"
    ) {
      return res.status(403).json({ message: error.message })
    }

    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const forwardUserMessage = async (req, res) => {
  try {
    const { messageId, conversationId } = req.body
    const senderId = req.user.userId

    const conversation = await getConversationById(conversationId)

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" })
    }

    if (!conversation.participants.includes(senderId)) {
      return res.status(403).json({ message: "You are not a participant in this conversation" })
    }

    let receiverId = null
    if (!conversation.isGroup) {
      receiverId = conversation.participants.find((id) => id !== senderId)
    }

    const forwardedMessage = await forwardMessage(messageId, conversationId, senderId, receiverId)

    // Lấy thông tin người gửi
    const sender = await getUserById(senderId)
    const senderInfo = sender
      ? {
          userId: sender.userId,
          fullName: sender.fullName,
          avatarUrl: sender.avatarUrl,
        }
      : {
          userId: senderId,
          fullName: "Unknown User",
          avatarUrl: null,
        }

    const messageData = {
      messageId: forwardedMessage.messageId,
      conversationId: forwardedMessage.conversationId,
      senderId: forwardedMessage.senderId,
      sender: senderInfo,
      type: forwardedMessage.type,
      content: forwardedMessage.content,
      attachments: forwardedMessage.attachments,
      forwardedFrom: forwardedMessage.forwardedFrom,
      createdAt: forwardedMessage.createdAt,
    }

    // Emit forwarded message to all participants in the conversation
    emitToConversation(req.io, conversationId, "new_message", messageData)

    res.status(201).json({
      message: "Message forwarded successfully",
      messageData,
    })
  } catch (error) {
    console.error("Error in forwardUserMessage:", error)

    if (
      error.message === "Original message not found" ||
      error.message === "Cannot forward a deleted or recalled message"
    ) {
      return res.status(400).json({ message: error.message })
    }

    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.userId

    const count = await getUnreadMessageCount(userId)

    res.status(200).json({
      unreadCount: count,
    })
  } catch (error) {
    console.error("Error in getUnreadCount:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Gửi tin nhắn trả lời
export const sendReplyMessage = async (req, res) => {
  try {
    const { conversationId, replyToMessageId, content } = req.body
    const senderId = req.user.userId

    if (!content || content.trim() === "") {
      return res.status(400).json({ message: "Message content cannot be empty" })
    }

    if (!replyToMessageId) {
      return res.status(400).json({ message: "Reply message ID is required" })
    }

    const conversation = await getConversationById(conversationId)

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" })
    }

    if (!conversation.participants.includes(senderId)) {
      return res.status(403).json({ message: "You are not a participant in this conversation" })
    }

    const message = await createReplyMessage(conversationId, senderId, replyToMessageId, content)

    // Lấy thông tin người gửi
    const sender = await getUserById(senderId)
    const senderInfo = sender
      ? {
          userId: sender.userId,
          fullName: sender.fullName,
          avatarUrl: sender.avatarUrl,
        }
      : {
          userId: senderId,
          fullName: "Unknown User",
          avatarUrl: null,
        }

    // Lấy thông tin tin nhắn gốc
    const originalMessage = await getMessageById(replyToMessageId)
    const originalSender = originalMessage ? await getUserById(originalMessage.senderId) : null

    const replyToInfo = originalMessage
      ? {
          messageId: originalMessage.messageId,
          content: originalMessage.content,
          type: originalMessage.type,
          attachments: originalMessage.attachments,
          sender: originalSender
            ? {
                userId: originalSender.userId,
                fullName: originalSender.fullName,
              }
            : {
                userId: originalMessage.senderId,
                fullName: "Unknown User",
              },
        }
      : null

    const messageData = {
      messageId: message.messageId,
      conversationId: message.conversationId,
      senderId: message.senderId,
      sender: senderInfo,
      type: message.type,
      content: message.content,
      replyTo: replyToInfo,
      createdAt: message.createdAt,
    }

    // Emit reply message to all participants in the conversation
    emitToConversation(req.io, conversationId, "new_message", messageData)

    res.status(201).json({
      message: "Reply sent successfully",
      messageData,
    })
  } catch (error) {
    console.error("Error in sendReplyMessage:", error)

    if (error.message === "Original message not found") {
      return res.status(404).json({ message: error.message })
    }

    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Gửi tin nhắn với đề cập
export const sendMessageWithMention = async (req, res) => {
  try {
    const { conversationId, content, mentions } = req.body
    const senderId = req.user.userId

    if (!content || content.trim() === "") {
      return res.status(400).json({ message: "Message content cannot be empty" })
    }

    if (!mentions || !Array.isArray(mentions) || mentions.length === 0) {
      return res.status(400).json({ message: "Mentions are required" })
    }

    const conversation = await getConversationById(conversationId)

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" })
    }

    if (!conversation.participants.includes(senderId)) {
      return res.status(403).json({ message: "You are not a participant in this conversation" })
    }

    // Kiểm tra xem những người được đề cập có trong cuộc trò chuyện không
    const validMentions = []
    for (const mention of mentions) {
      if (conversation.participants.includes(mention.userId)) {
        validMentions.push(mention)
      }
    }

    const message = await createMessageWithMentions(conversationId, senderId, content, validMentions)

    // Lấy thông tin người gửi
    const sender = await getUserById(senderId)
    const senderInfo = sender
      ? {
          userId: sender.userId,
          fullName: sender.fullName,
          avatarUrl: sender.avatarUrl,
        }
      : {
          userId: senderId,
          fullName: "Unknown User",
          avatarUrl: null,
        }

    const messageData = {
      messageId: message.messageId,
      conversationId: message.conversationId,
      senderId: message.senderId,
      sender: senderInfo,
      type: message.type,
      content: message.content,
      mentions: message.mentions,
      createdAt: message.createdAt,
    }

    // Emit message to all participants in the conversation
    emitToConversation(req.io, conversationId, "new_message", messageData)

    // Send special notification to mentioned users
    validMentions.forEach((mention) => {
      emitToUser(req.io, mention.userId, "mention", {
        ...messageData,
        mentionedBy: senderInfo,
      })
    })

    res.status(201).json({
      message: "Message with mentions sent successfully",
      messageData,
    })
  } catch (error) {
    console.error("Error in sendMessageWithMention:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
