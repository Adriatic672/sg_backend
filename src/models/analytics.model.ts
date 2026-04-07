import Model from '../helpers/model';

export default class AnalyticsModel extends Model {
  
  // Get detailed analytics from act_comprehensive_analytics
  async getDetailedAnalytics(userId: string, platform: string, limit: number = 1) {
    try {
      const username  = await this.getUserSiteName(userId, platform);
      const query = `
        SELECT * FROM act_comprehensive_analytics 
        WHERE username = ? AND platform = ?
        ORDER BY created_at DESC 
        LIMIT ?
      `;

      const result = await this.callParameterizedQuery(query, [username, platform, limit]) as any[];
      
      if (result.length === 0) {
        return this.makeResponse(404, 'No detailed analytics found for this user and platform');
      }

      // Parse the comprehensive_data JSON
      const detailedAnalytics = result.map((row: any) => ({
        ...row,
        comprehensive_data: JSON.parse(row.comprehensive_data)
      }));

      return this.makeResponse(200, 'Detailed analytics retrieved successfully', detailedAnalytics);
    } catch (error) {
      console.error('Error fetching detailed analytics:', error);
      return this.makeResponse(500, 'Error fetching detailed analytics');
    }
  }

  // Get summary analytics from act_analytics_logs
  async getSummaryAnalytics(username: string, platform: string, limit: number = 1) {
    try {
      const query = `
        SELECT * FROM act_analytics_logs 
        WHERE username = ? AND platform = ?
        ORDER BY created_at DESC 
        LIMIT ?
      `;

      const result = await this.callParameterizedQuery(query, [username, platform, limit]) as any[];
      
      if (result.length === 0) {
        return this.makeResponse(404, 'No summary analytics found for this user and platform');
      }

      return this.makeResponse(200, 'Summary analytics retrieved successfully', result);
    } catch (error) {
      console.error('Error fetching summary analytics:', error);
      return this.makeResponse(500, 'Error fetching summary analytics');
    }
  }

    async getUserSiteName(userId: string, site_id: string) {
    const query = `
      SELECT * FROM sm_site_users WHERE user_id = ? AND site_id = ?
    `;
    const result = await this.callParameterizedQuery(query, [userId, site_id]) as any[];
    return result[0].username || null;
  }

  // Get analytics for all platforms for a user
  async getUserAnalytics(userId: string, site_id: string, type: 'summary' | 'detailed' = 'summary') {
    try {
      const username = await this.getUserSiteName(userId, site_id);
      if (!username) {
        return this.makeResponse(404, 'No username found for this user and platform');
      }
      if (type === 'detailed') {
        const query = `
          SELECT * FROM act_comprehensive_analytics 
          WHERE username = ?
          ORDER BY platform, created_at DESC
        `;
        const result = await this.callParameterizedQuery(query, [username]) as any[];
        
        const detailedAnalytics = result.map((row: any) => ({
          ...row,
          comprehensive_data: JSON.parse(row.comprehensive_data)
        }));

        return this.makeResponse(200, 'Detailed analytics retrieved successfully', detailedAnalytics);
      } else {
        const query = `
          SELECT * FROM act_analytics_logs 
          WHERE username = ?
          ORDER BY platform, created_at DESC
        `;
        const result = await this.callParameterizedQuery(query, [username]) as any[];

        return this.makeResponse(200, 'Summary analytics retrieved successfully', result);
      }
    } catch (error) {
      console.error('Error fetching user analytics:', error);
      return this.makeResponse(500, 'Error fetching user analytics');
    }
  }

  async syncVerifiedUser(site_id: string, userId: string) {
    try {
      const query = `
        SELECT ssu.*, ss.sm_name as platform_name 
        FROM sm_site_users ssu
        JOIN sm_sites ss ON ssu.site_id = ss.site_id
        WHERE ssu.is_verified = 'yes' AND ssu.site_id = ? AND ssu.user_id = ?
      `;

      const result = await this.callParameterizedQuery(query, [site_id, userId]);
      return this.makeResponse(200, 'Verified user retrieved successfully', result);
    } catch (error) {
      console.error('Error fetching verified user:', error);
      return this.makeResponse(500, 'Error fetching verified user');
    }
  }

  // Get verified users from sm_site_users for sync
  async getVerifiedUsersForSync() {
    try {
      const query = `
        SELECT ssu.*, ss.sm_name as platform_name 
        FROM sm_site_users ssu
        JOIN sm_sites ss ON ssu.site_id = ss.site_id
        WHERE ssu.is_verified = 'yes'
        AND (ssu.next_sync IS NULL OR ssu.next_sync <= NOW())
        ORDER BY ssu.next_sync ASC
      `;

        const result = await this.callQuerySafe(query);
      return this.makeResponse(200, 'Verified users for sync retrieved successfully', result);
    } catch (error) {
      console.error('Error fetching verified users for sync:', error);
      return this.makeResponse(500, 'Error fetching verified users for sync');
    }
  }

  // Update next_sync date for a user
  async updateNextSyncDate(socialId: string, nextSyncDate: string) {
    try {
      const query = `
        UPDATE sm_site_users 
        SET next_sync = ? 
        WHERE social_id = ?
      `;

      await this.callParameterizedQuery(query, [nextSyncDate, socialId]);
      return this.makeResponse(200, 'Next sync date updated successfully');
    } catch (error) {
      console.error('Error updating next sync date:', error);
      return this.makeResponse(500, 'Error updating next sync date');
    }
  }

  // Get the latest analytics for a user and platform
  async getLatestAnalytics(username: string, platform: string) {
    try {
      // Get latest summary analytics
      const summaryQuery = `
        SELECT * FROM act_analytics_logs 
        WHERE username = ? AND platform = ?
        ORDER BY created_at DESC 
        LIMIT 1
      `;
      const summaryResult = await this.callParameterizedQuery(summaryQuery, [username, platform]) as any[];

      // Get latest detailed analytics
      const detailedQuery = `
        SELECT * FROM act_comprehensive_analytics 
        WHERE username = ? AND platform = ?
        ORDER BY created_at DESC 
        LIMIT 1
      `;
      const detailedResult = await this.callParameterizedQuery(detailedQuery, [username, platform]) as any[];

      const result = {
        summary: summaryResult.length > 0 ? summaryResult[0] : null,
        detailed: detailedResult.length > 0 ? {
          ...detailedResult[0],
          comprehensive_data: JSON.parse(detailedResult[0].comprehensive_data)
        } : null
      };

      return this.makeResponse(200, 'Latest analytics retrieved successfully', result);
    } catch (error) {
      console.error('Error fetching latest analytics:', error);
      return this.makeResponse(500, 'Error fetching latest analytics');
    }
  }
} 