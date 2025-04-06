import { DynamoDBClient } from "@aws-sdk/client-dynamodb"
import { S3Client } from "@aws-sdk/client-s3"
import dotenv from "dotenv"

dotenv.config()

// Configure AWS credentials
const awsConfig = {
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
}

// Initialize AWS clients
export const dynamoDbClient = new DynamoDBClient(awsConfig)
export const s3Client = new S3Client(awsConfig)

// DynamoDB table names
export const USERS_TABLE = process.env.DYNAMODB_USERS_TABLE || "zalo_users"
export const VERIFICATION_CODES_TABLE = process.env.DYNAMODB_VERIFICATION_CODES_TABLE || "zalo_verification_codes"

// S3 bucket names
export const USER_AVATARS_BUCKET = process.env.S3_USER_AVATARS_BUCKET || "zalo-user-avatars"

