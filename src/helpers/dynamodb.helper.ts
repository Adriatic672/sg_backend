import AWS from 'aws-sdk';
import { CreateTableInput, AttributeValue, PutItemInput, UpdateItemInput } from 'aws-sdk/clients/dynamodb';

AWS.config.update({ region: process.env.DYNAMO_AWS_REGION });
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const dynamoDbRaw = new AWS.DynamoDB();

async function createTableIfNotExists(tableName: string, keyAttribute: string): Promise<void> {
    const fullTableName = getDbName(tableName);
    const params: CreateTableInput = {
        TableName: fullTableName,
        KeySchema: [
            { AttributeName: keyAttribute, KeyType: 'HASH' }  // Primary key (HASH)
        ],
        AttributeDefinitions: [
            { AttributeName: keyAttribute, AttributeType: 'S' }
        ],
        ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
        }
    };

    try {
        await dynamoDbRaw.describeTable({ TableName: fullTableName }).promise();
        console.log(`Table "${fullTableName}" already exists.`);
    } catch (err: any) {
        if (err.code === 'ResourceNotFoundException') {
            await dynamoDbRaw.createTable(params).promise();
            console.log(`Table "${fullTableName}" created successfully.`);
        } else {
            throw err;
        }
    }
}

export async function createItem<T>(tableName: string, keyAttribute: string, item: any): Promise<void> {
    await createTableIfNotExists(tableName, keyAttribute);
    const fullTableName = getDbName(tableName);

    const params: PutItemInput = {
        TableName: fullTableName,
        Item: {
            ...item
        }
    };

    try {
        await dynamoDb.put(params).promise();
        console.log('Item created successfully.');
    } catch (error) {
        console.error('Error creating item:', error);
    }
}

export async function getAllItems<T>(tableName: string): Promise<T[]> {

    const fullTableName = getDbName(tableName);
    const params = {
        TableName: fullTableName
    };

    try {
        const result = await dynamoDb.scan(params).promise();
        return result.Items as T[];
    } catch (error) {
        console.error('Error fetching items:', error);
        return [];
    }
}

export async function getItemByFields<T>(tableName: string, filters: { [key: string]: any }): Promise<T[] | null> {
    const fullTableName = getDbName(tableName);
    const filterExpressions: string[] = [];
    const expressionAttributeNames: { [key: string]: string } = {};
    const expressionAttributeValues: { [key: string]: any } = {};
  
    // Build filter expressions
    Object.keys(filters).forEach((field) => {
      const attributeKey = `#${field}`;
      const attributeValue = `:${field}`;
      const condition = filters[field];
  
      if (typeof condition === 'object' && condition.$gt) {
        // Handle greater-than condition
        filterExpressions.push(`${attributeKey} > ${attributeValue}`);
        expressionAttributeValues[attributeValue] = condition.$gt;
      } else {
        // Handle equality
        filterExpressions.push(`${attributeKey} = ${attributeValue}`);
        expressionAttributeValues[attributeValue] = condition;
      }
  
      expressionAttributeNames[attributeKey] = field;
    });
  
    const params = {
      TableName: fullTableName,
      FilterExpression: filterExpressions.join(" AND "),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    };
  
    try {
      const result = await dynamoDb.scan(params).promise();
      return result.Items as T[] || null;
    } catch (error) {
      console.error("Error fetching items by fields:", error);
      return null;
    }
}

export async function queryItems<T>(
    tableName: string,
    partitionKey: string,
    partitionValue: string,
    sortKeyCondition?: { key: string; operator: string; value: any }
  ): Promise<T[]> {
    const fullTableName = getDbName(tableName);
    const params: AWS.DynamoDB.DocumentClient.QueryInput = {
      TableName: fullTableName,
      KeyConditionExpression: `#pk = :pk`,
      ExpressionAttributeNames: {
        "#pk": partitionKey,
      },
      ExpressionAttributeValues: {
        ":pk": partitionValue,
      },
    };
  
    // Add sort key condition if provided
    if (sortKeyCondition) {
      const { key, operator, value } = sortKeyCondition;
      params.KeyConditionExpression += ` AND #sk ${operator} :sk`;
      params.ExpressionAttributeNames!["#sk"] = key;
      params.ExpressionAttributeValues![":sk"] = value;
    }
  
    try {
      const result = await dynamoDb.query(params).promise();
      return result.Items as T[] || [];
    } catch (error) {
      console.error("Error querying items:", error);
      return [];
    }
}

