import * as db from './db.helper';
import { logger } from '../utils/logger';
import cloudWatchLogger from './cloudwatch.helper';

class BaseModel {
  public tableName: string;
  public insertion: string | undefined;
  public selectCols: string | undefined;
  public selectWhere: string = '';
  public offsets: number = 0;
  public limits: number = 10;
  public orderBy: string = '';
  public orderIs: string = '';
  public updation: string | undefined;
  public fileId: any;
  public updateWhere: string = '';
  public insertPrimaryKey: string | undefined;
  public selectFields: string[] = [];
  public whereConditions: string[] = [];
  public groupBy: string[] = [];
  public havingConditions: string[] = [];
  public joins: string[] = [];

  constructor(value: string = '') {
    this.tableName = value;
  }

  public inserRecords() {
    // tslint:disable-next-line:max-line-length
    const query =
      'CALL insertData("' + this.tableName + '","' + this.insertion + '");';
    //console.log(query)
    const result = db.default.pdo(query);
    return result;
  }

  public getRecords() {
    // tslint:disable-next-line:max-line-length
    const query = 'CALL getFile("' + this.fileId + '");';
    const result = db.default.pdo(query);
    return result;
  }

 
  public async deleteData(table: string, where: string = '') {
    const query = `DELETE FROM ${table} WHERE ${where}`;
    console.log("Executing delete:", query);
    
    try {
      const result:any = await db.default.pdo(query);
      
      // Log successful delete operation
        cloudWatchLogger.info("Database delete operation", {
          operation: 'deleteData',
          tableName: table,
          where,
          affectedRows: (result as any).affectedRows || 0
        });
      
      return result;
    } catch (error) {
      cloudWatchLogger.error("Database error in deleteData", error, {
        operation: 'deleteData',
        tableName: table,
        where
      });
      throw error;
    }
  }


  public async callQuerySafe(query: string, params: any[] = []): Promise<any> {
    try {
      console.log("callQuerySafe", query, params)
      const result:any = await db.default.pdo(query, params);

      
      // Log database operations (UPDATE, DELETE, INSERT) but not SELECT queries to reduce noise
      const operation = query.trim().split(' ')[0].toUpperCase();
      if (['UPDATE', 'DELETE', 'INSERT'].includes(operation)) {
        cloudWatchLogger.info(`Database ${operation} operation via callQuerySafe`, {
          operation: 'callQuerySafe',
          sqlOperation: operation,
          query: query.substring(0, 200), // Log first 200 chars
          affectedRows: (result as any).affectedRows || 0
        });
      }
      
      this.resetSelectSettings();
      return result;
    } catch (error) {
      cloudWatchLogger.error("Database error in callQuerySafe", error, {
        query: query.substring(0, 100), // Log first 100 chars of query
        operation: 'callQuerySafe'
      });
      throw error;
    }
  }

  public async callParameterizedQuery(query: string, params: any[] = [], connType: string = 'normal') {
    try {
      console.log("Executing SQL:", query);
      console.log("With Params:", params);
      const result = await db.default.pdo(query, params, connType);
      this.resetSelectSettings();
      return result;
    } catch (error) {
      logger.error("Query", error);
      throw error;
    }
  }



  /**
   * Select data from a table with parameterized queries.
   * WARNING: Only supports '=' operator and 'AND' conditions.
   * For other operators (<, >, !=, LIKE, etc.), use callQuerySafe() directly.
   * @example
   * // This works:
   * await selectDataQuery('users', `user_id='123' AND status='active'`);
   * 
   * // This will NOT work (use callQuerySafe instead):
   * await selectDataQuery('users', `created_at < '2024-10-24'`);
   */
  public async selectDataQuery(tableName: string, condition: string = "", limit: number = 100, orderBy: string = ''): Promise<any> {
    try {
      let whereClause = "";
      const conditionValues: any[] = [];

      // Split the condition to create parameterized queries
      if (condition) {
        // Regex to match conditions like `column='value'`
        // NOTE: This only supports '=' operator!
        const conditionRegex = /(\w+)\s*=\s*['"]([^'"]+)['"]/g;
        let match;

        // Replace the condition with placeholders and extract values
        whereClause = "WHERE ";
        while ((match = conditionRegex.exec(condition)) !== null) {
          whereClause += `${match[1]} = ? AND `;
          conditionValues.push(match[2]);
        }
        whereClause = whereClause.slice(0, -5); // Remove last 'AND '
      }
      // Handle order by clause
      let orderByClause = "";
      if (orderBy) {
        const orderByParts = orderBy.split(' ');
        const orderByColumn = orderByParts[0];
        const orderByDirection = orderByParts[1] ? orderByParts[1].toUpperCase() : 'ASC';
        if (orderByDirection !== 'ASC' && orderByDirection !== 'DESC') {
          throw new Error("Invalid order direction. Use 'ASC' or 'DESC'.");
        }
        orderByClause = `ORDER BY ${orderByColumn} ${orderByDirection}`;
      }
      // Construct the final query
      const query = `SELECT * FROM ${tableName} ${whereClause}  ${orderByClause} LIMIT ${limit}`;
      console.log("Executing query:", query, "with values:", conditionValues);

      // Execute the query with parameterized values
      const result = await this.callQuerySafe(query, conditionValues);
      this.resetSelectSettings();
      return Array.isArray(result) ? result : [result];
    } catch (error) {
      cloudWatchLogger.error("Database query error in selectParameterized", error, {
        operation: 'selectParameterized'
      });
      return [];
    }
  }

