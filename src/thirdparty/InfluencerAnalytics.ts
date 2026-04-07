import TikTokAPIv2   from "./Rapid.TikTok";
import InstagramAPI from "./Rapid.Instagram";
import FacebookAPI from "./Facebook";
import Model from "../helpers/model";
import RapiAPI from "./Rapid.X";
import { AnalyticsLog, NetworkData } from "./analytics/influencer";
import { PostInterface } from "./analytics/post.interface";

// Define the expected post shape
export interface PostMetrics {
  site_id: 'tiktok' | 'facebook' | 'instagram' | 'youtube' | 'twitter';
  likes: number;
  views: number;
  comments: number;
  shares?: number;
  saves?: number;
  post_date?: string;
  post_id?: string;
}

// TikTok API post structure
export interface TikTokPost {
  id: string;
  desc: string;
  createTime: number;
  author: {
    id: string;
    uniqueId: string;
    nickname: string;
    avatarThumb: string;
    verified: boolean;
  };
  stats: {
    diggCount: number;      // likes
    commentCount: number;   // comments
    shareCount: number;     // shares
    playCount: number;      // views
    collectCount: number;   // saves/bookmarks
  };
  video: {
    id: string;
    height: number;
    width: number;
    duration: number;
    ratio: string;
    cover: string;
    originCover: string;
    dynamicCover: string;
    playAddr: string;
    downloadAddr: string;
  };
  music: {
    id: string;
    title: string;
    author: string;
    album: string;
    playUrl: string;
    duration: number;
  };
  hashtags?: Array<{
    id: string;
    name: string;
    title: string;
    cover: string;
  }>;
  mentions?: Array<{
    id: string;
    uniqueId: string;
    nickname: string;
    avatarThumb: string;
  }>;
}

// Define engagement rating categories
export type EngagementRating = 'POOR' | 'AVERAGE' | 'GOOD' | 'EXCELLENT' | 'STAR';

// Define the function result
export interface InfluencerAnalyticsResult {
  totalPosts: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalViews: number;
  avgViewsPerPost: number;
  engagementRate: number; // % out of 100
  engagementRating: EngagementRating; // Industry standard rating
  growthRate?: number; // % change from previous period
  bestPerformingPost?: PostMetrics;
  worstPerformingPost?: PostMetrics;
}


export class InfluencerAnalytics extends Model {

  // Get engagement rating based on industry standards
  // Adjusted for mega-influencers (10M+ followers) vs smaller accounts
  getEngagementRating(engagementRate: number): EngagementRating {
    // For mega-influencers (10M+ followers), engagement rates are typically much lower
    // Twitter/X specifically has lower engagement rates due to the nature of the platform
    if (engagementRate >= 1) return 'STAR';        // Exceptional for mega-influencers
    if (engagementRate >= 0.5) return 'EXCELLENT'; // Very good for mega-influencers  
    if (engagementRate >= 0.05) return 'GOOD';     // Good for mega-influencers (lowered from 0.1)
    if (engagementRate >= 0.01) return 'AVERAGE';  // Average for mega-influencers (lowered from 0.05)
    return 'POOR';
  }

  // Convert TikTok posts to PostMetrics format
  convertTikTokPostsToMetrics(tiktokPosts: any[]): PostMetrics[] {
    return tiktokPosts.map(post => {
      // Handle different possible API response structures
      const postId = post.aweme_id || post.id || post.video_id;
      const createTime = post.create_time || post.createTime || Date.now() / 1000;

      // Handle stats from different possible locations
      const stats = post.stats || post;
      const likes = stats.digg_count || stats.diggCount || stats.likes || 0;
      const comments = stats.comment_count || stats.commentCount || stats.comments || 0;
      const shares = stats.share_count || stats.shareCount || stats.shares || 0;
      const views = stats.play_count || stats.playCount || stats.views || 0;
      const saves = stats.collect_count || stats.collectCount || stats.saves || 0;

      return {
        site_id: 'tiktok',
        post_id: postId,
        likes: likes,
        comments: comments,
        shares: shares,
        views: views,
        saves: saves,
        post_date: new Date(createTime * 1000).toISOString()
      };
    });
  }

