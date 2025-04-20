import express from "express"
import multer from "multer"
import {
  createNewGroup,
  getGroup,
  getUserGroupsList,
  addMember,
  removeMember,
  updateRole,
  updateGroup,
  uploadGroupAvatar,
  deleteGroup,
  leaveGroupChat,
  updateLastRead,
  searchGroupChats,
  getGroupByConversation,
} from "../controllers/groupController.js"
import { authenticate } from "../middleware/authMiddleware.js"
import { validateRequest } from "../middleware/validationMiddleware.js"

const router = express.Router()

// Cấu hình multer cho upload file
const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
})

// Áp dụng middleware xác thực cho tất cả các routes
router.use(authenticate)

// Tạo nhóm mới
router.post("/", validateRequest(["name"]), createNewGroup)

// Lấy thông tin nhóm
router.get("/:groupId", getGroup)

// Lấy danh sách nhóm của người dùng
router.get("/", getUserGroupsList)

// Thêm thành viên vào nhóm
router.post("/:groupId/members", validateRequest(["userId"]), addMember)

// Xóa thành viên khỏi nhóm
router.delete("/:groupId/members/:memberId", removeMember)

// Cập nhật vai trò thành viên
router.put("/:groupId/members/:memberId/role", validateRequest(["role"]), updateRole)

// Cập nhật thông tin nhóm
router.put("/:groupId", updateGroup)

// Upload avatar nhóm
router.post("/:groupId/avatar", upload.single("avatar"), uploadGroupAvatar)

// Giải tán nhóm
router.delete("/:groupId", deleteGroup)

// Rời khỏi nhóm
router.post("/:groupId/leave", leaveGroupChat)

// Cập nhật tin nhắn đã đọc cuối cùng
router.put("/:groupId/last-read", validateRequest(["messageId"]), updateLastRead)

// Tìm kiếm nhóm
router.get("/search", searchGroupChats)

// Lấy thông tin nhóm từ conversationId
router.get("/conversation/:conversationId", getGroupByConversation)

export default router
