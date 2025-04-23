import mongoose from "mongoose"
import { v4 as uuidv4 } from "uuid"

// Định nghĩa các vai trò trong nhóm
export const GROUP_ROLES = {
  ADMIN: "admin",
  MODERATOR: "moderator",
  MEMBER: "member",
}

// Schema cho thành viên nhóm
const groupMemberSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    ref: "User",
  },
  role: {
    type: String,
    enum: Object.values(GROUP_ROLES),
    default: GROUP_ROLES.MEMBER,
  },
  addedBy: {
    type: String,
    ref: "User",
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
  lastReadMessageId: {
    type: String,
    default: null,
  },
})

// Schema chính cho nhóm
const groupSchema = new mongoose.Schema(
  {
    groupId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    avatarUrl: {
      type: String,
      default: null,
    },
    createdBy: {
      type: String,
      required: true,
      ref: "User",
    },
    conversationId: {
      type: String,
      required: true,
      unique: true,
    },
    members: [groupMemberSchema],
    isActive: {
      type: Boolean,
      default: true,
    },
    settings: {
      allowMembersToInvite: {
        type: Boolean,
        default: true,
      },
      allowMembersToChangeInfo: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
  },
)

// Indexes
groupSchema.index({ name: "text" })
groupSchema.index({ "members.userId": 1 })

export const Group = mongoose.model("Group", groupSchema)

// Tạo nhóm mới
export const createGroup = async (name, description, createdBy, members = [], avatarUrl = null) => {
  try {
    // Tạo conversation cho nhóm
    const Conversation = mongoose.model("Conversation")
    const conversation = new Conversation({
      conversationId: uuidv4(),
      participants: [createdBy, ...members.map((member) => member.userId)],
      isGroup: true,
      lastMessageAt: new Date(),
    })
    await conversation.save()

    // Thêm người tạo nhóm vào danh sách thành viên với vai trò admin
    const groupMembers = [
      {
        userId: createdBy,
        role: GROUP_ROLES.ADMIN,
        addedBy: createdBy,
        addedAt: new Date(),
      },
    ]

    // Thêm các thành viên khác
    members.forEach((member) => {
      groupMembers.push({
        userId: member.userId,
        role: member.role || GROUP_ROLES.MEMBER,
        addedBy: createdBy,
        addedAt: new Date(),
      })
    })

    // Tạo nhóm
    const group = new Group({
      name,
      description,
      avatarUrl,
      createdBy,
      conversationId: conversation.conversationId,
      members: groupMembers,
    })

    await group.save()
    return group
  } catch (error) {
    console.error("Error creating group:", error)
    throw error
  }
}

// Lấy thông tin nhóm theo ID
export const getGroupById = async (groupId) => {
  try {
    return await Group.findOne({ groupId, isActive: true })
  } catch (error) {
    console.error("Error getting group by ID:", error)
    throw error
  }
}

// Lấy thông tin nhóm theo ID cuộc trò chuyện
export const getGroupByConversationId = async (conversationId) => {
  try {
    return await Group.findOne({ conversationId, isActive: true })
  } catch (error) {
    console.error("Error getting group by conversation ID:", error)
    throw error
  }
}

// Lấy danh sách nhóm của người dùng
export const getUserGroups = async (userId) => {
  try {
    return await Group.find({
      "members.userId": userId,
      isActive: true,
    }).sort({ updatedAt: -1 })
  } catch (error) {
    console.error("Error getting user groups:", error)
    throw error
  }
}

// Thêm thành viên vào nhóm
export const addGroupMember = async (groupId, userId, addedBy, role = GROUP_ROLES.MEMBER) => {
  try {
    const group = await Group.findOne({ groupId, isActive: true })

    if (!group) {
      throw new Error("Group not found")
    }

    // Kiểm tra xem người dùng đã là thành viên chưa
    const existingMember = group.members.find((member) => member.userId === userId)
    if (existingMember) {
      throw new Error("User is already a member of this group")
    }

    // Thêm người dùng vào nhóm
    group.members.push({
      userId,
      role,
      addedBy,
      addedAt: new Date(),
    })

    // Cập nhật conversation
    const Conversation = mongoose.model("Conversation")
    await Conversation.updateOne({ conversationId: group.conversationId }, { $addToSet: { participants: userId } })

    await group.save()
    return group
  } catch (error) {
    console.error("Error adding group member:", error)
    throw error
  }
}

// Xóa thành viên khỏi nhóm
export const removeGroupMember = async (groupId, userId, removedBy) => {
  try {
    const group = await Group.findOne({ groupId, isActive: true })

    if (!group) {
      throw new Error("Group not found")
    }

    // Kiểm tra xem người dùng có phải là thành viên không
    const memberIndex = group.members.findIndex((member) => member.userId === userId)
    if (memberIndex === -1) {
      throw new Error("User is not a member of this group")
    }

    // Kiểm tra xem người bị xóa có phải l�� admin duy nhất không
    if (group.members[memberIndex].role === GROUP_ROLES.ADMIN) {
      const adminCount = group.members.filter((member) => member.role === GROUP_ROLES.ADMIN).length
      if (adminCount === 1) {
        throw new Error("Cannot remove the only admin from the group")
      }
    }

    // Xóa người dùng khỏi nhóm
    group.members.splice(memberIndex, 1)

    // Cập nhật conversation
    const Conversation = mongoose.model("Conversation")
    await Conversation.updateOne({ conversationId: group.conversationId }, { $pull: { participants: userId } })

    await group.save()
    return group
  } catch (error) {
    console.error("Error removing group member:", error)
    throw error
  }
}

// Cập nhật vai trò của thành viên
export const updateMemberRole = async (groupId, userId, newRole, updatedBy) => {
  try {
    const group = await Group.findOne({ groupId, isActive: true })

    if (!group) {
      throw new Error("Group not found")
    }

    // Kiểm tra xem người dùng có phải là thành viên không
    const memberIndex = group.members.findIndex((member) => member.userId === userId)
    if (memberIndex === -1) {
      throw new Error("User is not a member of this group")
    }

    // Kiểm tra nếu đây là admin cuối cùng và đang bị hạ cấp
    if (group.members[memberIndex].role === GROUP_ROLES.ADMIN && newRole !== GROUP_ROLES.ADMIN) {
      const adminCount = group.members.filter((member) => member.role === GROUP_ROLES.ADMIN).length
      if (adminCount === 1) {
        throw new Error("Cannot demote the only admin of the group")
      }
    }

    // Cập nhật vai trò
    group.members[memberIndex].role = newRole

    await group.save()
    return group
  } catch (error) {
    console.error("Error updating member role:", error)
    throw error
  }
}

// Cập nhật thông tin nhóm
export const updateGroupInfo = async (groupId, updateData) => {
  try {
    const allowedFields = ["name", "description", "avatarUrl", "settings"]
    const updateFields = {}

    // Lọc các trường được phép cập nhật
    Object.keys(updateData).forEach((key) => {
      if (allowedFields.includes(key)) {
        updateFields[key] = updateData[key]
      }
    })

    const group = await Group.findOneAndUpdate({ groupId, isActive: true }, { $set: updateFields }, { new: true })

    if (!group) {
      throw new Error("Group not found")
    }

    return group
  } catch (error) {
    console.error("Error updating group info:", error)
    throw error
  }
}

// Giải tán nhóm
export const dissolveGroup = async (groupId, userId) => {
  try {
    const group = await Group.findOne({ groupId, isActive: true })

    if (!group) {
      throw new Error("Group not found")
    }

    // Kiểm tra xem người dùng có phải là admin không
    const member = group.members.find((member) => member.userId === userId)
    if (!member || member.role !== GROUP_ROLES.ADMIN) {
      throw new Error("Only group admin can dissolve the group")
    }

    // Đánh dấu nhóm không còn hoạt động
    group.isActive = false
    await group.save()

    // Xóa conversation của nhóm
    const Conversation = mongoose.model("Conversation")
    await Conversation.deleteOne({ conversationId: group.conversationId })
    console.log(`Deleted conversation ${group.conversationId} for dissolved group ${groupId}`)

    return { success: true, message: "Group dissolved successfully" }
  } catch (error) {
    console.error("Error dissolving group:", error)
    throw error
  }
}

// Kiểm tra quyền của người dùng trong nhóm
export const checkMemberPermission = async (groupId, userId, requiredRole = null) => {
  try {
    const group = await Group.findOne({ groupId, isActive: true })

    if (!group) {
      return { isMember: false, role: null, hasPermission: false }
    }

    const member = group.members.find((member) => member.userId === userId)

    if (!member) {
      return { isMember: false, role: null, hasPermission: false }
    }

    let hasPermission = true

    if (requiredRole) {
      // Kiểm tra quyền dựa trên vai trò
      if (requiredRole === GROUP_ROLES.ADMIN) {
        hasPermission = member.role === GROUP_ROLES.ADMIN
      } else if (requiredRole === GROUP_ROLES.MODERATOR) {
        hasPermission = [GROUP_ROLES.ADMIN, GROUP_ROLES.MODERATOR].includes(member.role)
      }
    }

    return {
      isMember: true,
      role: member.role,
      hasPermission,
    }
  } catch (error) {
    console.error("Error checking member permission:", error)
    throw error
  }
}

// Cập nhật ID tin nhắn đã đọc cuối cùng của thành viên
export const updateLastReadMessage = async (groupId, userId, messageId) => {
  try {
    const group = await Group.findOne({ groupId, "members.userId": userId, isActive: true })

    if (!group) {
      throw new Error("Group not found or user is not a member")
    }

    const memberIndex = group.members.findIndex((member) => member.userId === userId)
    if (memberIndex !== -1) {
      group.members[memberIndex].lastReadMessageId = messageId
      await group.save()
    }

    return { success: true }
  } catch (error) {
    console.error("Error updating last read message:", error)
    throw error
  }
}

// Tìm kiếm nhóm
export const searchGroups = async (query, userId) => {
  try {
    // Tìm các nhóm mà người dùng là thành viên và tên chứa query
    return await Group.find({
      "members.userId": userId,
      name: { $regex: query, $options: "i" },
      isActive: true,
    }).sort({ updatedAt: -1 })
  } catch (error) {
    console.error("Error searching groups:", error)
    throw error
  }
}

// Rời nhóm
export const leaveGroup = async (groupId, userId) => {
  try {
    const group = await Group.findOne({ groupId, isActive: true })

    if (!group) {
      throw new Error("Group not found")
    }

    // Kiểm tra xem người dùng có phải là thành viên không
    const memberIndex = group.members.findIndex((member) => member.userId === userId)
    if (memberIndex === -1) {
      throw new Error("User is not a member of this group")
    }

    // Kiểm tra nếu người dùng là admin duy nhất
    if (group.members[memberIndex].role === GROUP_ROLES.ADMIN) {
      const adminCount = group.members.filter((member) => member.role === GROUP_ROLES.ADMIN).length
      if (adminCount === 1) {
        throw new Error("As the only admin, you must assign another admin before leaving the group")
      }
    }

    // Xóa người dùng khỏi nhóm
    group.members.splice(memberIndex, 1)

    // Cập nhật conversation
    const Conversation = mongoose.model("Conversation")
    await Conversation.updateOne({ conversationId: group.conversationId }, { $pull: { participants: userId } })

    await group.save()
    return { success: true, message: "Left group successfully" }
  } catch (error) {
    console.error("Error leaving group:", error)
    throw error
  }
}
