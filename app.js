import express from "express"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import dotenv from "dotenv"
import http from "http"
import authRoutes from "./routes/authRoutes.js"
import userRoutes from "./routes/userRoutes.js"
import imageRoutes from "./routes/imageRoutes.js"
import friendRoutes from "./routes/friendRoutes.js"
import messageRoutes from "./routes/messageRoutes.js"
import groupRoutes from "./routes/groupRoutes.js"
import { errorHandler } from "./middleware/errorMiddleware.js"
import { initializeStorage } from "./config/supabaseConfig.js"
import { connectDB } from "./config/mongodbConfig.js"
import { initializeSocketServer } from "./socket/socketManager.js"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// Create HTTP server
const server = http.createServer(app)

// Connect to MongoDB
connectDB().catch(console.error)

// Initialize Supabase storage
initializeStorage().catch(console.error)

// Initialize Socket.IO
const io = initializeSocketServer(server)

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(morgan("dev"))

// Make io available to routes
app.use((req, res, next) => {
  req.io = io
  next()
})

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/users", userRoutes)
app.use("/api/images", imageRoutes)
app.use("/api/friends", friendRoutes)
app.use("/api/messages", messageRoutes)
app.use("/api/groups", groupRoutes)

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" })
})

// Error handler
app.use(errorHandler)

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export default app
