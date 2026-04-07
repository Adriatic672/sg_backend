import cron from 'node-cron';
import { InfluencerAnalytics } from '../thirdparty/InfluencerAnalytics';
import AnalyticsModel from '../models/analytics.model';
import { logger } from '../utils/logger';

export class AnalyticsSyncCron {
  private analyticsService: InfluencerAnalytics;
  private analyticsModel: AnalyticsModel;

  constructor() {
    this.analyticsService = new InfluencerAnalytics();
    this.analyticsModel = new AnalyticsModel();
  }

  // Start the analytics sync cron job
  startAnalyticsSync() {
    // Run every day at 2 AM to check for users that need syncing
    cron.schedule('0 2 * * *', async () => {
      try {
        console.log('🔄 Starting daily analytics sync check...');
        await this.syncAnalyticsForVerifiedUsers();
        console.log('✅ Daily analytics sync check completed');
      } catch (error) {
        console.error('❌ Error in daily analytics sync:', error);
        logger.error('Analytics sync cron error:', error);
      }
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    console.log('📅 Analytics sync cron job scheduled (daily at 2 AM UTC)');
  }

  // Sync analytics for verified users
  async syncAnalyticsForVerifiedUsers() {
    try {
      // Get verified users that need syncing
      const verifiedUsersResult = await this.analyticsModel.getVerifiedUsersForSync();
      
      if (verifiedUsersResult.status !== 200) {
        console.error('❌ Failed to get verified users for sync:', verifiedUsersResult.message);
        return;
      }

      const verifiedUsers = verifiedUsersResult.data || [];
      console.log(`📊 Found ${verifiedUsers.length} verified users that need syncing`);

      if (verifiedUsers.length === 0) {
        console.log('✅ No users need syncing today');
        return;
      }

      // Process each user
      for (const user of verifiedUsers) {
        try {
          await this.syncUserAnalytics(user);
        } catch (error) {
          console.error(`❌ Error syncing analytics for user ${user.username}:`, error);
          logger.error(`Analytics sync error for user ${user.username}:`, error);
        }
      }

      console.log(`✅ Completed analytics sync for ${verifiedUsers.length} users`);

    } catch (error) {
      console.error('❌ Error in syncAnalyticsForVerifiedUsers:', error);
      logger.error('Analytics sync error:', error);
    }
  }

  // Sync analytics for a specific user
  async syncUserAnalytics(user: any) {
    try {
      console.log(`🔄 Syncing analytics for @${user.username} on ${user.platform_name}...`);

      // Map site_id to platform name
      const platformMap: { [key: number]: string } = {
        1: 'twitter',
        2: 'tiktok', 
        3: 'facebook',
        4: 'instagram'
      };

      const platform = platformMap[user.site_id];
      if (!platform) {
        console.log(`⚠️ Unknown platform for site_id ${user.site_id}, skipping...`);
        return;
      }

      // Track analytics for this user and platform
      const result = await this.analyticsService.trackPlatformPerformance(user.username, platform);
      
      if (result) {
        console.log(`✅ Successfully synced analytics for @${user.username} on ${platform}`);
        
        // Update next_sync date to 1 month from now
        const nextSyncDate = new Date();
        nextSyncDate.setMonth(nextSyncDate.getMonth() + 1);
        
        await this.analyticsModel.updateNextSyncDate(user.social_id, nextSyncDate.toISOString().slice(0, 19).replace('T', ' '));
        console.log(`📅 Updated next sync date for @${user.username} to ${nextSyncDate.toISOString().split('T')[0]}`);
      } else {
        console.log(`⚠️ No analytics data found for @${user.username} on ${platform}`);
      }

    } catch (error) {
      console.error(`❌ Error syncing analytics for @${user.username}:`, error);
      throw error;
    }
  }

  // Manual sync for a specific user (for testing or immediate sync)
  async manualSyncUser(username: string, platform: string) {
    try {
      console.log(`🔄 Manual sync for @${username} on ${platform}...`);
      
      const result = await this.analyticsService.trackPlatformPerformance(username, platform);
      
      if (result) {
        console.log(`✅ Manual sync completed for @${username} on ${platform}`);
        return { success: true, message: 'Manual sync completed successfully' };
      } else {
        console.log(`⚠️ No analytics data found for @${username} on ${platform}`);
        return { success: false, message: 'No analytics data found' };
      }

    } catch (error) {
      console.error(`❌ Error in manual sync for @${username}:`, error);
      return { success: false, message: 'Manual sync failed', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Get sync status for all users
  async getSyncStatus() {
    try {
      const verifiedUsersResult = await this.analyticsModel.getVerifiedUsersForSync();
      
      if (verifiedUsersResult.status !== 200) {
        return { success: false, message: 'Failed to get sync status' };
      }

      const verifiedUsers = verifiedUsersResult.data || [];
      
      const syncStatus = verifiedUsers.map((user: any) => ({
        username: user.username,
        platform: user.platform_name,
        next_sync: user.next_sync,
        needs_sync: !user.next_sync || new Date(user.next_sync) <= new Date(),
        social_id: user.social_id
      }));

      return { 
        success: true, 
        data: syncStatus,
        total_users: syncStatus.length,
        users_needing_sync: syncStatus.filter((u: any) => u.needs_sync).length
      };

    } catch (error) {
      console.error('❌ Error getting sync status:', error);
      return { success: false, message: 'Failed to get sync status', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

export default AnalyticsSyncCron; 