  // Convert Twitter posts to PostMetrics format
  convertTwitterPostsToMetrics(twitterPosts: any[]): PostMetrics[] {
    return twitterPosts.map(post => {
      // Parse the created_at date
      const createDate = post.created_at ? new Date(post.created_at) : new Date();

      return {
        site_id: 'twitter',
        post_id: post.id,
        likes: post.favorites || 0,
        comments: post.replies || 0,
        shares: post.retweets || 0,
        views: parseInt(post.views) || 0,
        saves: post.bookmarks || 0,
        post_date: createDate.toISOString()
      };
    });
  }

  // Convert Instagram posts to PostMetrics format
  convertInstagramPostsToMetrics(instagramPosts: any[]): PostMetrics[] {
    return instagramPosts.map(post => {
      // Parse the created_at date
      const createDate = post.created_at ? new Date(post.created_at) : new Date();

      return {
        site_id: 'instagram',
        post_id: post.id,
        likes: post.likes || 0,
        comments: post.comments || 0,
        shares: 0, // Instagram doesn't have shares in the same way
        views: post.views || 0,
        saves: post.saves || 0,
        post_date: createDate.toISOString()
      };
    });
  }

  // Main tracking method for all platforms
  async trackInfluencerPerformance(username: string, platforms: string[] = ['tiktok', 'instagram', 'facebook', 'twitter']) {
    try {
      console.log(`🚀 Starting performance tracking for ${username} across platforms: ${platforms.join(', ')}`);
      console.log('='.repeat(60));

      const results: any = {};

      for (const platform of platforms) {
        try {
          console.log(`\n📊 Tracking ${platform} for ${username}...`);
          console.log('-'.repeat(40));

          const platformAnalytics = await this.trackPlatformPerformance(username, platform);
          results[platform] = platformAnalytics;

          console.log(`✅ ${platform} tracking completed successfully!`);
          console.log(`📈 Results for ${platform}:`);
          console.log(`   - Total Posts: ${platformAnalytics.totalPosts}`);
          console.log(`   - Total Likes: ${platformAnalytics.totalLikes.toLocaleString()}`);
          console.log(`   - Total Comments: ${platformAnalytics.totalComments.toLocaleString()}`);
          console.log(`   - Total Shares: ${platformAnalytics.totalShares.toLocaleString()}`);
          console.log(`   - Total Views: ${platformAnalytics.totalViews.toLocaleString()}`);
          console.log(`   - Engagement Rate: ${platformAnalytics.engagementRate}%`);
          console.log(`   - Engagement Rating: ${platformAnalytics.engagementRating} 🏆`);
          console.log(`   - Growth Rate: ${platformAnalytics.growthRate || 0}%`);
          console.log(`   - Posts Analyzed: ${platformAnalytics.postsAnalyzed}`);

        } catch (error: any) {
          console.error(`❌ Error tracking ${platform} for ${username}:`, error);
          results[platform] = { error: error.message };
        }
      }

      console.log('\n📋 Generating comprehensive report...');
      const comprehensiveReport = await this.generateComprehensiveReport(username, results);

      console.log('🎉 Comprehensive tracking completed!');
      console.log('='.repeat(60));

      return {
        username,
        tracking_date: new Date().toISOString(),
        platforms: results,
        comprehensive_report: comprehensiveReport
      };

    } catch (error) {
      console.error('💥 Error in comprehensive tracking:', error);
      throw error;
    }
  }