export async function getItemById<T>(tableName: string, keyAttribute: string, id: string): Promise<T | null> {
    const fullTableName = getDbName(tableName);
    const params = {
        TableName: fullTableName,
        Key: {
            [keyAttribute]: id
        }
    };

    try {
        const result = await dynamoDb.get(params).promise();
        return result.Item as T || null;
    } catch (error) {
        console.error('Error fetching item by ID:', error);
        return null;
    }
}

export async function updateItem(
  tableName: string,
  keyAttribute: string | string[],
  id: string | { [key: string]: any },
  updates: Partial<Record<string, any>>
): Promise<void> {
  const fullTableName = getDbName(tableName);
  try {
    // Build the key object dynamically and track key attribute names
    const key: Record<string, any> = {};
    let keyAttributes: string[] = [];
    if (typeof keyAttribute === "string") {
      key[keyAttribute] = id;
      keyAttributes = [keyAttribute];
    } else if (Array.isArray(keyAttribute) && typeof id === "object") {
      keyAttribute.forEach(attr => {
        if (id[attr]) key[attr] = id[attr];
      });
      keyAttributes = keyAttribute;
    }

    console.log("Updating item with key:", key);

    // Remove any key attributes from the updates to avoid trying to update them
    const filteredUpdates = { ...updates };
    for (const keyAttr of keyAttributes) {
      if (filteredUpdates.hasOwnProperty(keyAttr)) {
        delete filteredUpdates[keyAttr];
      }
    }

    const updateKeys = Object.keys(filteredUpdates);
    if (updateKeys.length === 0) {
      console.log("No updates provided (or only key attributes were passed).");
      return;
    }

    // Construct the UpdateExpression
    const updateExpression = "SET " + updateKeys
      .map((attr, idx) => `#attr${idx} = :val${idx}`)
      .join(", ");
    const expressionAttributeNames = updateKeys.reduce(
      (acc, attr, idx) => ({ ...acc, [`#attr${idx}`]: attr }),
      {}
    );
    const expressionAttributeValues = updateKeys.reduce(
      (acc, attr, idx) => ({ ...acc, [`:val${idx}`]: filteredUpdates[attr] }),
      {}
    );

    const params: UpdateItemInput = {
      TableName: fullTableName,
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "UPDATED_NEW",
    };

    console.log("UpdateItem parameters:", JSON.stringify(params, null, 2));

    const result = await dynamoDb.update(params).promise();
    console.log("Item updated successfully:", result.Attributes);
  } catch (error) {
    console.error("Error updating item:", error);
  }
}

export async function selectData(
    tableName: string,
    filterConditions: Array<{ [key: string]: any }>
  ) {
    const fullTableName = getDbName(tableName);
    if (!filterConditions || filterConditions.length === 0) {
      throw new Error("No filter conditions provided.");
    }
  
    const filterExpressions = filterConditions.map((condition, index) => {
      const key = Object.keys(condition)[0];
      return `#${key}${index} = :${key}${index}`;
    });
  
    const expressionAttributeNames = filterConditions.reduce((acc, condition, index) => {
      const key = Object.keys(condition)[0];
      acc[`#${key}${index}`] = key;
      return acc;
    }, {} as { [key: string]: string });
  
    const expressionAttributeValues = filterConditions.reduce((acc, condition, index) => {
      const key = Object.keys(condition)[0];
      acc[`:${key}${index}`] = condition[key];
      return acc;
    }, {} as { [key: string]: any });
  
    const params = {
      TableName: fullTableName,
      FilterExpression: filterExpressions.join(" AND "),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    };
  
    try {
      const result = await dynamoDb.scan(params).promise();
      return result.Items || [];
    } catch (error) {
      console.error("Error fetching filtered data:", error);
      throw new Error("Error fetching filtered data");
    }
}

export async function deleteItem(tableName: string, keyAttribute: string, id: string): Promise<void> {
    const fullTableName = getDbName(tableName);
    const params = {
        TableName: fullTableName,
        Key: {
            [keyAttribute]: id
        }
    };

    try {
        await dynamoDb.delete(params).promise();
        console.log('Item deleted successfully.');
    } catch (error) {
        console.error('Error deleting item:', error);
    }
}

export function getDbName(tableName: string): string {
  const tableIdentifier = process.env.TABLE_IDENTIFIER || 'stage';
  return `${tableIdentifier}_${tableName}`;
}
