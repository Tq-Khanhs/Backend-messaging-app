import mongoose from "mongoose"
import dotenv from "dotenv"
import { connectDB } from "../config/mongodbConfig.js"

dotenv.config()

const migrateData = async () => {
  try {
    await connectDB()
    console.log("Connected to MongoDB")

    // 1. Cập nhật tất cả các cuộc trò chuyện hiện có để thêm trường isGroup
    const conversationResult = await mongoose.connection.collection("conversations").updateMany(
      { isGroup: { $exists: false } },
      { $set: { isGroup: false } }
    )
    console.log(`Updated ${conversationResult.modifiedCount} conversations`)

    // 2. Cập nhật tin nhắn để thêm các trường mới
    const messageResult = await mongoose.connection.collection("messages").updateMany(
      { readBy: { $exists: false } },
      { 
        $set: { 
          readBy: [],
          mentions: [],
          replyTo: null
        } 
      }
    )
    console.log(`Updated ${messageResult.modifiedCount} messages`)

    // 3. Chuyển đổi trường readAt thành readBy cho tin nhắn đã đọc
    const readMessages = await mongoose.connection.collection("messages").find(
      { readAt: { $ne: null } }
    ).toArray()
    
    for (const message of readMessages) {
      if (message.receiverId && message.readAt) {
        await mongoose.connection.collection("messages").updateOne(
          { messageId: message.messageId },
          { 
            $push: { 
              readBy: {
                userId: message.receiverId,
                readAt: message.readAt
              }
            }
          }
        )
      }
    }
    console.log(`Converted readAt to readBy for ${readMessages.length} messages`)

    console.log("Migration completed successfully")
  } catch (error) {
    console.error("Migration failed:", error)
  } finally {
    await mongoose.disconnect()
    console.log("Disconnected from MongoDB")
  }
}

migrateData()