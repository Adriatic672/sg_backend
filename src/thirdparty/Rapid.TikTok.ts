import axios, { AxiosResponse, AxiosRequestConfig } from 'axios';
import { AnalyticsCalculator, SocialPost, UserInfo } from '../helpers/analyticsCalculator';

type TikTokPost = {
    likes: number;
    comments: number;
    shares: number;
    views: number;
    createdAt: string;
};

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

export default class TikTokAPIv2 {
    private axiosInstance = axios.create({
        baseURL: 'https://tiktok-api23.p.rapidapi.com',
        headers: {
            'x-rapidapi-key': process.env.RAPIDAPI_KEY,
            'x-rapidapi-host': 'tiktok-api23.p.rapidapi.com'
        }
    });

    static async OAuth2(token: any, userId: any) {
        return false;
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
            const response = await this.get('/api/user/info-with-region', { uniqueId: username });
            console.log('User info response received');

            // Extract user data from the user info API response structure
            const userData = response.data?.userInfo?.user;
            //  const signature = response.data?.userInfo?.user.signature

            if (!userData) {
                return {};
            }

            return {
                user: {
                    id: userData.id,
                    username: userData.nickname,
                    followers_count: userData.stats?.followerCount || 0,
                    verified: userData.verified || false,
                    secUid: userData.secUid,
                    location: userData.region || 'Unknown',
                    region: userData.region || 'Unknown',
                    category: 'General'
                },
                followers: userData.stats?.followerCount || 0,
                verified: userData.verified || false,
                region: userData.region || 'Unknown',
                category: 'General'
            };
        } catch (error) {
            console.error("Error fetching user info:", error);
            return {};
        }
    }

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
            const response = await this.get('/api/user/info-with-region', { uniqueId: screenname });
            console.log('fetchUserFollowers', response.data);

            const followerCount = response.data.userInfo.stats.followerCount;
            if (typeof followerCount === 'number') {
                return followerCount;
            }
            return 0;
        } catch (error) {
            console.error("Error fetching followers from TikTok:", error);
            return 0;
        }
    }

    // Fetches posts for a given user using the new API
    public async getUserPosts(username: string, count: number = 15, cursor: string = '0'): Promise<SocialPost[]> {
        try {
            // First get user info to get the user ID
            const userInfo = await this.getUserInfo(username);
            const userId = userInfo?.user?.id;
            const secUid = userInfo?.user?.secUid;
            if (!userId) {
                console.log('No user ID found for username:', username);
                return [];
            }

            const response = await this.get('/api/user/posts', {
                secUid,
                count,
                cursor
            });
            console.log('getUserPosts response:', response.data);

            // Extract videos from the new API response structure
            const videos = response.data.data.itemList || [];

            if (videos.length > 0) {
                console.log(`Found ${videos.length} videos`);

                // Map the new API response to our SocialPost interface
                return videos.map((video: any): SocialPost => ({
                    id: video.id,
                    text: video.desc || '',
                    createdAt: new Date(parseInt(video.createTime) * 1000).toISOString(),
                    likes: parseInt(video.stats?.diggCount) || 0,
                    comments: parseInt(video.stats?.commentCount) || 0,
                    shares: parseInt(video.stats?.shareCount) || 0,
                    views: parseInt(video.stats?.playCount) || 0,
                    media: video.video ? [video.video] : []
                }));
            } else {
                console.log('No videos found in response');
                return [];
            }
        } catch (error) {
            console.error("Error fetching user posts:", error);
            return [];
        }
    }

    // New method to get detailed post information
    public async getPostDetail(videoId: string): Promise<any> {
        try {
            console.log(`🔍 Fetching TikTok post details for video ID: ${videoId}...`);

            const response = await this.get('/api/post/detail', { videoId });
            console.log('Post detail response received');

            if (!response.data || !response.data.itemInfo) {
                console.log('No post data found');
                return null;
            }

            const itemStruct = response.data.itemInfo.itemStruct;

            // Map the detailed post data to our format
            return {
                id: itemStruct.id,
                text: itemStruct.desc || '',
                createdAt: new Date(parseInt(itemStruct.createTime) * 1000).toISOString(),
                likes: parseInt(itemStruct.stats?.diggCount) || 0,
                comments: parseInt(itemStruct.stats?.commentCount) || 0,
                shares: parseInt(itemStruct.stats?.shareCount) || 0,
                views: parseInt(itemStruct.stats?.playCount) || 0,
                author: {
                    id: itemStruct.author?.id,
                    username: itemStruct.author?.uniqueId,
                    nickname: itemStruct.author?.nickname,
                    verified: itemStruct.author?.verified || false,
                    avatar: itemStruct.author?.avatarThumb
                },
                video: itemStruct.video,
                music: itemStruct.music,
                challenges: itemStruct.challenges || [],
                effects: itemStruct.effectStickers || [],
                hashtags: itemStruct.textExtra || []
            };
        } catch (error) {
            console.error("Error fetching post details:", error);
            return null;
        }
    }

    // Helper method to get multiple post details for analytics
    public async getMultiplePostDetails(videoIds: string[]): Promise<any[]> {
        try {
            const postPromises = videoIds.map(videoId => this.getPostDetail(videoId));
            const posts = await Promise.all(postPromises);

            // Filter out failed requests
            return posts.filter(post => post !== null);
        } catch (error) {
            console.error("Error fetching multiple post details:", error);
            return [];
        }
    }

    // Enhanced analytics method that uses detailed post data
    public async getEnhancedUserAnalytics(username: string, videoIds?: string[]): Promise<any> {
        try {
            const userInfo = await this.getUserInfo(username);
            const followers = await this.fetchUserFollowers(username);

            let posts: SocialPost[] = [];

            if (videoIds && videoIds.length > 0) {
                // Use specific video IDs for detailed analysis
                const detailedPosts = await this.getMultiplePostDetails(videoIds);
                posts = detailedPosts.map((post: any): SocialPost => ({
                    id: post.id,
                    text: post.text,
                    createdAt: post.createdAt,
                    likes: post.likes,
                    comments: post.comments,
                    shares: post.shares,
                    views: post.views,
                    media: post.video ? [post.video] : []
                }));
            } else {
                // Use regular user posts method
                posts = await this.getUserPosts(username);
            }

            return {
                overview: AnalyticsCalculator.calculateOverview(userInfo, posts, followers),
                audienceQualityScore: AnalyticsCalculator.calculateAudienceQualityScore(userInfo, posts, followers),
                demographics: AnalyticsCalculator.calculateDemographics(userInfo, posts),
                estimatedMetrics: AnalyticsCalculator.calculateEstimatedMetrics(posts, followers),
                audienceBreakdown: AnalyticsCalculator.calculateAudienceBreakdown(userInfo, posts),
                postDetails: videoIds ? await this.getMultiplePostDetails(videoIds) : null
            };
        } catch (error) {
            console.error("Error getting enhanced TikTok analytics:", error);
            return {};
        }
    }
} 