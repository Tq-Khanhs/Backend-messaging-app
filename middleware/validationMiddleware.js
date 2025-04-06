export const validateRequest = (requiredFields) => {
    return (req, res, next) => {
      const missingFields = []
  
      for (const field of requiredFields) {
        if (!req.body[field]) {
          missingFields.push(field)
        }
      }
  
      if (missingFields.length > 0) {
        return res.status(400).json({
          message: "Missing required fields",
          fields: missingFields,
        })
      }
  
      next()
    }
  }
  
  