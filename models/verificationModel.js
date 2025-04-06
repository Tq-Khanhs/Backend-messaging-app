import { PutItemCommand, GetItemCommand, DeleteItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb"
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb"
import { dynamoDbClient, VERIFICATION_CODES_TABLE } from "../config/awsConfig.js"

export const createVerificationCode = async (phoneNumber) => {
  // Generate a random 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  const timestamp = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes expiry

  const verificationData = {
    phoneNumber,
    code,
    createdAt: timestamp,
    expiresAt,
    attempts: 0,
  }

  const params = {
    TableName: VERIFICATION_CODES_TABLE,
    Item: marshall(verificationData),
  }

  try {
    await dynamoDbClient.send(new PutItemCommand(params))
    return code
  } catch (error) {
    console.error("Error creating verification code:", error)
    throw error
  }
}

export const getVerificationCode = async (phoneNumber) => {
  const params = {
    TableName: VERIFICATION_CODES_TABLE,
    Key: marshall({
      phoneNumber,
    }),
  }

  try {
    const { Item } = await dynamoDbClient.send(new GetItemCommand(params))
    if (Item) {
      return unmarshall(Item)
    }
    return null
  } catch (error) {
    console.error("Error getting verification code:", error)
    throw error
  }
}

export const verifyCode = async (phoneNumber, code) => {
  const verificationData = await getVerificationCode(phoneNumber)

  if (!verificationData) {
    return { valid: false, message: "Verification code not found" }
  }

  // Check if code is expired
  if (new Date(verificationData.expiresAt) < new Date()) {
    return { valid: false, message: "Verification code has expired" }
  }

  // Update attempts
  const attempts = verificationData.attempts + 1

  // Check if too many attempts
  if (attempts > 3) {
    await deleteVerificationCode(phoneNumber)
    return { valid: false, message: "Too many attempts. Please request a new code" }
  }

  // Update attempts in database
  await updateVerificationAttempts(phoneNumber, attempts)

  // Check if code matches
  if (verificationData.code !== code) {
    return { valid: false, message: "Invalid verification code" }
  }

  // Code is valid, delete it from database
  await deleteVerificationCode(phoneNumber)

  return { valid: true, message: "Verification successful" }
}

const updateVerificationAttempts = async (phoneNumber, attempts) => {
  const params = {
    TableName: VERIFICATION_CODES_TABLE,
    Key: marshall({
      phoneNumber,
    }),
    UpdateExpression: "SET attempts = :attempts",
    ExpressionAttributeValues: marshall({
      ":attempts": attempts,
    }),
  }

  try {
    await dynamoDbClient.send(new UpdateItemCommand(params))
  } catch (error) {
    console.error("Error updating verification attempts:", error)
    throw error
  }
}

export const deleteVerificationCode = async (phoneNumber) => {
  const params = {
    TableName: VERIFICATION_CODES_TABLE,
    Key: marshall({
      phoneNumber,
    }),
  }

  try {
    await dynamoDbClient.send(new DeleteItemCommand(params))
  } catch (error) {
    console.error("Error deleting verification code:", error)
    throw error
  }
}

