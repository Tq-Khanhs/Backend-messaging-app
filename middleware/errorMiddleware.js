export const errorHandler = (err, req, res, next) => {
    console.error("Global error handler caught an error:", err)
  
    // Customize error messages based on the error type or status code
    if (err.name === "ValidationError") {
      // Mongoose validation error
      return res.status(400).json({ message: err.message })
    }
  
    if (err.status === 404) {
      return res.status(404).json({ message: "Resource not found" })
    }
  
    // Generic error response
    res.status(500).json({ message: "Something went wrong", error: err.message })
  }
  