  // Track performance for a specific platform
  async trackPlatformPerformance(username: string, platform: string) {
    try {
      console.log(`   🔍 Getting user data for ${platform}...`);
      let posts = [];
      let followerCount = 0;

      // Get posts from appropriate API
      switch (platform) {
        case 'tiktok':
          const tiktokResponse:NetworkData = await new TikTokAPIv2().getUserAnalytics(username);
          const userPosts = await new TikTokAPIv2().getUserPosts(username);
          posts = this.convertTikTokPostsToMetrics(userPosts || []);
          followerCount = tiktokResponse.overview?.followers || 0;
          await this.saveComprehensiveAnalytics(username, 'tiktok', tiktokResponse);
          break;
        case 'twitter':
          const xResponse:NetworkData = await new RapiAPI().getUserAnalytics(username);
          const xUserPosts = await new RapiAPI().getUserPosts(username);
          posts = this.convertTwitterPostsToMetrics(xUserPosts || []);
          followerCount = xResponse.overview?.followers || 0;
          await this.saveComprehensiveAnalytics(username, 'twitter', xResponse);
          break;

        case 'instagram':
          const instagramResponse:NetworkData = await new InstagramAPI().getUserAnalytics(username);
          const instagramPosts = await new InstagramAPI().getUserPosts(username);
          const instagramReels = await new InstagramAPI().getUserReels(username);
          const postsMetrics = this.convertInstagramPostsToMetrics(instagramPosts || []);
          const reelsMetrics = this.convertInstagramPostsToMetrics(instagramReels || []); // Reuse the same converter

          // Combine posts and reels
          posts = [...postsMetrics, ...reelsMetrics];
          followerCount = instagramResponse.overview?.followers || 0;
          console.log(`   💾 Saving comprehensive analytics to database...`);
          await this.saveComprehensiveAnalytics(username, 'instagram', instagramResponse);
          console.log(`   👥 Follower count: ${followerCount.toLocaleString()}`);
          console.log(`   ✅ Instagram data processing completed`);
          break;

        case 'facebook':
          const facebookResponse: any = await new FacebookAPI().getUserPosts(username);
          posts = facebookResponse?.data || [];
          followerCount = facebookResponse?.data?.follower_count || 0;
          break;

        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      // Filter posts from last 2 months
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

      console.log(`   📅 Filtering posts from last 2 months (${twoMonthsAgo.toISOString().split('T')[0]} onwards)...`);
      const recentPosts = posts.filter((post: any) => {
        if (!post.post_date) return true; // Include if no date available
        return new Date(post.post_date) >= twoMonthsAgo;
      });
      console.log(`   📊 Found ${recentPosts.length} recent posts out of ${posts.length} total posts`);

      // Calculate analytics
      console.log(`   🧮 Calculating analytics for ${recentPosts.length} posts...`);
      const analytics = this.getInfluencerAnalytics(recentPosts, followerCount);

      // Calculate growth rate by comparing with previous period
      console.log(`   📈 Calculating growth rate...`);
      const growthRate = await this.calculateGrowthRate(username, platform);

      // Find best and worst performing posts
      console.log(`   🏆 Finding best and worst performing posts...`);
      const { bestPost, worstPost } = this.findBestWorstPosts(recentPosts);

      // Save to database
      console.log(`   💾 Saving analytics to database...`);
      await this.saveAnalyticsToDB(username, platform, analytics, followerCount, growthRate, bestPost?.post_id, worstPost?.post_id);

      return {
        ...analytics,
        growthRate,
        bestPerformingPost: bestPost,
        worstPerformingPost: worstPost,
        postsAnalyzed: recentPosts.length,
        trackingPeriod: '2_months'
      };

    } catch (error) {
      console.error(`Error tracking ${platform} performance:`, error);
      throw error;
    }
  }

  // Calculate growth rate by comparing with previous period
  async calculateGrowthRate(username: string, platform: string): Promise<number> {
    try {
      const previousAnalytics: any = await this.callQuerySafe(`
        SELECT engagement_rate, created_at 
        FROM act_analytics_logs 
        WHERE username = '${username}' 
        AND platform = '${platform}'
        AND created_at < DATE_SUB(NOW(), INTERVAL 2 MONTH)
        ORDER BY created_at DESC 
        LIMIT 1
      `);

      if (previousAnalytics.length === 0) {
        return 0; // No previous data to compare
      }

      const currentAnalytics: any = await this.callQuerySafe(`
        SELECT engagement_rate 
        FROM act_analytics_logs 
        WHERE username = '${username}' 
        AND platform = '${platform}'
        ORDER BY created_at DESC 
        LIMIT 1
      `);

      if (currentAnalytics.length === 0) {
        return 0;
      }

      const previousRate = previousAnalytics[0].engagement_rate;
      const currentRate = currentAnalytics[0].engagement_rate;

      if (previousRate === 0) return 0;

      return parseFloat(((currentRate - previousRate) / previousRate * 100).toFixed(2));

    } catch (error) {
      console.error('Error calculating growth rate:', error);
      return 0;
    }
  }

  // Find best and worst performing posts
  findBestWorstPosts(posts: PostMetrics[]): { bestPost?: PostMetrics, worstPost?: PostMetrics } {
    if (posts.length === 0) return {};

    let bestPost = posts[0];
    let worstPost = posts[0];
    let bestScore = this.calculatePostScore(posts[0]);
    let worstScore = bestScore;

    posts.forEach(post => {
      const score = this.calculatePostScore(post);
      if (score > bestScore) {
        bestScore = score;
        bestPost = post;
      }
      if (score < worstScore) {
        worstScore = score;
        worstPost = post;
      }
    });

    return { bestPost, worstPost };
  }

  // Calculate a score for a post based on engagement
  calculatePostScore(post: PostMetrics): number {
    const engagement = (post.likes + post.comments + (post.shares || 0) + (post.saves || 0));
    return engagement / (post.views || 1); // Engagement rate per view
  }

  // Generate comprehensive report across all platforms
  async generateComprehensiveReport(username: string, platformResults: any) {
    const report = {
      totalFollowers: 0,
      totalEngagement: 0,
      bestPlatform: '',
      worstPlatform: '',
      overallGrowth: 0,
      recommendations: [] as string[]
    };

    let totalEngagement = 0;
    let platformCount = 0;
    let bestEngagement = 0;
    let worstEngagement = 100;

    Object.entries(platformResults).forEach(([platform, data]: [string, any]) => {
      if (data.error) return;

      totalEngagement += data.engagementRate || 0;
      platformCount++;

      if (data.engagementRate > bestEngagement) {
        bestEngagement = data.engagementRate;
        report.bestPlatform = platform;
      }

      if (data.engagementRate < worstEngagement) {
        worstEngagement = data.engagementRate;
        report.worstPlatform = platform;
      }
    });

    report.totalEngagement = platformCount > 0 ? totalEngagement / platformCount : 0;

    // Generate recommendations
    if (report.totalEngagement < 3) {
      report.recommendations.push("Consider improving content quality and engagement strategies");
    }
    if (report.bestPlatform && report.worstPlatform) {
      report.recommendations.push(`Focus on improving performance on ${report.worstPlatform} based on ${report.bestPlatform} success`);
    }

    return report;
  }

  async saveAnalyticsToDB(
    username: string,
    platform: string,
    analytics: InfluencerAnalyticsResult,
    followerCount: number,
    growthRate?: number,
    bestPostId?: string,
    worstPostId?: string
  ) {
    try {
      const analyticsId = "an" + this.getRandomString();
      const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

      const analyticsData: AnalyticsLog = {
        analytics_id: analyticsId,
        username: username,
        platform: platform,
        total_posts: analytics.totalPosts,
        total_likes: analytics.totalLikes,
        total_comments: analytics.totalComments,
        total_shares: analytics.totalShares,
        total_views: analytics.totalViews,
        avg_views_per_post: analytics.avgViewsPerPost,
        engagement_rate: analytics.engagementRate,
        follower_count: followerCount,
        growth_rate: growthRate,
        best_post_id: bestPostId,
        worst_post_id: worstPostId,
        tracking_period: '2_months',
        created_at: currentDate
      };

      await this.insertData("act_analytics_logs", analyticsData);
      console.log(`Analytics saved to DB with ID: ${analyticsId}`);

      return analyticsId;
    } catch (error) {
      console.error('Error saving analytics to DB:', error);
      throw error;
    }
  }

  async saveComprehensiveAnalytics(username: string, platform: string, comprehensiveData: any) {
    try {
      const analyticsId = "comp" + this.getRandomString();
      const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

      const comprehensiveAnalyticsData = {
        analytics_id: analyticsId,
        username: username,
        platform: platform,
        comprehensive_data: JSON.stringify(comprehensiveData),
        created_at: currentDate
      };

      await this.insertData("act_comprehensive_analytics", comprehensiveAnalyticsData);
      console.log(`Comprehensive analytics saved to DB with ID: ${analyticsId}`);

      return analyticsId;
    } catch (error) {
      console.error('Error saving comprehensive analytics to DB:', error);
      throw error;
    }
  }

  // Get analytics history with enhanced filtering
  async getAnalytics(username: string, platform?: string, period: string = '2_months', limit: number = 10) {
    try {
      let query = `
        SELECT * FROM act_analytics_logs 
        WHERE username = '${username}'
      `;

      if (platform) {
        query += ` AND platform = '${platform}'`;
      }

      if (period) {
        query += ` AND tracking_period = '${period}'`;
      }

      query += ` ORDER BY created_at DESC LIMIT ${limit}`;

      const analytics = await this.callQuerySafe(query);
      return this.makeResponse(200, "Analytics retrieved successfully", analytics);
    } catch (error) {
      console.error('Error retrieving analytics:', error);
      return this.makeResponse(500, "Error retrieving analytics");
    }
  }

  // Get performance trends over time
  async getPerformanceTrends(username: string, platform?: string, months: number = 6) {
    try {
      let query = `
        SELECT 
          platform,
          DATE_FORMAT(created_at, '%Y-%m') as month,
          AVG(engagement_rate) as avg_engagement,
          AVG(avg_views_per_post) as avg_views,
          COUNT(*) as tracking_count
        FROM act_analytics_logs 
        WHERE username = '${username}'
        AND created_at >= DATE_SUB(NOW(), INTERVAL ${months} MONTH)
      `;

      if (platform) {
        query += ` AND platform = '${platform}'`;
      }

      query += ` GROUP BY platform, DATE_FORMAT(created_at, '%Y-%m') ORDER BY month DESC`;

      const trends = await this.callQuerySafe(query);
      return this.makeResponse(200, "Performance trends retrieved successfully", trends);
    } catch (error) {
      console.error('Error retrieving performance trends:', error);
      return this.makeResponse(500, "Error retrieving performance trends");
    }
  }

  getInfluencerAnalytics(
    posts: PostMetrics[],
    followerCount: number
  ): InfluencerAnalyticsResult {
    const totalPosts = posts.length;

    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    let totalSaves = 0;
    let totalViews = 0;

    posts.forEach(post => {
      totalLikes += post.likes || 0;
      totalComments += post.comments || 0;
      totalShares += post.shares || 0;
      totalSaves += post.saves || 0;
      totalViews += post.views || 0;
    });

    // Determine engagement components based on site
    const site = posts[0]?.site_id; // assuming all posts are from one platform
    let totalEngagements = 0;

    switch (site) {
      case 'tiktok':
        totalEngagements = totalLikes + totalComments + totalShares;
        break;
      case 'facebook':
        totalEngagements = totalLikes + totalComments + totalShares;
        break;
      case 'instagram':
        totalEngagements = totalLikes + totalComments + totalSaves;
        break;
      case 'youtube':
        totalEngagements = totalLikes + totalComments + totalShares;
        break;
      case 'twitter':
        totalEngagements = totalLikes + totalComments + totalShares;
        break;
      default:
        totalEngagements = totalLikes + totalComments;
        break;
    }

    const avgViewsPerPost = totalPosts > 0 ? totalViews / totalPosts : 0;
    const avgEngagementsPerPost = totalPosts > 0 ? totalEngagements / totalPosts : 0;
    const engagementRate = followerCount > 0
      ? parseFloat(((avgEngagementsPerPost / followerCount) * 100).toFixed(2))
      : 0;

    console.log(`   🔍 Engagement Calculation Debug:`);
    console.log(`      - Total Engagements: ${totalEngagements.toLocaleString()}`);
    console.log(`      - Total Posts: ${totalPosts}`);
    console.log(`      - Avg Engagements per Post: ${avgEngagementsPerPost.toLocaleString()}`);
    console.log(`      - Follower Count: ${followerCount.toLocaleString()}`);
    console.log(`      - Engagement Rate: ${engagementRate}%`);

    const engagementRating = this.getEngagementRating(engagementRate);

    return {
      totalPosts,
      totalLikes,
      totalComments,
      totalShares,
      totalViews,
      avgViewsPerPost: parseFloat(avgViewsPerPost.toFixed(2)),
      engagementRate,
      engagementRating,
    };
  }
}
