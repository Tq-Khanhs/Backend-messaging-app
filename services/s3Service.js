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

