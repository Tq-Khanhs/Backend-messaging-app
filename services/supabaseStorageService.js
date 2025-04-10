import { supabaseClient, USER_AVATARS_BUCKET, IMAGES_BUCKET } from "../config/supabaseConfig.js"
import { v4 as uuidv4 } from "uuid"

// Upload avatar to Supabase Storage
export const uploadAvatar = async (userId, fileBuffer, mimeType) => {
  const key = `${userId}/${uuidv4()}`
  const fileExt = mimeType.split("/")[1]
  const fileName = `${key}.${fileExt}`

  try {
    const { data, error } = await supabaseClient.storage.from(USER_AVATARS_BUCKET).upload(fileName, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    })

    if (error) throw error
    return fileName
  } catch (error) {
    console.error("Error uploading avatar to Supabase:", error)
    throw error
  }
}

// Get a signed URL for avatar
export const getAvatarUrl = async (key) => {
  try {
    const { data, error } = await supabaseClient.storage.from(USER_AVATARS_BUCKET).createSignedUrl(key, 3600) // 1 hour expiry

    if (error) throw error
    return data.signedUrl
  } catch (error) {
    console.error("Error generating avatar URL:", error)
    throw error
  }
}

// Delete avatar from Supabase Storage
export const deleteAvatar = async (key) => {
  try {
    const { error } = await supabaseClient.storage.from(USER_AVATARS_BUCKET).remove([key])

    if (error) throw error
  } catch (error) {
    console.error("Error deleting avatar from Supabase:", error)
    throw error
  }
}

// Generate a signed URL for client-side upload
export const generatePresignedUploadUrl = async (userId, fileType) => {
  const fileExt = fileType.split("/")[1]
  const key = `${userId}/${uuidv4()}.${fileExt}`

  try {
    // For Supabase, we need to create a signed URL for upload
    // This is different from AWS S3 presigned URLs
    // We'll return the key that the client should use when uploading
    return {
      key,
      url: `${process.env.SUPABASE_URL}/storage/v1/object/${USER_AVATARS_BUCKET}/${key}`,
      // Include the Supabase key for client-side upload
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        "Content-Type": fileType,
      },
    }
  } catch (error) {
    console.error("Error generating presigned URL:", error)
    throw error
  }
}

// Upload any image to Supabase Storage
export const uploadImage = async (fileBuffer, mimeType, folder = "general") => {
  const fileExt = mimeType.split("/")[1]
  const fileName = `${folder}/${uuidv4()}.${fileExt}`

  try {
    const { data, error } = await supabaseClient.storage.from(IMAGES_BUCKET).upload(fileName, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    })

    if (error) throw error

    // Get the public URL for the uploaded image
    const imageUrl = await getImageUrl(fileName)

    return {
      key: fileName,
      url: imageUrl,
    }
  } catch (error) {
    console.error("Error uploading image to Supabase:", error)
    throw error
  }
}

// Get a URL for an image (public or signed)
export const getImageUrl = async (key, signed = false) => {
  try {
    if (signed) {
      // Generate a signed URL
      const { data, error } = await supabaseClient.storage.from(IMAGES_BUCKET).createSignedUrl(key, 3600) // 1 hour expiry

      if (error) throw error
      return data.signedUrl
    } else {
      // Generate a public URL
      const { data } = supabaseClient.storage.from(IMAGES_BUCKET).getPublicUrl(key)

      return data.publicUrl
    }
  } catch (error) {
    console.error("Error generating image URL:", error)
    throw error
  }
}
