export const errorHandler = (err, req, res, next) => {
    // Log error for debugging
    console.error("Error:", err);

    // Set status code
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

    // Send error response
    res.status(statusCode).json({
        message: err.message || "Server Error",
        stack: process.env.NODE_ENV === "production" ? null : err.stack,
    });
};

