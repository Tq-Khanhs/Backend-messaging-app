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
  } from "../models/messageModel.js"
  import { checkFriendship } from "../models/friendModel.js"
  import { getUserById } from "../models/userModel.js"
  import { uploadImage } from "../services/supabaseStorageService.js"
  
  export const getConversations = async (req, res) => {
    try {
      const userId = req.user.userId
  
      const conversations = await getUserConversations(userId)

      const conversationsWithDetails = await Promise.all(
        conversations.map(async (conversation) => {

          const otherParticipantId = conversation.participants.find((id) => id !== userId)
          const otherParticipant = await getUserById(otherParticipantId)
  
          let lastMessage = null
          if (conversation.lastMessageId) {
            lastMessage = await getMessageById(conversation.lastMessageId)
          }
  
        
          const unreadCount = await getUnreadMessageCount(userId, conversation.conversationId)
  
          return {
            conversationId: conversation.conversationId,
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
        }),
      )
  
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
  

      await markConversationAsRead(conversationId, userId)
  
      res.status(200).json({
        message: "Messages retrieved successfully",
        messages: messages.map((msg) => ({
          messageId: msg.messageId,
          senderId: msg.senderId,
          type: msg.type,
          content: msg.content,
          attachments: msg.attachments,
          isDeleted: msg.isDeleted,
          isRecalled: msg.isRecalled,
          readAt: msg.readAt,
          createdAt: msg.createdAt,
          forwardedFrom: msg.forwardedFrom,
        })),
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
  
      res.status(200).json({
        message: "Conversation retrieved successfully",
        conversation: {
          conversationId: conversation.conversationId,
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
  
      const receiverId = conversation.participants.find((id) => id !== senderId)
  
      const message = await createMessage(conversationId, senderId, receiverId, "text", content)
  
      res.status(201).json({
        message: "Message sent successfully",
        messageData: {
          messageId: message.messageId,
          conversationId: message.conversationId,
          senderId: message.senderId,
          type: message.type,
          content: message.content,
          createdAt: message.createdAt,
        },
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
  
      const receiverId = conversation.participants.find((id) => id !== senderId)

      const message = await createMessage(conversationId, senderId, receiverId, "emoji", emoji)
  
      res.status(201).json({
        message: "Emoji sent successfully",
        messageData: {
          messageId: message.messageId,
          conversationId: message.conversationId,
          senderId: message.senderId,
          type: message.type,
          content: message.content,
          createdAt: message.createdAt,
        },
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

      const receiverId = conversation.participants.find((id) => id !== senderId)
  

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
  
      res.status(201).json({
        message: "Image(s) sent successfully",
        messageData: {
          messageId: message.messageId,
          conversationId: message.conversationId,
          senderId: message.senderId,
          type: message.type,
          attachments: message.attachments,
          createdAt: message.createdAt,
        },
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
  

      const receiverId = conversation.participants.find((id) => id !== senderId)

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
  
      res.status(201).json({
        message: "File sent successfully",
        messageData: {
          messageId: message.messageId,
          conversationId: message.conversationId,
          senderId: message.senderId,
          type: message.type,
          attachments: message.attachments,
          createdAt: message.createdAt,
        },
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
  

      const receiverId = conversation.participants.find((id) => id !== senderId)
  

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
  
      res.status(201).json({
        message: "Video sent successfully",
        messageData: {
          messageId: message.messageId,
          conversationId: message.conversationId,
          senderId: message.senderId,
          type: message.type,
          attachments: message.attachments,
          createdAt: message.createdAt,
        },
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
  
      if (message.receiverId !== userId) {
        return res.status(403).json({ message: "You can only mark messages sent to you as read" })
      }
  
      const updatedMessage = await markMessageAsRead(messageId)
  
      res.status(200).json({
        message: "Message marked as read",
        messageData: {
          messageId: updatedMessage.messageId,
          readAt: updatedMessage.readAt,
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
  
      const deletedMessage = await deleteMessage(messageId, userId)
  
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
  
      const recalledMessage = await recallMessage(messageId, userId)
  
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
  
      const receiverId = conversation.participants.find((id) => id !== senderId)
  
      const forwardedMessage = await forwardMessage(messageId, conversationId, senderId, receiverId)
  
      res.status(201).json({
        message: "Message forwarded successfully",
        messageData: {
          messageId: forwardedMessage.messageId,
          conversationId: forwardedMessage.conversationId,
          senderId: forwardedMessage.senderId,
          type: forwardedMessage.type,
          content: forwardedMessage.content,
          attachments: forwardedMessage.attachments,
          forwardedFrom: forwardedMessage.forwardedFrom,
          createdAt: forwardedMessage.createdAt,
        },
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
  