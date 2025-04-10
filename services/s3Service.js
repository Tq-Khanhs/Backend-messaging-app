import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { s3Client, USER_AVATARS_BUCKET } from "../config/awsConfig.js"
import { v4 as uuidv4 } from "uuid"

export const uploadAvatar = async (userId, fileBuffer, mimeType) => {
  const key = `avatars/${userId}/${uuidv4()}`

  const params = {
    Bucket: USER_AVATARS_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
  }

  try {
    await s3Client.send(new PutObjectCommand(params))
    return key
  } catch (error) {
    console.error("Error uploading avatar to S3:", error)
    throw error
  }
}

export const getAvatarUrl = async (key) => {
  const params = {
    Bucket: USER_AVATARS_BUCKET,
    Key: key,
  }

  try {
    // Generate a signed URL that expires in 1 hour
    const url = await getSignedUrl(s3Client, new GetObjectCommand(params), { expiresIn: 3600 })
    return url
  } catch (error) {
    console.error("Error generating avatar URL:", error)
    throw error
  }
}

export const deleteAvatar = async (key) => {
  const params = {
    Bucket: USER_AVATARS_BUCKET,
    Key: key,
  }

  try {
    await s3Client.send(new DeleteObjectCommand(params))
  } catch (error) {
    console.error("Error deleting avatar from S3:", error)
    throw error
  }
}

export const generatePresignedUploadUrl = async (userId, fileType) => {
  const key = `avatars/${userId}/${uuidv4()}`

  const params = {
    Bucket: USER_AVATARS_BUCKET,
    Key: key,
    ContentType: fileType,
  }

  try {
    const url = await getSignedUrl(s3Client, new PutObjectCommand(params), { expiresIn: 300 })
    return { url, key }
  } catch (error) {
    console.error("Error generating presigned URL:", error)
    throw error
  }
}

// New function to upload any image to S3 and return the URL
export const uploadImage = async (fileBuffer, mimeType, folder = "images") => {
  const key = `${folder}/${uuidv4()}`

  const params = {
    Bucket: USER_AVATARS_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
    ACL: "public-read", // Make the image publicly accessible
  }

  try {
    await s3Client.send(new PutObjectCommand(params))

    // Generate a URL for the uploaded image
    const imageUrl = await getImageUrl(key)

    return {
      key,
      url: imageUrl,
    }
  } catch (error) {
    console.error("Error uploading image to S3:", error)
    throw error
  }
}

// Get a URL for an image (can be public or signed)
export const getImageUrl = async (key, signed = true) => {
  const params = {
    Bucket: USER_AVATARS_BUCKET,
    Key: key,
  }

  try {
    if (signed) {
      // Generate a signed URL that expires in 1 hour
      const url = await getSignedUrl(s3Client, new GetObjectCommand(params), { expiresIn: 3600 })
      return url
    } else {
      // Generate a public URL (assuming the bucket has public read access)
      const region = process.env.AWS_REGION || "us-east-1"
      return `https://${USER_AVATARS_BUCKET}.s3.${region}.amazonaws.com/${key}`
    }
  } catch (error) {
    console.error("Error generating image URL:", error)
    throw error
  }
}
