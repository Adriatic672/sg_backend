import { OpenAI } from "openai";
import Model from "../helpers/model";
import { logger } from "../utils/logger";
import * as fs from 'fs';
import * as path from 'path';

interface QueryResult {
  type: 'chart' | 'table';
  sql: string;
  data: any[];
  chartConfig?: {
    title: string;
    xField?: string;
    yField?: string;
    chartType: 'bar' | 'line' | 'pie' | 'area';
  };
}

class GemsAI extends Model {
  private openai: OpenAI;
  private assistantId: string | null = null;

  constructor() {
    super();
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY in environment variables");
    }
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  private async initializeAssistant(): Promise<void> {
    const storedAssistantId = process.env.OPENAI_ASSISTANT_ID || "asst_oN5rc7xjwCrLViNhUqptldZ7"
    if (!storedAssistantId) {
      throw new Error("OPENAI_ASSISTANT_ID is not set in environment variables. Please set it to your manually created assistant ID.");
    }
    this.assistantId = storedAssistantId;
  }

  private async generateSQL(question: string): Promise<{ sql: string; type: 'chart' | 'table'; chartConfig?: any }> {
    try {
      // Initialize assistant if needed
      if (!this.assistantId) {
        await this.initializeAssistant();
      }

      // Create a thread
      const thread = await this.openai.beta.threads.create();

      // Add message to thread
      await this.openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: `Generate a MySQL query for: "${question}"`
      });

      // Run the assistant
      const run = await this.openai.beta.threads.runs.create(thread.id, {
        assistant_id: this.assistantId!
      });

      // Wait for completion with timeout
      let runStatus = await this.openai.beta.threads.runs.retrieve(thread.id, run.id);
      let attempts = 0;
      const maxAttempts = 15; // 15 seconds timeout
      