  public async selectData(tableName: string, conditions: any = {}, limit: number = 100) {
    try {
      const conditionKeys = Object.keys(conditions);
      const conditionValues = Object.values(conditions);

      // Building the WHERE clause with placeholders
      const whereClause = conditionKeys.length
        ? 'WHERE ' + conditionKeys.map((key) => `${key} = ?`).join(' AND ')
        : '';

      const query = `SELECT * FROM ${tableName} ${whereClause} LIMIT ${limit}`;

      console.log('Executing query:', query, 'with values:', conditionValues);

      // Execute the query with parameterized values
      const result = await db.default.pdo(query, conditionValues);
      return Array.isArray(result) ? result : [result];
    } catch (error) {
      cloudWatchLogger.error("Database error in selectData", error, {
        tableName,
        conditions,
        limit,
        operation: 'selectData'
      });
      return [];
    }
  }


 

  private resetSelectSettings() {
    this.selectWhere = '';
    this.orderBy = '';
    this.orderIs = '';
    this.selectCols = '';
    this.offsets = 0;
  }

  public async updateData(table: string, where: string, data: any) {
    return new Promise(async (resolve, reject) => {
      this.tableName = table;
      this.updateWhere = where;

      const keys = Object.keys(data);
      const values = Object.values(data);

      // Constructing the update part of the query
      const updates = keys.map((key, index) => `${key} = ?`).join(', ');

      // Construct the full SQL update query
      const query = `UPDATE ${table} SET ${updates} WHERE ${where}`;
      console.log("query", query, values);

      try {
        const result = await db.default.pdo(query, values);
        console.log("DBUPDATE==>", result);
        
        // Log successful update operation
        cloudWatchLogger.info("Database update operation", {
          operation: 'updateData',
          tableName: table,
          where,
          affectedRows: (result as any).affectedRows || 0,
          changedRows: (result as any).changedRows || 0
        });
        
        resolve(true); // Resolve with true on successful update
      } catch (error) {
        cloudWatchLogger.error("Database error in updateData", error, {
          operation: 'updateData',
          tableName: table,
          where
        });
        reject(new Error("Database update failed")); // Don't expose internal error details
      }
    });
  }

  public async insertData(table: string, data: any) {
    this.tableName = table;
    const keys = Object.keys(data);
    const values: any = Object.values(data);
    const placeholders = keys.map(() => '?').join(',');
    const query = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`;
    console.log("insertData", query);
    try {
      const result: any = await db.default.pdo(query, values);
      const lastId = result.insertId; // This line gets the last inserted ID
      
   
      return lastId;
    } catch (error: any) {
      console.log("DBINSERTERROR=======>", error)
      cloudWatchLogger.error("Database error in insertData", error, {
        operation: 'insertData',
        tableName: table
      });
      throw new Error("Database insertion failed");
    }
  }

  public async checkAndAddColumn(tableName: string, columnName: string): Promise<void> {
    const columnType = 'VARCHAR(100)';
    const columnExists = await this.checkColumnExists(tableName, columnName);

    if (!columnExists) {
      // Add the column if it doesn't exist
      await this.addColumn(tableName, columnName, columnType);
    }
  }

  private async checkColumnExists(tableName: string, columnName: string): Promise<boolean> {
    try {
      // Query to check if the column exists in the table
      const query = `SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}' AND COLUMN_NAME = '${columnName}'`;

      // Execute the query
      const result: any = await db.default.pdo(query);

      // If the result contains any rows, the column exists
      return result.length > 0;
    } catch (error) {
      cloudWatchLogger.error("Error checking column existence", error, {
        operation: 'checkColumnExists'
      });
      return false;
    }
  }

  private async addColumn(tableName: string, columnName: string, columnType: string): Promise<void> {
    try {
      // Query to add a new column to the table
      const query = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`;

      // Execute the query
      await db.default.pdo(query);

      // Log success or perform any other action
      console.log(`Column '${columnName}' added to table '${tableName}'`);
    } catch (error) {
      cloudWatchLogger.error("Error adding column", error, {
        operation: 'addColumn'
      });
    }
  }

  public async beginTransaction() {
    try {
      await db.default.pdo('START TRANSACTION;');
    } catch (error) {
      logger.error("beginTransaction", error);
      throw error;
    }
  }

  public async commitTransaction() {
    try {
      await db.default.pdo('COMMIT;');
    } catch (error) {
      logger.error("commitTransaction", error);
      throw error;
    }
  }

  public async rollbackTransaction() {
    try {
      await db.default.pdo('ROLLBACK;');
    } catch (error) {
      logger.error("rollbackTransaction", error);
      throw error;
    }
  }
}

export default BaseModel;
