import mongoose from "mongoose"
import { v4 as uuidv4 } from "uuid"


const friendRequestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
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
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    message: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
)

const friendshipSchema = new mongoose.Schema(
  {
    friendshipId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    user1Id: {
      type: String,
      required: true,
      ref: "User",
    },
    user2Id: {
      type: String,
      required: true,
      ref: "User",
    },
    lastInteractionAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
)


friendshipSchema.index({ user1Id: 1, user2Id: 1 })

friendRequestSchema.index({ senderId: 1, receiverId: 1 })

export const FriendRequest = mongoose.model("FriendRequest", friendRequestSchema)
export const Friendship = mongoose.model("Friendship", friendshipSchema)


export const createFriendRequest = async (senderId, receiverId, message = "") => {
  try {
    const existingFriendship = await Friendship.findOne({
      $or: [
        { user1Id: senderId, user2Id: receiverId },
        { user1Id: receiverId, user2Id: senderId },
      ],
    })

    if (existingFriendship) {
      throw new Error("Users are already friends")
    }

    const existingRequest = await FriendRequest.findOne({
      $or: [
        { senderId, receiverId, status: "pending" },
        { senderId: receiverId, receiverId: senderId, status: "pending" },
      ],
    })

    if (existingRequest) {
      if (existingRequest.senderId === senderId) {
        throw new Error("Friend request already sent")
      } else {
        throw new Error("You already have a pending request from this user")
      }
    }

    const friendRequest = new FriendRequest({
      senderId,
      receiverId,
      message,
    })

    await friendRequest.save()
    return friendRequest
  } catch (error) {
    console.error("Error creating friend request:", error)
    throw error
  }
}

export const getFriendRequestById = async (requestId) => {
  try {
    return await FriendRequest.findOne({ requestId })
  } catch (error) {
    console.error("Error getting friend request:", error)
    throw error
  }
}

export const getFriendRequests = async (userId, status = "pending") => {
  try {
    return await FriendRequest.find({
      receiverId: userId,
      status,
    }).sort({ createdAt: -1 })
  } catch (error) {
    console.error("Error getting friend requests:", error)
    throw error
  }
}

export const getSentFriendRequests = async (userId, status = "pending") => {
  try {
    return await FriendRequest.find({
      senderId: userId,
      status,
    }).sort({ createdAt: -1 })
  } catch (error) {
    console.error("Error getting sent friend requests:", error)
    throw error
  }
}

export const updateFriendRequestStatus = async (requestId, status) => {
  try {
    const request = await FriendRequest.findOneAndUpdate({ requestId }, { status }, { new: true })

    if (!request) {
      throw new Error("Friend request not found")
    }

    if (status === "accepted") {
      await createFriendship(request.senderId, request.receiverId)
    }

    return request
  } catch (error) {
    console.error("Error updating friend request:", error)
    throw error
  }
}

export const createFriendship = async (user1Id, user2Id) => {
  try {
    const [sortedUser1, sortedUser2] = [user1Id, user2Id].sort()

    const friendship = new Friendship({
      user1Id: sortedUser1,
      user2Id: sortedUser2,
    })

    await friendship.save()
    return friendship
  } catch (error) {
    console.error("Error creating friendship:", error)
    throw error
  }
}

export const getFriendships = async (userId) => {
  try {
    return await Friendship.find({
      $or: [{ user1Id: userId }, { user2Id: userId }],
    }).sort({ lastInteractionAt: -1 })
  } catch (error) {
    console.error("Error getting friendships:", error)
    throw error
  }
}

export const getFriendship = async (user1Id, user2Id) => {
  try {
    return await Friendship.findOne({
      $or: [
        { user1Id: user1Id, user2Id: user2Id },
        { user1Id: user2Id, user2Id: user1Id },
      ],
    })
  } catch (error) {
    console.error("Error getting friendship:", error)
    throw error
  }
}

export const updateFriendshipLastInteraction = async (user1Id, user2Id) => {
  try {
    const [sortedUser1, sortedUser2] = [user1Id, user2Id].sort()

    return await Friendship.findOneAndUpdate(
      {
        user1Id: sortedUser1,
        user2Id: sortedUser2,
      },
      { lastInteractionAt: new Date() },
      { new: true },
    )
  } catch (error) {
    console.error("Error updating friendship last interaction:", error)
    throw error
  }
}

export const deleteFriendship = async (user1Id, user2Id) => {
  try {
    return await Friendship.findOneAndDelete({
      $or: [
        { user1Id: user1Id, user2Id: user2Id },
        { user1Id: user2Id, user2Id: user1Id },
      ],
    })
  } catch (error) {
    console.error("Error deleting friendship:", error)
    throw error
  }
}

export const checkFriendship = async (user1Id, user2Id) => {
  try {
    const friendship = await getFriendship(user1Id, user2Id)
    return !!friendship
  } catch (error) {
    console.error("Error checking friendship:", error)
    throw error
  }
}