      while (runStatus.status === 'in_progress' || runStatus.status === 'queued') {
        if (attempts >= maxAttempts) {
          logger.warn("Assistant timeout, falling back to legacy method");
          await this.openai.beta.threads.del(thread.id);
          return this.generateSQLLegacy(question);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await this.openai.beta.threads.runs.retrieve(thread.id, run.id);
        attempts++;
      }

      if (runStatus.status === 'completed') {
        // Get the response
        const messages = await this.openai.beta.threads.messages.list(thread.id);
        const lastMessage = messages.data[0];
        
        if (lastMessage.role === 'assistant' && lastMessage.content[0].type === 'text') {
          let content = lastMessage.content[0].text.value.trim();
          // Remove code block markers if present
          if (content.startsWith('```json')) {
            content = content.replace(/^```json/, '').replace(/```$/, '').trim();
          } else if (content.startsWith('```')) {
            content = content.replace(/^```/, '').replace(/```$/, '').trim();
          }
          // Parse JSON response
          const parsed = JSON.parse(content);
          // Clean up the thread
          await this.openai.beta.threads.del(thread.id);
          return parsed;
        }
      }

      throw new Error("Assistant run failed: " + runStatus.status);

    } catch (error: any) {
      logger.error("Error generating SQL with assistant:", error);
      return this.generateSQLLegacy(question);
    }
  }

  // Fast fallback method using direct chat completions
  private async generateSQLLegacy(question: string): Promise<{ sql: string; type: 'chart' | 'table'; chartConfig?: any }> {
    const prompt = `Based on schema: users(user_id,email,created_at), users_profile(user_id,iso_code,username), user_wallets(wallet_id,user_id,asset,balance)

Question: "${question}"

JSON only:
{
  "sql": "SELECT ... WHERE iso_code IS NOT NULL ... LIMIT 100",
  "type": "chart",
  "chartConfig": {
    "title": "Title",
    "xField": "x_col",
    "yField": "y_col",
    "chartType": "bar"
  }
}`;

    const response = await this.openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("No response from OpenAI");

    // Clean content same as assistant
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```/, '').replace(/```$/, '').trim();
    }

    return JSON.parse(cleanContent);
  }

  private validateSQL(sql: string): boolean {
    // Basic SQL injection prevention
    const dangerous = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'TRUNCATE'];
    const upperSQL = sql.toUpperCase();
    
    for (const keyword of dangerous) {
      if (upperSQL.includes(keyword)) {
        logger.error("DANGEROUS SQL", keyword);
        return false;
      }
    }

    // Must start with SELECT
    if (!upperSQL.trim().startsWith('SELECT')) {
      logger.error("DANGEROUS SQL2", upperSQL);
      return false;
    }

    return true;
  }

  private determineChartType(data: any[]): string {
    if (!data.length) return 'table';
    
    const firstRow = data[0];
    const keys = Object.keys(firstRow);
    
    // If we have exactly 2 columns and one looks like a count/sum
    if (keys.length === 2) {
      const hasNumericField = keys.some(key => 
        ['count', 'sum', 'avg', 'total', 'amount'].some(term => 
          key.toLowerCase().includes(term)
        )
      );
      
      if (hasNumericField) {
        return 'chart';
      }
    }
    
    // If we have GROUP BY results (multiple rows with aggregated data)
    if (data.length > 1 && data.length < 50) {
      const hasAggregatedData = keys.some(key => 
        typeof firstRow[key] === 'number' && 
        ['count', 'sum', 'avg', 'total', 'amount'].some(term => 
          key.toLowerCase().includes(term)
        )
      );
      
      if (hasAggregatedData) {
        return 'chart';
      }
    }
    
    return 'table';
  }

  public async runAIQuery(question: string): Promise<QueryResult> {
    try {
      logger.info("Running AI Query:", question);

      // Generate SQL from natural language using Assistant API
      const { sql, type, chartConfig } = await this.generateSQL(question);
      
      // Validate SQL for security
      if (!this.validateSQL(sql)) {
        throw new Error("Invalid or potentially dangerous SQL query");
      }

      logger.info("Generated SQL:", sql);

      // Execute the query
      const rawData = await this.callQuerySafe(sql);
      let data: any[] = Array.isArray(rawData) ? rawData : [rawData];

      // Auto-determine type first
      const finalType = type === 'chart' ? 'chart' : this.determineChartType(data);

      // Only clean data for charts (not tables) and only if we have null issues
      if (finalType === 'chart' && data.length > 0 && data.some(row => Object.values(row).some(val => val === null))) {
        // Quick filter: remove rows where any value is null (for charts only)
        data = data.filter(row => !Object.values(row).some(val => val === null || val === undefined || val === ''));
      }

      const result: QueryResult = {
        type: finalType as 'chart' | 'table',
        sql,
        data,
      };

      // Add chart configuration for chart types
      if (finalType === 'chart' && chartConfig) {
        result.chartConfig = {
          ...chartConfig,
          // Ensure chart has proper field mappings
          xField: chartConfig.xField || Object.keys(data[0] || {})[0] || 'x',
          yField: chartConfig.yField || Object.keys(data[0] || {})[1] || 'y',
          chartType: chartConfig.chartType || 'bar'
        };
      } else if (finalType === 'chart' && !chartConfig) {
        // Auto-generate chart config if missing
        const firstRow = data[0] || {};
        const keys = Object.keys(firstRow);
        result.chartConfig = {
          title: question.toUpperCase(),
          xField: keys[0] || 'x',
          yField: keys[1] || 'y',
          chartType: 'bar'
        };
      }

      logger.info("Query result:", { type: finalType, rowCount: result.data.length });
      
      return result;

    } catch (error) {
      logger.error("Error in runAIQuery:", error);
      throw new Error(`Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Helper method for testing predefined queries
  public async runPredefinedQuery(queryType: string): Promise<QueryResult> {
    const predefinedQueries: Record<string, string> = {
      'users_by_country': 'SELECT p.iso_code as country, COUNT(*) as user_count FROM users u JOIN users_profile p ON u.user_id = p.user_id GROUP BY p.iso_code ORDER BY user_count DESC LIMIT 10',
      'recent_signups': 'SELECT DATE(u.created_at) as date, COUNT(*) as signups FROM users u WHERE u.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY DATE(u.created_at) ORDER BY date',
      'top_wallets': 'SELECT w.wallet_id, w.user_id, w.asset, w.balance FROM user_wallets w ORDER BY w.balance DESC LIMIT 10',
      'wallet_by_asset': 'SELECT w.asset, COUNT(*) as wallet_count, SUM(w.balance) as total_balance FROM user_wallets w GROUP BY w.asset ORDER BY total_balance DESC',
    };

    const sql = predefinedQueries[queryType];
    if (!sql) {
      throw new Error("Predefined query not found");
    }

    const rawData = await this.callQuerySafe(sql);
    const data: any[] = Array.isArray(rawData) ? rawData : [rawData];
    
    return {
      type: 'chart',
      sql,
      data,
      chartConfig: {
        title: queryType.replace('_', ' ').toUpperCase(),
        xField: Object.keys(data[0] || {})[0] || 'x',
        yField: Object.keys(data[0] || {})[1] || 'y',
        chartType: 'bar'
      }
    };
  }
}

export default GemsAI; 