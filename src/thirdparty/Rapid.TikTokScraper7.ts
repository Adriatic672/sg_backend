import axios, { AxiosResponse, AxiosRequestConfig } from 'axios';
import { AnalyticsCalculator, SocialPost, UserInfo } from '../helpers/analyticsCalculator';


type TikTokAnalytics = {
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalViews: number;
  averageLikes: number;
  averageComments: number;
  averageShares: number;
  averageViews: number;
  engagementRate: number;
};



export default class TikTokAPI {
  static async OAuth2() {
  return false
  }

  // Enhanced method to get comprehensive user analytics
  public async getUserAnalytics(username: string): Promise<any> {
    try {
      // First get user info to get the user ID
      const userInfo = await this.getUserInfo(username);
      const userId = userInfo?.user?.id;
      
      if (!userId) {
        console.log('No user ID found for username:', username);
        return {};
      }
      
      const [posts, followers] = await Promise.all([
        this.getUserPosts(username),
        this.fetchUserFollowers(username)
      ]);

      // Ensure posts is an array
      const postsArray = Array.isArray(posts) ? posts : [];

      return {
        overview: AnalyticsCalculator.calculateOverview(userInfo, postsArray, followers),
        audienceQualityScore: AnalyticsCalculator.calculateAudienceQualityScore(userInfo, postsArray, followers),
        demographics: AnalyticsCalculator.calculateDemographics(userInfo, postsArray),
        estimatedMetrics: AnalyticsCalculator.calculateEstimatedMetrics(postsArray, followers),
        audienceBreakdown: AnalyticsCalculator.calculateAudienceBreakdown(userInfo, postsArray)
      };
    } catch (error) {
      console.error("Error getting TikTok analytics:", error);
      return {};
    }
  }


  public async getUserInfo(username: string): Promise<UserInfo> {
    try {
      const response = await this.get('/user/info', { unique_id: username });
      return response.data?.data || {};
    } catch (error) {
      console.error("Error fetching user info:", error);
      return {};
    }
  }
  private axiosInstance = axios.create({
    baseURL: 'https://tiktok-scraper7.p.rapidapi.com',
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': 'tiktok-scraper7.p.rapidapi.com'
    }
  });

  public async analyzeTikTokPosts(username: string, userId: string): Promise<TikTokAnalytics> {
    const followerCount = await this.fetchUserFollowers(username);
    console.log('followerCount', followerCount);
    if (!userId || !followerCount) {
      throw new Error('No posts or follower count found');
    }

    const posts = await this.getUserPosts(userId);
    console.log('posts', posts);

    const totalLikes = posts.reduce((sum: number, post: any) => sum + post.likes, 0);
    const totalComments = posts.reduce((sum: number, post: any) => sum + post.comments, 0);
    const totalShares = posts.reduce((sum: number, post: any) => sum + post.shares, 0);
    const totalViews = posts.reduce((sum: number, post: any) => sum + post.views, 0);
  
    const count = posts.length || 1;
  
    const averageLikes = totalLikes / count;
    const averageComments = totalComments / count;
    const averageShares = totalShares / count;
    const averageViews = totalViews / count;
  
    const engagementRate =
      followerCount > 0
        ? ((totalLikes + totalComments + totalShares) / followerCount) * 100
        : 0;
  
    return {
      totalLikes,
      totalComments,
      totalShares,
      totalViews,
      averageLikes: parseFloat(averageLikes.toFixed(2)),
      averageComments: parseFloat(averageComments.toFixed(2)),
      averageShares: parseFloat(averageShares.toFixed(2)),
      averageViews: parseFloat(averageViews.toFixed(2)),
      engagementRate: parseFloat(engagementRate.toFixed(2)),
    };
  }
  public async get(url: string, params?: any): Promise<AxiosResponse<any>> {
    return this.axiosInstance.get(url, { params });
  }

  public async post(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<any>> {
    return this.axiosInstance.post(url, data, config);
  }

  public async fetchUserFollowers(screenname: string): Promise<number> {
    console.log('fetchUserFollowers-1', screenname);
    try {

      const response = await this.get('/user/info', { unique_id: screenname });
      console.log('fetchUserFollowers', response.data);
      const followerCount = response.data?.data?.stats?.followerCount;
      if (typeof followerCount === 'number') {
        return followerCount;
      }
      return 0;
    } catch (error) {
      console.error("Error fetching followers from TikTok:", error);
      return 0
    }
  }

  // Fetches posts for a given user
  public async getUserPosts(username: string, count: number = 10, cursor: string = '0'): Promise<SocialPost[]> {
    try {
      // First get user info to get the user ID
      const userInfo = await this.getUserInfo(username);
      const userId = userInfo?.user?.id;
      
      if (!userId) {
        console.log('No user ID found for username:', username);
        return [];
      }
      
      const response = await this.get('/user/posts', { user_id: userId, count, cursor });
      console.log('getUserPosts response:', response.data);
      
      // Return the posts array from the response
      if (response.data && response.data.data && response.data.data.videos) {
        console.log(`Found ${response.data.data.videos.length} videos`);
        return response.data.data.videos;
      } else if (response.data && response.data.videos) {
        console.log(`Found ${response.data.videos.length} videos (direct)`);
        return response.data.videos;
      } else if (response.data && response.data.itemList) {
        console.log(`Found ${response.data.itemList.length} items`);
        return response.data.itemList;
      } else if (response.data && Array.isArray(response.data)) {
        console.log(`Found ${response.data.length} items (array)`);
        return response.data;
      } else {
        console.log('No posts found, returning empty array');
        return [];
      }
    } catch (error) {
      console.error('Error fetching user posts:', error);
      // Return empty array instead of throwing error
      return [];
    }
  }

  // Verifies if a given TikTok post belongs to the specified user and contains the search text.
  public async verifyUserPost(userId: string, postId: string, searchText: string): Promise<boolean> {
    try {
      // Note: Adjust the endpoint and parameter as per the actual TikTok API documentation.
      const response = await this.get('/post', { id: postId });
      const postData = response.data;
      // Assuming the response includes an author object with an id property
      const postUserId = postData.author?.id;
      if (postUserId !== userId) {
        return false;
      }
      // Assuming the post description is available in the 'description' property
      if (!postData.description || !postData.description.includes(searchText)) {
        return false;
      }
      return true;
    } catch (error) {
      console.error("Error verifying TikTok post:", error);
      return false;
    }
  }
}
