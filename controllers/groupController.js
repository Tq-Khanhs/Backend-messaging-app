import {
  createGroup,
  getGroupById,
  getUserGroups,
  addGroupMember,
  removeGroupMember,
  updateMemberRole,
  updateGroupInfo,
  dissolveGroup,
  checkMemberPermission,
  updateLastReadMessage,
  searchGroups,
  leaveGroup,
  getGroupByConversationId,
  GROUP_ROLES,
} from "../models/groupModel.js"
import { getUserById } from "../models/userModel.js"
import { createSystemMessage } from "../models/messageModel.js"
import { uploadImage } from "../services/supabaseStorageService.js"
import { emitToGroup, emitToUser } from "../socket/socketManager.js"
import { EVENTS } from "../socket/socketEvents.js"

// Tạo nhóm mới
export const createNewGroup = async (req, res) => {
  try {
    const { name, description, memberIds = [] } = req.body
    const creatorId = req.user.userId

    if (!name || name.trim() === "") {
      return res.status(400).json({ message: "Group name is required" })
    }

    // Kiểm tra và lọc các thành viên hợp lệ
    const validMembers = []
    if (memberIds && memberIds.length > 0) {
      for (const memberId of memberIds) {
        const user = await getUserById(memberId)
        if (user) {
          validMembers.push({
            userId: user.userId,
            role: GROUP_ROLES.MEMBER,
          })
        }
      }
    }

    // Tạo nhóm
    const group = await createGroup(name, description, creatorId, validMembers)

    // Tạo tin nhắn hệ thống thông báo nhóm được tạo
    await createSystemMessage(group.conversationId, `${req.user.fullName || "User"} created this group`)

    // Nếu có thành viên, tạo tin nhắn hệ thống thông báo thêm thành viên
    if (validMembers.length > 0) {
      await createSystemMessage(
        group.conversationId,
        `${req.user.fullName || "User"} added ${validMembers.length} member(s) to the group`,
      )
    }

    // Notify all members about the new group
    const groupInfo = {
      groupId: group.groupId,
      name: group.name,
      description: group.description,
      conversationId: group.conversationId,
      createdBy: group.createdBy,
      memberCount: group.members.length,
      createdAt: group.createdAt,
    }

    // Notify creator
    emitToUser(req.io, creatorId, "group_created", groupInfo)

    // Notify other members
    validMembers.forEach((member) => {
      emitToUser(req.io, member.userId, "group_added", {
        ...groupInfo,
        addedBy: {
          userId: creatorId,
          fullName: req.user.fullName || "User",
        },
      })
    })

    // Also emit the GROUP_CREATED socket event for real-time notifications
    if (req.io) {
      const socketData = {
        groupId: group.groupId,
        conversationId: group.conversationId,
        members: validMembers.map((member) => member.userId),
      }

      // Log the data being sent to help with debugging
      console.log("Emitting GROUP_CREATED socket event with data:", JSON.stringify(socketData))

      // Get all sockets for the creator
      const creatorSockets = Array.from(req.io.sockets.sockets.values()).filter(
        (socket) => socket.user && socket.user.userId === creatorId,
      )

      // Emit the event from one of the creator's sockets if available
      if (creatorSockets.length > 0) {
        creatorSockets[0].emit(EVENTS.GROUP_CREATED, socketData)
        console.log(`Emitted GROUP_CREATED socket event from creator's socket`)
      } else {
        console.log(`No active sockets found for creator ${creatorId}, using server emission`)
        // Fallback: emit directly to members
        validMembers.forEach((member) => {
          req.io.to(member.userId).emit(EVENTS.GROUP_CREATED, socketData)
        })
      }
    }

    res.status(201).json({
      message: "Group created successfully",
      group: groupInfo,
    })
  } catch (error) {
    console.error("Error in createNewGroup:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Lấy thông tin nhóm
export const getGroup = async (req, res) => {
  try {
    const { groupId } = req.params
    const userId = req.user.userId

    const group = await getGroupById(groupId)

    if (!group) {
      return res.status(404).json({ message: "Group not found" })
    }

    // Kiểm tra xem người dùng có phải là thành viên không
    const permission = await checkMemberPermission(groupId, userId)
    if (!permission.isMember) {
      return res.status(403).json({ message: "You are not a member of this group" })
    }

    // Lấy thông tin chi tiết về các thành viên
    const membersWithDetails = await Promise.all(
      group.members.map(async (member) => {
        const user = await getUserById(member.userId)
        return {
          userId: member.userId,
          fullName: user ? user.fullName : "Unknown User",
          avatarUrl: user ? user.avatarUrl : null,
          role: member.role,
          addedAt: member.addedAt,
        }
      }),
    )

    res.status(200).json({
      message: "Group retrieved successfully",
      group: {
        groupId: group.groupId,
        name: group.name,
        description: group.description,
        avatarUrl: group.avatarUrl,
        conversationId: group.conversationId,
        createdBy: group.createdBy,
        createdAt: group.createdAt,
        members: membersWithDetails,
        settings: group.settings,
        userRole: permission.role,
      },
    })
  } catch (error) {
    console.error("Error in getGroup:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Lấy danh sách nhóm của người dùng
export const getUserGroupsList = async (req, res) => {
  try {
    const userId = req.user.userId

    const groups = await getUserGroups(userId)

    const groupsWithDetails = await Promise.all(
      groups.map(async (group) => {
        // Lấy số lượng thành viên
        const memberCount = group.members.length

        // Lấy vai trò của người dùng trong nhóm
        const userMember = group.members.find((member) => member.userId === userId)
        const userRole = userMember ? userMember.role : null

        return {
          groupId: group.groupId,
          name: group.name,
          description: group.description,
          avatarUrl: group.avatarUrl,
          conversationId: group.conversationId,
          memberCount,
          userRole,
          createdAt: group.createdAt,
        }
      }),
    )

    res.status(200).json({
      message: "Groups retrieved successfully",
      groups: groupsWithDetails,
    })
  } catch (error) {
    console.error("Error in getUserGroupsList:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Thêm thành viên vào nhóm
export const addMember = async (req, res) => {
  try {
    const { groupId } = req.params
    const { userId, role = GROUP_ROLES.MEMBER } = req.body
    const currentUserId = req.user.userId

    // Kiểm tra quy���n của người dùng hiện tại
    const permission = await checkMemberPermission(groupId, currentUserId, GROUP_ROLES.MODERATOR)
    if (!permission.hasPermission) {
      return res.status(403).json({ message: "You don't have permission to add members" })
    }

    // Kiểm tra người dùng cần thêm có tồn tại không
    const userToAdd = await getUserById(userId)
    if (!userToAdd) {
      return res.status(404).json({ message: "User not found" })
    }

    // Thêm thành viên
    const group = await addGroupMember(groupId, userId, currentUserId, role)

    // Tạo tin nhắn hệ thống
    const currentUser = await getUserById(currentUserId)
    const addedUser = await getUserById(userId)
    await createSystemMessage(
      group.conversationId,
      `${currentUser.fullName || "User"} added ${addedUser.fullName || "a new member"} to the group`,
    )

    // Notify the added user
    emitToUser(req.io, userId, "group_added", {
      groupId: group.groupId,
      name: group.name,
      description: group.description,
      avatarUrl: group.avatarUrl,
      conversationId: group.conversationId,
      addedBy: {
        userId: currentUserId,
        fullName: currentUser.fullName || "User",
      },
    })

    // Notify all group members about the new member
    emitToGroup(req.io, groupId, "member_added", {
      groupId,
      member: {
        userId,
        fullName: addedUser.fullName,
        avatarUrl: addedUser.avatarUrl,
        role,
      },
      addedBy: {
        userId: currentUserId,
        fullName: currentUser.fullName,
      },
    })

    res.status(200).json({
      message: "Member added successfully",
      member: {
        userId,
        role,
        addedBy: currentUserId,
        addedAt: new Date(),
      },
    })
  } catch (error) {
    console.error("Error in addMember:", error)

    if (error.message === "User is already a member of this group") {
      return res.status(400).json({ message: error.message })
    }

    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Xóa thành viên khỏi nhóm
export const removeMember = async (req, res) => {
  try {
    const { groupId, memberId } = req.params
    const currentUserId = req.user.userId

    // Kiểm tra quyền của người dùng hiện tại
    const permission = await checkMemberPermission(groupId, currentUserId, GROUP_ROLES.MODERATOR)
    if (!permission.hasPermission) {
      return res.status(403).json({ message: "You don't have permission to remove members" })
    }

    // Kiểm tra người dùng cần xóa
    const memberPermission = await checkMemberPermission(groupId, memberId)
    if (!memberPermission.isMember) {
      return res.status(404).json({ message: "Member not found in this group" })
    }

    // Không thể xóa admin nếu bạn không phải là admin
    if (memberPermission.role === GROUP_ROLES.ADMIN && permission.role !== GROUP_ROLES.ADMIN) {
      return res.status(403).json({ message: "You don't have permission to remove an admin" })
    }

    // Get member info before removal
    const removedUser = await getUserById(memberId)
    const currentUser = await getUserById(currentUserId)

    // Xóa thành viên
    const group = await removeGroupMember(groupId, memberId, currentUserId)

    // Tạo tin nhắn hệ thống
    await createSystemMessage(
      group.conversationId,
      `${currentUser.fullName || "User"} removed ${removedUser.fullName || "a member"} from the group`,
    )

    // Notify the removed member
    emitToUser(req.io, memberId, "group_removed", {
      groupId,
      removedBy: {
        userId: currentUserId,
        fullName: currentUser.fullName || "User",
      },
    })

    // Notify all group members
    emitToGroup(req.io, groupId, "member_removed", {
      groupId,
      memberId,
      removedBy: {
        userId: currentUserId,
        fullName: currentUser.fullName || "User",
      },
    })

    res.status(200).json({
      message: "Member removed successfully",
    })
  } catch (error) {
    console.error("Error in removeMember:", error)

    if (error.message === "Cannot remove the only admin from the group") {
      return res.status(400).json({ message: error.message })
    }

    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Cập nhật vai trò thành viên
export const updateRole = async (req, res) => {
  try {
    const { groupId, memberId } = req.params
    const { role } = req.body
    const currentUserId = req.user.userId

    if (!Object.values(GROUP_ROLES).includes(role)) {
      return res.status(400).json({ message: "Invalid role" })
    }

    // Kiểm tra quyền của người dùng hiện tại (chỉ admin mới có thể thay đổi vai trò)
    const permission = await checkMemberPermission(groupId, currentUserId, GROUP_ROLES.ADMIN)
    if (!permission.hasPermission) {
      return res.status(403).json({ message: "Only admins can change member roles" })
    }

    // Cập nhật vai trò
    const group = await updateMemberRole(groupId, memberId, role, currentUserId)

    // Tạo tin nhắn hệ thống
    const currentUser = await getUserById(currentUserId)
    const updatedUser = await getUserById(memberId)
    await createSystemMessage(
      group.conversationId,
      `${currentUser.fullName || "User"} changed ${updatedUser.fullName || "a member"}'s role to ${role}`,
    )

    // Notify the member whose role was updated
    emitToUser(req.io, memberId, "role_updated", {
      groupId,
      role,
      updatedBy: {
        userId: currentUserId,
        fullName: currentUser.fullName || "User",
      },
    })

    // Notify all group members
    emitToGroup(req.io, groupId, "member_role_updated", {
      groupId,
      member: {
        userId: memberId,
        fullName: updatedUser.fullName,
        role,
      },
      updatedBy: {
        userId: currentUserId,
        fullName: currentUser.fullName,
      },
    })

    res.status(200).json({
      message: "Member role updated successfully",
      member: {
        userId: memberId,
        role,
      },
    })
  } catch (error) {
    console.error("Error in updateRole:", error)

    if (error.message === "Cannot demote the only admin of the group") {
      return res.status(400).json({ message: error.message })
    }

    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Cập nhật thông tin nhóm
export const updateGroup = async (req, res) => {
  try {
    const { groupId } = req.params
    const { name, description, settings } = req.body
    const currentUserId = req.user.userId

    // Kiểm tra quyền của người dùng hiện tại
    const permission = await checkMemberPermission(groupId, currentUserId)
    if (!permission.isMember) {
      return res.status(403).json({ message: "You are not a member of this group" })
    }

    // Chỉ admin và moderator mới có thể cập nhật thông tin nhóm
    if (permission.role === GROUP_ROLES.MEMBER) {
      const group = await getGroupById(groupId)
      if (!group.settings.allowMembersToChangeInfo) {
        return res.status(403).json({ message: "You don't have permission to update group info" })
      }
    }

    // Cập nhật thông tin
    const updateData = {}
    if (name) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (settings) updateData.settings = settings

    const group = await updateGroupInfo(groupId, updateData)

    // Tạo tin nhắn hệ thống
    const currentUser = await getUserById(currentUserId)
    await createSystemMessage(group.conversationId, `${currentUser.fullName || "User"} updated the group information`)

    // Notify all group members
    emitToGroup(req.io, groupId, "group_updated", {
      groupId,
      name: group.name,
      description: group.description,
      settings: group.settings,
      updatedBy: {
        userId: currentUserId,
        fullName: currentUser.fullName,
      },
    })

    res.status(200).json({
      message: "Group updated successfully",
      group: {
        groupId: group.groupId,
        name: group.name,
        description: group.description,
        settings: group.settings,
      },
    })
  } catch (error) {
    console.error("Error in updateGroup:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Upload avatar nhóm
export const uploadGroupAvatar = async (req, res) => {
  try {
    const { groupId } = req.params
    const currentUserId = req.user.userId

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" })
    }

    // Kiểm tra quyền của người dùng hiện tại
    const permission = await checkMemberPermission(groupId, currentUserId)
    if (!permission.isMember) {
      return res.status(403).json({ message: "You are not a member of this group" })
    }

    // Chỉ admin và moderator mới có thể cập nhật avatar nhóm
    if (permission.role === GROUP_ROLES.MEMBER) {
      const group = await getGroupById(groupId)
      if (!group.settings.allowMembersToChangeInfo) {
        return res.status(403).json({ message: "You don't have permission to update group avatar" })
      }
    }

    // Upload avatar
    const result = await uploadImage(req.file.buffer, req.file.mimetype, "group-avatars")

    // Cập nhật thông tin nhóm
    const group = await updateGroupInfo(groupId, { avatarUrl: result.url })

    // Tạo tin nhắn hệ thống
    const currentUser = await getUserById(currentUserId)
    await createSystemMessage(group.conversationId, `${currentUser.fullName || "User"} updated the group avatar`)

    // Notify all group members
    emitToGroup(req.io, groupId, "group_avatar_updated", {
      groupId,
      avatarUrl: result.url,
      updatedBy: {
        userId: currentUserId,
        fullName: currentUser.fullName,
      },
    })

    res.status(200).json({
      message: "Group avatar updated successfully",
      avatarUrl: result.url,
    })
  } catch (error) {
    console.error("Error in uploadGroupAvatar:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Giải tán nhóm
export const deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params
    const currentUserId = req.user.userId

    // Fetch the group first
    const group = await getGroupById(groupId)
    if (!group) {
      return res.status(404).json({ message: "Group not found" })
    }

    // Kiểm tra quyền của người dùng hiện tại (chỉ admin mới có thể giải tán nhóm)
    const permission = await checkMemberPermission(groupId, currentUserId, GROUP_ROLES.ADMIN)
    if (!permission.hasPermission) {
      return res.status(403).json({ message: "Only group admin can dissolve the group" })
    }

    // Get user info for system message before dissolving
    const currentUser = await getUserById(currentUserId)

    // Create system message before dissolving the group
    await createSystemMessage(group.conversationId, `${currentUser.fullName || "User"} dissolved the group`)

    // Get all members to notify them
    const memberIds = group.members.map((member) => member.userId)

    // Giải tán nhóm
    const result = await dissolveGroup(groupId, currentUserId)

    // Notify all members about group dissolution
    memberIds.forEach((memberId) => {
      emitToUser(req.io, memberId, "group_dissolved", {
        groupId,
        dissolvedBy: {
          userId: currentUserId,
          fullName: currentUser.fullName,
        },
      })
    })

    res.status(200).json({
      message: "Group dissolved successfully",
    })
  } catch (error) {
    console.error("Error in deleteGroup:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Rời khỏi nhóm
export const leaveGroupChat = async (req, res) => {
  try {
    const { groupId } = req.params
    const currentUserId = req.user.userId

    // Kiểm tra quyền của người dùng hiện tại
    const permission = await checkMemberPermission(groupId, currentUserId)
    if (!permission.isMember) {
      return res.status(403).json({ message: "You are not a member of this group" })
    }

    // Get user info before leaving
    const currentUser = await getUserById(currentUserId)

    // Rời nhóm
    const result = await leaveGroup(groupId, currentUserId)

    // Tạo tin nhắn hệ thống
    const group = await getGroupById(groupId)
    await createSystemMessage(group.conversationId, `${currentUser.fullName || "User"} left the group`)

    // Notify other group members
    emitToGroup(req.io, groupId, "member_left", {
      groupId,
      member: {
        userId: currentUserId,
        fullName: currentUser.fullName,
      },
    })

    res.status(200).json({
      message: "Left group successfully",
    })
  } catch (error) {
    console.error("Error in leaveGroupChat:", error)

    if (error.message === "As the only admin, you must assign another admin before leaving the group") {
      return res.status(400).json({ message: error.message })
    }

    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Cập nhật tin nhắn đã đọc cuối cùng
export const updateLastRead = async (req, res) => {
  try {
    const { groupId } = req.params
    const { messageId } = req.body
    const currentUserId = req.user.userId

    // Kiểm tra quyền của người dùng hiện tại
    const permission = await checkMemberPermission(groupId, currentUserId)
    if (!permission.isMember) {
      return res.status(403).json({ message: "You are not a member of this group" })
    }

    // Cập nhật tin nhắn đã đọc cuối cùng
    await updateLastReadMessage(groupId, currentUserId, messageId)

    // Emit read status to group
    emitToGroup(req.io, groupId, "message_read_by_member", {
      groupId,
      userId: currentUserId,
      messageId,
      readAt: new Date(),
    })

    res.status(200).json({
      message: "Last read message updated successfully",
    })
  } catch (error) {
    console.error("Error in updateLastRead:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Tìm kiếm nhóm
export const searchGroupChats = async (req, res) => {
  try {
    const { query } = req.query
    const currentUserId = req.user.userId

    if (!query || query.trim() === "") {
      return res.status(400).json({ message: "Search query is required" })
    }

    // Tìm kiếm nhóm
    const groups = await searchGroups(query, currentUserId)

    const groupsWithDetails = groups.map((group) => {
      // Lấy vai trò của người dùng trong nhóm
      const userMember = group.members.find((member) => member.userId === currentUserId)
      const userRole = userMember ? userMember.role : null

      return {
        groupId: group.groupId,
        name: group.name,
        description: group.description,
        avatarUrl: group.avatarUrl,
        conversationId: group.conversationId,
        memberCount: group.members.length,
        userRole,
        createdAt: group.createdAt,
      }
    })

    res.status(200).json({
      message: "Groups found",
      groups: groupsWithDetails,
    })
  } catch (error) {
    console.error("Error in searchGroupChats:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Lấy thông tin nhóm từ conversationId
export const getGroupByConversation = async (req, res) => {
  try {
    const { conversationId } = req.params
    const currentUserId = req.user.userId

    const group = await getGroupByConversationId(conversationId)

    if (!group) {
      return res.status(404).json({ message: "Group not found" })
    }

    // Kiểm tra quyền của người dùng hiện tại
    const permission = await checkMemberPermission(group.groupId, currentUserId)
    if (!permission.isMember) {
      return res.status(403).json({ message: "You are not a member of this group" })
    }

    // Lấy thông tin chi tiết về các thành viên
    const membersWithDetails = await Promise.all(
      group.members.map(async (member) => {
        const user = await getUserById(member.userId)
        return {
          userId: member.userId,
          fullName: user ? user.fullName : "Unknown User",
          avatarUrl: user ? user.avatarUrl : null,
          role: member.role,
          addedAt: member.addedAt,
        }
      }),
    )

    res.status(200).json({
      message: "Group retrieved successfully",
      group: {
        groupId: group.groupId,
        name: group.name,
        description: group.description,
        avatarUrl: group.avatarUrl,
        conversationId: group.conversationId,
        createdBy: group.createdBy,
        createdAt: group.createdAt,
        members: membersWithDetails,
        settings: group.settings,
        userRole: permission.role,
      },
    })
  } catch (error) {
    console.error("Error in getGroupByConversation:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
