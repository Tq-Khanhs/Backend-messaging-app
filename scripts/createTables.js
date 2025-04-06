import { DynamoDBClient, CreateTableCommand, ListTablesCommand } from "@aws-sdk/client-dynamodb"
import dotenv from "dotenv"

dotenv.config()

const dynamoDbClient = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

const USERS_TABLE = process.env.DYNAMODB_USERS_TABLE || "zalo_users"
const VERIFICATION_CODES_TABLE = process.env.DYNAMODB_VERIFICATION_CODES_TABLE || "zalo_verification_codes"

const createUsersTable = async () => {
  const params = {
    TableName: USERS_TABLE,
    KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
    AttributeDefinitions: [
      { AttributeName: "userId", AttributeType: "S" },
      { AttributeName: "phoneNumber", AttributeType: "S" },
      { AttributeName: "firebaseUid", AttributeType: "S" },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "PhoneNumberIndex",
        KeySchema: [{ AttributeName: "phoneNumber", KeyType: "HASH" }],
        Projection: {
          ProjectionType: "ALL",
        },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      },
      {
        IndexName: "FirebaseUidIndex",
        KeySchema: [{ AttributeName: "firebaseUid", KeyType: "HASH" }],
        Projection: {
          ProjectionType: "ALL",
        },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      },
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5,
    },
  }

  try {
    const data = await dynamoDbClient.send(new CreateTableCommand(params))
    console.log("Users table created successfully:", data)
    return data
  } catch (error) {
    if (error.name === "ResourceInUseException") {
      console.log(`Table ${USERS_TABLE} already exists`)
    } else {
      console.error("Error creating users table:", error)
      throw error
    }
  }
}

const createVerificationCodesTable = async () => {
  const params = {
    TableName: VERIFICATION_CODES_TABLE,
    KeySchema: [{ AttributeName: "phoneNumber", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "phoneNumber", AttributeType: "S" }],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5,
    },
  }

  try {
    const data = await dynamoDbClient.send(new CreateTableCommand(params))
    console.log("Verification codes table created successfully:", data)
    return data
  } catch (error) {
    if (error.name === "ResourceInUseException") {
      console.log(`Table ${VERIFICATION_CODES_TABLE} already exists`)
    } else {
      console.error("Error creating verification codes table:", error)
      throw error
    }
  }
}

const listTables = async () => {
  try {
    const data = await dynamoDbClient.send(new ListTablesCommand({}))
    console.log("Tables in DynamoDB:", data.TableNames)
  } catch (error) {
    console.error("Error listing tables:", error)
  }
}

const createTables = async () => {
  try {
    await createUsersTable()
    await createVerificationCodesTable()
    await listTables()
    console.log("All tables created successfully")
  } catch (error) {
    console.error("Error creating tables:", error)
  }
}

createTables()

