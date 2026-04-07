import axios, { AxiosResponse, AxiosRequestConfig } from 'axios';
import { getItem, setItem } from '../helpers/connectRedis';
import { AnalyticsCalculator, SocialPost, UserInfo } from '../helpers/analyticsCalculator';

export default class RapiAPI {
  private axiosInstance = axios.create({
    baseURL: 'https://twitter-api45.p.rapidapi.com',
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': 'twitter-api45.p.rapidapi.com'
    }
  });

  public async get(url: string, params?: any): Promise<AxiosResponse<any>> {
    return this.axiosInstance.get(url, { params });
  }

  public async post(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<any>> {
    return this.axiosInstance.post(url, data, config);
  }

  public async getXFollowers(screenname: string): Promise<number> {
    try {
      const response = await this.get('/screenname.php', { screenname });
      console.log('getFollowers-x', response);
      const { sub_count } = response.data;
      return sub_count;
    } catch (error) {
      console.error("Error fetching followers from Twitter:", error);
      return 0;
    }
  }

  public async verifyTweet(username: string, tweetId: string, searchText: string): Promise<boolean> {
    try {
      const response = await this.get('/tweet.php', { id: tweetId });
      const tweetData = response.data;
      console.log(`tweetData1`, tweetData)

      const tweetUser = tweetData.author.screen_name || (tweetData.user && tweetData.user.screen_name);
      if (tweetUser.toLowerCase() !== username.toLocaleLowerCase()) {
        return false;
      }
      console.log(`tweetData.text`, tweetData.text)
      console.log(`tweetData.searchText`, searchText)
      const tweetText = tweetData.text || (tweetData.tweet && tweetData.tweet.text);
      if (!tweetText.toLocaleLowerCase().includes(searchText)) {
        return false;
      }
      return true;
    } catch (error) {
      console.error("Error fetching tweet:", error);
      return false;
    }
  }

  // Simple method to get user posts from timeline
  public async getUserPosts(screenname: string): Promise<SocialPost[]> {
    try {
      console.log(`🔍 Fetching Twitter posts for @${screenname}...`);
      
      const response = await this.get('/timeline.php', { screenname });
      console.log('Timeline response received');
      
      if (!response.data || !response.data.timeline) {
        console.log('No timeline data found');
        return [];
      }

      const posts = response.data.timeline.map((tweet: any): SocialPost => ({
        id: tweet.tweet_id,
        text: tweet.text,
        createdAt: tweet.created_at,
        likes: tweet.favorites || 0,
        comments: tweet.replies || 0,
        shares: (tweet.retweets || 0) + (tweet.quotes || 0),
        views: tweet.views || 0,
        media: tweet.media || [],
        entities: tweet.entities || {}
      }));

      console.log(`📊 Extracted ${posts.length} posts from Twitter timeline`);
      return posts;
    } catch (error) {
      console.error("Error fetching Twitter posts:", error);
      return [];
    }
  }

  public async getUserAnalytics(username: string): Promise<any> {
    try {
      // First get user info to get the user ID
      const userInfo = await this.getUserInfo(username);
      console.log("userInfo", userInfo);
      const userId = userInfo?.user?.id;
      const followers = userInfo?.user?.followers_count;
      
      if (!userId) {
        console.log('No user ID found for username:', username);
        return {};
      }
      
      const [posts] = await Promise.all([
        this.getUserPosts(username),
      ]);

      // Ensure posts is an array
      const postsArray = Array.isArray(posts) ? posts : [];
      console.log("postsArray", postsArray);

      return {
        overview: AnalyticsCalculator.calculateOverview(userInfo, postsArray, followers || 0),
        audienceQualityScore: AnalyticsCalculator.calculateAudienceQualityScore(userInfo, postsArray, followers || 0),
        demographics: AnalyticsCalculator.calculateDemographics(userInfo, postsArray),
        estimatedMetrics: AnalyticsCalculator.calculateEstimatedMetrics(postsArray, followers || 0),
        audienceBreakdown: AnalyticsCalculator.calculateAudienceBreakdown(userInfo, postsArray)
      };
    } catch (error) {
      console.error("Error getting TikTok analytics:", error);
      return {};
    }
  }

  // Simple method to get user info
  public async getUserInfo(screenname: string): Promise<UserInfo> {
    try {
      const response = await this.get('/screenname.php', { screenname });
      console.log('User info response received');
      const responseData = response.data;
      return {
        user: {
          id: responseData.id,
          followers_count: responseData.sub_count,
          verified: responseData.blue_verified,
          location: responseData.location,
          created_at: responseData.created_at,
          bio: responseData.desc,
          name: responseData.name,
          username: responseData.username
        }
      }
    } catch (error) {
      console.error("Error fetching user info:", error);
      return {};
    }
  }
}
