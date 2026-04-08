import axios, { AxiosResponse, AxiosRequestConfig } from 'axios';
import { NetworkData } from './analytics/influencer';
import { AnalyticsCalculator, SocialPost, UserInfo } from '../helpers/analyticsCalculator';

export default class InstagramAPI {
  static async OAuth2(token: any, userId: any): Promise<boolean> {
    return false
  }
  private axiosInstance = axios.create({
    baseURL: 'https://instagram120.p.rapidapi.com/api/instagram',
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': 'instagram120.p.rapidapi.com',
      'Content-Type': 'application/json'
    }
  });

  public async get(url: string, params?: any): Promise<AxiosResponse<any>> {
    return this.axiosInstance.get(url, { params });
  }

  public async post(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<any>> {
    return this.axiosInstance.post(url, data, config);
  }

  /**
   * Fetch number of viewers or interactions on a post (used similarly to followers).
   * @param postCode Instagram post shortcode or ID (e.g., CxYQJO8xuC6)
   */
  public async getFollowers(username: string): Promise<number> {
    try {
      // Use POST to /profile endpoint
      const response = await this.post('/profile', { username });
      console.log('getFollowers-x (Instagram)', response.data);
      console.log('getFollowers-x (Instagram)', response.data.data);
      console.log('getFollowers-x (Instagram)', response.data.data.follower_count);
      const count = response.data.data.follower_count
      console.log("count", count);
      return count;
    } catch (error) {
      console.error("Error fetching followers from Instagram:", error);
      return 0;
    }
  }
  async getUserInfo(username: string): Promise<UserInfo> {
    // Try multiple endpoint variations as the API may use different naming
    const endpoints = [
      { url: '/userInfo', data: { username } },
      { url: '/user_info', data: { username } },
      { url: '/profile', data: { username } }
    ];
    
    for (const endpoint of endpoints) {
      try {
        console.log(`Trying Instagram endpoint: ${endpoint.url}`);
        const response = await this.post(endpoint.url, endpoint.data);
        console.log(`Instagram ${endpoint.url} response:`, response.data);
        
        // Handle different response structures
        const userData = response.data.data || response.data;
        
        if (userData) {
          return {
            user: {
              id: userData.pk || userData.id || '',
              followers_count: userData.follower_count || userData.followers_count || 0,
              verified: userData.is_verified || userData.verified || false,
              location: userData.city_name || userData.location || '',
              created_at: userData.created_at || '',
              bio: userData.biography || userData.bio || '',
              name: userData.full_name || userData.name || '',
              username: userData.username || username
            }
          };
        }
      } catch (error: any) {
        console.log(`Endpoint ${endpoint.url} failed:`, error.response?.status, error.message);
        // Continue to next endpoint
      }
    }
    
    // If all endpoints fail, throw error
    throw new Error('All Instagram API endpoints failed');
  }

  /**
   * Get user posts with engagement data
   */
  public async getUserPosts(username: string): Promise<SocialPost[]> {
    try {
      console.log(`📸 Fetching Instagram posts for @${username}...`);
      
      // Use POST to /posts endpoint
      const postsResponse = await this.post('/posts', { username });
      console.log('Instagram posts response received');
      
      if (!postsResponse.data?.data?.items || !Array.isArray(postsResponse.data.data.items)) {
        console.log('No posts data found or invalid format');
        return [];
      }
      
      const posts:SocialPost[] = postsResponse.data.data.items.map((post: any): SocialPost   => ({
        id: post.id || post.code,
        likes: post.like_count || post.likes || 0,
        comments: post.comment_count || post.comments || 0,
        shares: post.bookmark_count || post.saves || 0,
        views: post.view_count || post.views || 0,
        createdAt: post.taken_at ? new Date(post.taken_at * 1000).toISOString() : new Date().toISOString(),
        text: post.caption?.text || '',
        media: post.display_url || post.media_url || post.image_versions2?.candidates?.[0]?.url || ''
      }));
      
      console.log(`📊 Extracted ${posts.length} Instagram posts`);
      return posts;
    } catch (error) {
      console.error("Error fetching Instagram posts:", error);
      return [];
    }
  }

  /**
   * Get user reels with engagement data
   */
  public async getUserReels(username: string): Promise<any[]> {
    try {
      console.log(`📸 Fetching Instagram reels for @${username}...`);
      
      // Use POST to /reels endpoint
      const reelsResponse = await this.post('/reels', { username });
      console.log('Instagram reels response received');
      
      if (!reelsResponse.data?.data?.items || !Array.isArray(reelsResponse.data.data.items)) {
        console.log('No reels data found or invalid format');
        return [];
      }
      
      const reels = reelsResponse.data.data.items.map((reel: any) => ({
        id: reel.id || reel.code,
        likes: reel.like_count || reel.likes || 0,
        comments: reel.comment_count || reel.comments || 0,
        saves: reel.bookmark_count || reel.saves || 0,
        views: reel.view_count || reel.views || reel.play_count || 0,
        created_at: reel.taken_at ? new Date(reel.taken_at * 1000).toISOString() : new Date().toISOString(),
        caption: reel.caption?.text || '',
        media_type: 'reel',
        media_url: reel.display_url || reel.media_url || reel.image_versions2?.candidates?.[0]?.url || '',
        video_url: reel.video_url || '',
        duration: reel.video_duration || 0
      }));
      
      console.log(`📊 Extracted ${reels.length} Instagram reels`);
      return reels;
    } catch (error) {
      console.error("Error fetching Instagram reels:", error);
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
      
      const [posts, reels] = await Promise.all([
        this.getUserPosts(username),
        this.getUserReels(username)
      ]);

      // Ensure posts is an array
      const postsArray = Array.isArray(posts) ? posts : [];
      const reelsArray = Array.isArray(reels) ? reels : [];
      console.log("postsArray", postsArray);
      console.log("reelsArray", reelsArray);

      return {
        overview: AnalyticsCalculator.calculateOverview(userInfo, postsArray, followers || 0),
        audienceQualityScore: AnalyticsCalculator.calculateAudienceQualityScore(userInfo, postsArray, followers || 0),
        demographics: AnalyticsCalculator.calculateDemographics(userInfo, postsArray),
        estimatedMetrics: AnalyticsCalculator.calculateEstimatedMetrics(postsArray, followers || 0),
        audienceBreakdown: AnalyticsCalculator.calculateAudienceBreakdown(userInfo, postsArray),
        allContent: [...postsArray, ...reelsArray]
      };
    } catch (error) {
      console.error("Error getting TikTok analytics:", error);
      return {};
    }
  }

  /**
   * Verify that a specific user is in the viewers or likers list and optionally check if bio or full_name contains given text.
   * @param username Instagram username to verify
   * @param postCode Instagram post shortcode
   * @param searchText Optional text to match in full_name or username
   */

  public async extractPostInfo(postData: any): Promise<{
    username: string;
    fullName: string;
    type: 'reel' | 'post' | 'unknown';
    captionText: string;
    date: string;
  }> {
    try {
      const media = postData?.data;
      const user = media?.user || {};
  
      const username = user.username || 'unknown';
      const fullName = user.full_name || '';
      const captionText = media?.caption?.text || '';
      const takenAt = media?.taken_at; // Unix timestamp in seconds
  
      // Normalize type
      let type: 'reel' | 'post' | 'unknown' = 'unknown';
      if (media?.media_name === 'reel' || media?.product_type === 'clips') {
        type = 'reel';
      } else if (media?.media_type === 1) {
        type = 'post';
      }
  
      // Convert date
      const date = takenAt ? new Date(takenAt * 1000).toISOString() : 'unknown';
  
      return {
        username,
        fullName,
        type,
        captionText,
        date
      };
    } catch (error) {
      console.error("Error extracting post info:", error);
      throw new Error("Could not extract Instagram post info");
    }
  }

  
  public async verifyPost(username: string, postCode: string, searchText: string){
    try {
      // Use POST to /mediaByShortcode endpoint
      const response = await this.post('/mediaByShortcode', { shortcode: postCode });
      const postData = response.data.data
  
      // Extract post info
      const extracted = await this.extractPostInfo({ data: postData });
  
      // Debug logs
      console.log('verifyPost-x (Instagram) extracted:', extracted);
  
      // Validate username match
      if (extracted.username.toLowerCase() !== username.toLowerCase()) return "username mismatch";
  
      // Check if caption contains the search text (case-insensitive)
      const searchTextLower = searchText.toLowerCase();
      if (!extracted.captionText.toLowerCase().includes(searchTextLower)) return "caption mismatch";
  
  
      return true;
    } catch (error) {
      console.error("Error verifying Instagram post:", error);
      return "Error verifying Instagram post";
    }
  }
  
}
