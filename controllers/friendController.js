import {
  createFriendRequest,
  getFriendRequestById,
  getFriendRequests,
  getSentFriendRequests,
  updateFriendRequestStatus,
  getFriendships,
  deleteFriendship,
  checkFriendship,
  FriendRequest, // Import FriendRequest
} from "../models/friendModel.js"
import { getUserById } from "../models/userModel.js"
import { emitToUser } from "../socket/socketManager.js"
import { getOrCreateConversation } from "../models/messageModel.js"
import { createSystemMessage } from "../models/messageModel.js"

export const sendFriendRequest = async (req, res) => {
  try {
    const { receiverId, message } = req.body
    const senderId = req.user.userId

    if (senderId === receiverId) {
      return res.status(400).json({ message: "You cannot send a friend request to yourself" })
    }

    const receiver = await getUserById(receiverId)
    if (!receiver) {
      return res.status(404).json({ message: "User not found" })
    }

    const friendRequest = await createFriendRequest(senderId, receiverId, message)

    // Get sender details for notification
    const sender = await getUserById(senderId)
    const senderInfo = {
      userId: sender.userId,
      fullName: sender.fullName,
      avatarUrl: sender.avatarUrl,
    }

    // Emit friend request notification to receiver
    emitToUser(req.io, receiverId, "friend_request", {
      requestId: friendRequest.requestId,
      sender: senderInfo,
      message: friendRequest.message,
      status: friendRequest.status,
      createdAt: friendRequest.createdAt,
    })

    res.status(201).json({
      message: "Friend request sent successfully",
      friendRequest: {
        requestId: friendRequest.requestId,
        senderId: friendRequest.senderId,
        receiverId: friendRequest.receiverId,
        status: friendRequest.status,
        message: friendRequest.message,
        createdAt: friendRequest.createdAt,
      },
    })
  } catch (error) {
    console.error("Error in sendFriendRequest:", error)

    if (
      error.message === "Friend request already sent" ||
      error.message === "You already have a pending request from this user" ||
      error.message === "Users are already friends"
    ) {
      return res.status(400).json({ message: error.message })
    }

    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getReceivedFriendRequests = async (req, res) => {
  try {
    const userId = req.user.userId
    const status = req.query.status || "pending"

    const friendRequests = await getFriendRequests(userId, status)

    const requestsWithSenderDetails = await Promise.all(
      friendRequests.map(async (request) => {
        const sender = await getUserById(request.senderId)
        return {
          requestId: request.requestId,
          sender: {
            userId: sender.userId,
            fullName: sender.fullName,
            avatarUrl: sender.avatarUrl,
          },
          message: request.message,
          status: request.status,
          createdAt: request.createdAt,
        }
      }),
    )

    res.status(200).json({
      message: "Friend requests retrieved successfully",
      friendRequests: requestsWithSenderDetails,
    })
  } catch (error) {
    console.error("Error in getReceivedFriendRequests:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getSentRequests = async (req, res) => {
  try {
    const userId = req.user.userId
    const status = req.query.status || "pending"

    const friendRequests = await getSentFriendRequests(userId, status)

    const requestsWithReceiverDetails = await Promise.all(
      friendRequests.map(async (request) => {
        const receiver = await getUserById(request.receiverId)
        return {
          requestId: request.requestId,
          receiver: {
            userId: receiver.userId,
            fullName: receiver.fullName,
            avatarUrl: receiver.avatarUrl,
          },
          message: request.message,
          status: request.status,
          createdAt: request.createdAt,
        }
      }),
    )

    res.status(200).json({
      message: "Sent friend requests retrieved successfully",
      friendRequests: requestsWithReceiverDetails,
    })
  } catch (error) {
    console.error("Error in getSentRequests:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const respondToFriendRequest = async (req, res) => {
  try {
    const { requestId, action } = req.body
    const userId = req.user.userId

    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({ message: "Invalid action. Use 'accept' or 'reject'" })
    }

    const friendRequest = await getFriendRequestById(requestId)

    if (!friendRequest) {
      return res.status(404).json({ message: "Friend request not found" })
    }

    if (friendRequest.receiverId !== userId) {
      return res.status(403).json({ message: "You can only respond to your own friend requests" })
    }
    if (friendRequest.status !== "pending") {
      return res.status(400).json({ message: "This friend request has already been processed" })
    }

    const status = action === "accept" ? "accepted" : "rejected"
    const updatedRequest = await updateFriendRequestStatus(requestId, status)
    
    if (action === "accept") {
      try {
        
        const conversation = await getOrCreateConversation(friendRequest.senderId, friendRequest.receiverId)
        const systemMessageContent = `You are now friends.`
        await createSystemMessage(conversation.conversationId, systemMessageContent)
        console.log(`Created conversation between ${friendRequest.senderId} and ${friendRequest.receiverId}`)
      } catch (conversationError) {
        console.error("Error creating conversation after friend request acceptance:", conversationError)
      }
    }
    const receiver = await getUserById(userId)
    const receiverInfo = {
      userId: receiver.userId,
      fullName: receiver.fullName,
      avatarUrl: receiver.avatarUrl,
    }
    emitToUser(req.io, friendRequest.senderId, "friend_request_response", {
      requestId: updatedRequest.requestId,
      receiver: receiverInfo,
      status: updatedRequest.status,
      action,
    })

    emitToUser(req.io, receiver.userId, "friend_request_response", {
      requestId: updatedRequest.requestId,
      receiver: receiverInfo,
      status: updatedRequest.status,
      action,
    })

    res.status(200).json({
      message: `Friend request ${status} successfully`,
      friendRequest: {
        requestId: updatedRequest.requestId,
        senderId: updatedRequest.senderId,
        receiverId: updatedRequest.receiverId,
        status: updatedRequest.status,
      },
    })
  } catch (error) {
    console.error("Error in respondToFriendRequest:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getFriends = async (req, res) => {
  try {
    const userId = req.user.userId

    const friendships = await getFriendships(userId)

    const friends = await Promise.all(
      friendships.map(async (friendship) => {
        const friendId = friendship.user1Id === userId ? friendship.user2Id : friendship.user1Id
        const friend = await getUserById(friendId)

        return {
          friendshipId: friendship.friendshipId,
          userId: friend.userId,
          fullName: friend.fullName,
          avatarUrl: friend.avatarUrl,
          lastInteractionAt: friendship.lastInteractionAt,
        }
      }),
    )

    res.status(200).json({
      message: "Friends retrieved successfully",
      friends,
    })
  } catch (error) {
    console.error("Error in getFriends:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const removeFriend = async (req, res) => {
  try {
    const { friendId } = req.params
    const userId = req.user.userId

    if (userId === friendId) {
      return res.status(400).json({ message: "Invalid operation" })
    }
    const areFriends = await checkFriendship(userId, friendId)

    if (!areFriends) {
      return res.status(404).json({ message: "Friendship not found" })
    }

    await deleteFriendship(userId, friendId)

    // Emit friend removal notification to the removed friend
    emitToUser(req.io, friendId, "friend_removed", {
      userId,
    })

    res.status(200).json({
      message: "Friend removed successfully",
    })
  } catch (error) {
    console.error("Error in removeFriend:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const checkFriendshipStatus = async (req, res) => {
  try {
    const { userId } = req.params
    const currentUserId = req.user.userId

    if (currentUserId === userId) {
      return res.status(400).json({ message: "Cannot check friendship status with yourself" })
    }

    const user = await getUserById(userId)
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }
    const areFriends = await checkFriendship(currentUserId, userId)

    if (areFriends) {
      return res.status(200).json({
        status: "friends",
      })
    }

    const sentRequest = await getSentFriendRequests(currentUserId)
    const sentPending = sentRequest.find((req) => req.receiverId === userId && req.status === "pending")

    if (sentPending) {
      return res.status(200).json({
        status: "request_sent",
        requestId: sentPending.requestId,
      })
    }

    const receivedRequest = await getFriendRequests(currentUserId)
    const receivedPending = receivedRequest.find((req) => req.senderId === userId && req.status === "pending")

    if (receivedPending) {
      return res.status(200).json({
        status: "request_received",
        requestId: receivedPending.requestId,
      })
    }

    res.status(200).json({
      status: "not_friends",
    })
  } catch (error) {
    console.error("Error in checkFriendshipStatus:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const cancelFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params
    const userId = req.user.userId

    const friendRequest = await getFriendRequestById(requestId)

    if (!friendRequest) {
      return res.status(404).json({ message: "Friend request not found" })
    }

    if (friendRequest.senderId !== userId) {
      return res.status(403).json({ message: "You can only cancel your own friend requests" })
    }

    if (friendRequest.status !== "pending") {
      return res.status(400).json({ message: "Only pending friend requests can be canceled" })
    }

    await FriendRequest.deleteOne({ requestId })

    // Emit friend request cancellation notification to receiver
    emitToUser(req.io, friendRequest.receiverId, "friend_request_canceled", {
      requestId: friendRequest.requestId,
      senderId: userId,
    })

    res.status(200).json({
      message: "Friend request canceled successfully",
      requestId: friendRequest.requestId,
    })
  } catch (error) {
    console.error("Error in cancelFriendRequest:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
