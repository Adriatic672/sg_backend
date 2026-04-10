import axios, { AxiosResponse, AxiosRequestConfig } from 'axios';
import { getItem, setItem } from '../helpers/connectRedis';
import { AnalyticsCalculator, SocialPost, UserInfo } from '../helpers/analyticsCalculator';

export default class RapiAPI {
  private axiosInstance = axios.create({
    baseURL: 'https://twitter-v1-1-v2-api.p.rapidapi.com',
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': 'twitter-v1-1-v2-api.p.rapidapi.com',
      'Content-Type': 'application/json'
    }
  });

  public async get(url: string, params?: any): Promise<AxiosResponse<any>> {
    return this.axiosInstance.get(url, { params });
  }

  public async post(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<any>> {
    return this.axiosInstance.post(url, data, config);
  }

  // Resolve username -> userId using UserByScreenName
  private async resolveUserId(screenname: string): Promise<string | null> {
    try {
      const variables = JSON.stringify({ screen_name: screenname });
      const response = await this.get('/graphql/UserByScreenName', { variables });
      const user = response.data?.data?.user?.result?.legacy || response.data?.data?.user?.result;
      const id = response.data?.data?.user?.result?.rest_id || user?.id_str;
      return id || null;
    } catch (error) {
      console.error('Error resolving Twitter userId:', error);
      return null;
    }
  }

  public async getXFollowers(screenname: string): Promise<number> {
    try {
      const userInfo = await this.getUserInfo(screenname);
      return userInfo?.user?.followers_count || 0;
    } catch (error) {
      console.error("Error fetching followers from Twitter:", error);
      return 0;
    }
  }

  public async verifyTweet(username: string, tweetId: string, searchText: string): Promise<boolean> {
    try {
      const variables = JSON.stringify({ focalTweetId: tweetId, count: 1 });
      const response = await this.get('/graphql/TweetDetail', { variables });
      const entries = response.data?.data?.threaded_conversation_with_injections_v2?.instructions?.[0]?.entries || [];
      const tweetEntry = entries.find((e: any) => e.entryId?.startsWith('tweet-'));
      const result = tweetEntry?.content?.itemContent?.tweet_results?.result;
      const tweetUser = result?.core?.user_results?.result?.legacy?.screen_name || '';
      const tweetText = result?.legacy?.full_text || '';

      console.log('verifyTweet user:', tweetUser, 'text:', tweetText);

      if (tweetUser.toLowerCase() !== username.toLowerCase()) return false;
      if (!tweetText.toLowerCase().includes(searchText.toLowerCase())) return false;
      return true;
    } catch (error) {
      console.error("Error verifying tweet:", error);
      return false;
    }
  }

  public async getUserPosts(screenname: string): Promise<SocialPost[]> {
    try {
      console.log(`🔍 Fetching Twitter posts for @${screenname}...`);
      const userId = await this.resolveUserId(screenname);
      if (!userId) return [];

      const variables = JSON.stringify({
        userId,
        count: 20,
        includePromotedContent: false,
        withQuickPromoteEligibilityTweetFields: true,
        withVoice: true,
        withV2Timeline: true
      });
      const response = await this.get('/graphql/UserTweets', { variables });
      const instructions = response.data?.data?.user?.result?.timeline_v2?.timeline?.instructions || [];
      const entries = instructions.find((i: any) => i.type === 'TimelineAddEntries')?.entries || [];

      const posts: SocialPost[] = entries
        .filter((e: any) => e.entryId?.startsWith('tweet-'))
        .map((e: any) => {
          const t = e.content?.itemContent?.tweet_results?.result?.legacy;
          return {
            id: t?.id_str || e.entryId,
            text: t?.full_text || '',
            createdAt: t?.created_at || new Date().toISOString(),
            likes: t?.favorite_count || 0,
            comments: t?.reply_count || 0,
            shares: (t?.retweet_count || 0) + (t?.quote_count || 0),
            views: t?.views?.count || 0,
            media: t?.entities?.media || []
          };
        });

      console.log(`📊 Extracted ${posts.length} posts from Twitter`);
      return posts;
    } catch (error) {
      console.error("Error fetching Twitter posts:", error);
      return [];
    }
  }

  public async getUserAnalytics(username: string): Promise<any> {
    try {
      const userInfo = await this.getUserInfo(username);
      const followers = userInfo?.user?.followers_count || 0;
      if (!userInfo?.user?.id) return {};

      const posts = await this.getUserPosts(username);
      const postsArray = Array.isArray(posts) ? posts : [];

      return {
        overview: AnalyticsCalculator.calculateOverview(userInfo, postsArray, followers),
        audienceQualityScore: AnalyticsCalculator.calculateAudienceQualityScore(userInfo, postsArray, followers),
        demographics: AnalyticsCalculator.calculateDemographics(userInfo, postsArray),
        estimatedMetrics: AnalyticsCalculator.calculateEstimatedMetrics(postsArray, followers),
        audienceBreakdown: AnalyticsCalculator.calculateAudienceBreakdown(userInfo, postsArray)
      };
    } catch (error) {
      console.error("Error getting Twitter analytics:", error);
      return {};
    }
  }

  public async getUserInfo(screenname: string): Promise<UserInfo> {
    try {
      const variables = JSON.stringify({ screen_name: screenname });
      const response = await this.get('/graphql/UserByScreenName', { variables });
      const result = response.data?.data?.user?.result;
      const legacy = result?.legacy;
      console.log('Twitter getUserInfo response:', legacy);
      return {
        user: {
          id: result?.rest_id || '',
          followers_count: legacy?.followers_count || 0,
          verified: legacy?.verified || result?.is_blue_verified || false,
          location: legacy?.location || '',
          created_at: legacy?.created_at || '',
          bio: legacy?.description || '',
          name: legacy?.name || '',
          username: legacy?.screen_name || screenname
        }
      };
    } catch (error) {
      console.error("Error fetching Twitter user info:", error);
      return {};
    }
  }
}
