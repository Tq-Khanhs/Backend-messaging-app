import { PutItemCommand, GetItemCommand, UpdateItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb"
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb"
import { dynamoDbClient, USERS_TABLE } from "../config/awsConfig.js"
import { v4 as uuidv4 } from "uuid"
import bcrypt from "bcryptjs"

export const createUser = async (userData) => {
  const userId = userData.firebaseUid || uuidv4()
  const timestamp = new Date().toISOString()

  // Hash password if provided
  if (userData.password) {
    const salt = await bcrypt.genSalt(10)
    userData.password = await bcrypt.hash(userData.password, salt)
  }

  const user = {
    userId,
    phoneNumber: userData.phoneNumber,
    password: userData.password || null,
    fullName: userData.fullName || null,
    birthdate: userData.birthdate || null,
    gender: userData.gender || null,
    avatarUrl: userData.avatarUrl || null,
    firebaseUid: userData.firebaseUid || null,
    createdAt: timestamp,
    updatedAt: timestamp,
    isActive: true,
  }

  const params = {
    TableName: USERS_TABLE,
    Item: marshall(user),
  }

  try {
    await dynamoDbClient.send(new PutItemCommand(params))
    return user
  } catch (error) {
    console.error("Error creating user:", error)
    throw error
  }
}

export const getUserByPhoneNumber = async (phoneNumber) => {
  const params = {
    TableName: USERS_TABLE,
    IndexName: "PhoneNumberIndex",
    KeyConditionExpression: "phoneNumber = :phoneNumber",
    ExpressionAttributeValues: marshall({
      ":phoneNumber": phoneNumber,
    }),
  }

  try {
    const { Items } = await dynamoDbClient.send(new QueryCommand(params))
    if (Items && Items.length > 0) {
      return unmarshall(Items[0])
    }
    return null
  } catch (error) {
    console.error("Error getting user by phone number:", error)
    throw error
  }
}

export const getUserByFirebaseUid = async (firebaseUid) => {
  const params = {
    TableName: USERS_TABLE,
    IndexName: "FirebaseUidIndex",
    KeyConditionExpression: "firebaseUid = :firebaseUid",
    ExpressionAttributeValues: marshall({
      ":firebaseUid": firebaseUid,
    }),
  }

  try {
    const { Items } = await dynamoDbClient.send(new QueryCommand(params))
    if (Items && Items.length > 0) {
      return unmarshall(Items[0])
    }
    return null
  } catch (error) {
    console.error("Error getting user by Firebase UID:", error)
    throw error
  }
}

export const getUserById = async (userId) => {
  const params = {
    TableName: USERS_TABLE,
    Key: marshall({
      userId,
    }),
  }

  try {
    const { Item } = await dynamoDbClient.send(new GetItemCommand(params))
    if (Item) {
      return unmarshall(Item)
    }
    return null
  } catch (error) {
    console.error("Error getting user by ID:", error)
    throw error
  }
}

export const updateUser = async (userId, updateData) => {
  const timestamp = new Date().toISOString()

  // Build update expression
  let updateExpression = "SET updatedAt = :updatedAt"
  const expressionAttributeValues = {
    ":updatedAt": timestamp,
  }

  Object.keys(updateData).forEach((key) => {
    if (key !== "userId" && key !== "phoneNumber" && key !== "firebaseUid") {
      updateExpression += `, ${key} = :${key}`
      expressionAttributeValues[`:${key}`] = updateData[key]
    }
  })

  const params = {
    TableName: USERS_TABLE,
    Key: marshall({
      userId,
    }),
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: marshall(expressionAttributeValues),
    ReturnValues: "ALL_NEW",
  }

  try {
    const { Attributes } = await dynamoDbClient.send(new UpdateItemCommand(params))
    return Attributes ? unmarshall(Attributes) : null
  } catch (error) {
    console.error("Error updating user:", error)
    throw error
  }
}

export const verifyPassword = async (plainPassword, hashedPassword) => {
  return await bcrypt.compare(plainPassword, hashedPassword)
}

