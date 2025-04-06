import { S3Client, CreateBucketCommand, PutBucketCorsCommand, ListBucketsCommand } from "@aws-sdk/client-s3"
import dotenv from "dotenv"

dotenv.config()

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

const USER_AVATARS_BUCKET = process.env.S3_USER_AVATARS_BUCKET || "zalo-user-avatars"

const createUserAvatarsBucket = async () => {
  const params = {
    Bucket: USER_AVATARS_BUCKET,
    CreateBucketConfiguration: {
      LocationConstraint: process.env.AWS_REGION,
    },
  }

  try {
    const data = await s3Client.send(new CreateBucketCommand(params))
    console.log("User avatars bucket created successfully:", data)

    // Configure CORS for the bucket
    await configureBucketCors(USER_AVATARS_BUCKET)

    return data
  } catch (error) {
    if (error.name === "BucketAlreadyExists" || error.name === "BucketAlreadyOwnedByYou") {
      console.log(`Bucket ${USER_AVATARS_BUCKET} already exists`)

      // Configure CORS for existing bucket
      await configureBucketCors(USER_AVATARS_BUCKET)
    } else {
      console.error("Error creating user avatars bucket:", error)
      throw error
    }
  }
}

const configureBucketCors = async (bucketName) => {
  const params = {
    Bucket: bucketName,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ["*"],
          AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
          AllowedOrigins: ["*"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3000,
        },
      ],
    },
  }

  try {
    const data = await s3Client.send(new PutBucketCorsCommand(params))
    console.log(`CORS configuration set for bucket ${bucketName}:`, data)
    return data
  } catch (error) {
    console.error(`Error setting CORS configuration for bucket ${bucketName}:`, error)
    throw error
  }
}

const listBuckets = async () => {
  try {
    const data = await s3Client.send(new ListBucketsCommand({}))
    console.log(
      "Buckets in S3:",
      data.Buckets.map((bucket) => bucket.Name),
    )
  } catch (error) {
    console.error("Error listing buckets:", error)
  }
}

const createBuckets = async () => {
  try {
    await createUserAvatarsBucket()
    await listBuckets()
    console.log("All buckets created successfully")
  } catch (error) {
    console.error("Error creating buckets:", error)
  }
}

createBuckets()

