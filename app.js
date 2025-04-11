import express from "express"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import dotenv from "dotenv"
import authRoutes from "./routes/authRoutes.js"
import userRoutes from "./routes/userRoutes.js"
import imageRoutes from "./routes/imageRoutes.js"
import { errorHandler } from "./middleware/errorMiddleware.js"
import { initializeStorage } from "./config/supabaseConfig.js"
import { connectDB } from "./config/mongodbConfig.js"

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

connectDB().catch(console.error)

initializeStorage().catch(console.error)

app.use(helmet())
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(morgan("dev"))

app.use("/api/auth", authRoutes)
app.use("/api/users", userRoutes)
app.use("/api/images", imageRoutes)

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" })
})

app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export default app
