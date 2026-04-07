// Unified Post Interface for all social media platforms
export interface PostInterface {
  // Core post identification
  id: string;
  platform: 'tiktok' | 'instagram' | 'facebook' | 'twitter' | 'youtube';
  
  // Content information
  content?: string;
  description?: string;
  caption?: string;
  text?: string;
  
  // Media information
  media?: {
    type: 'video' | 'image' | 'carousel' | 'story' | 'reel';
    url?: string;
    thumbnail?: string;
    duration?: number;
    width?: number;
    height?: number;
    format?: string;
  };
  
  // Engagement metrics
  engagement: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
    saves?: number;
    bookmarks?: number;
    retweets?: number;
    reactions?: number;
  };
  
  // Author information
  author: {
    id: string;
    username: string;
    displayName?: string;
    avatar?: string;
    verified?: boolean;
    followers?: number;
  };
  
  // Timing
  createdAt: number; // Unix timestamp
  publishedAt?: number;
  updatedAt?: number;
  
  // Additional metadata
  metadata?: {
    language?: string;
    sentiment?: 'positive' | 'negative' | 'neutral';
    category?: string;
    tags?: string[];
    hashtags?: string[];
    mentions?: string[];
    location?: {
      country?: string;
      city?: string;
      coordinates?: {
        lat: number;
        lng: number;
      };
    };
    isSponsored?: boolean;
    isPrivate?: boolean;
    isDeleted?: boolean;
  };
}

// Utility types
export type PostPlatform = PostInterface['platform'];
export type PostMediaType = NonNullable<PostInterface['media']>['type'];

// Interface for post analytics results
export interface PostAnalytics {
  postId: string;
  platform: PostPlatform;
  engagementRate: number;
  reachRate: number;
  viralScore: number;
  performanceScore: number;
  bestTimeToPost?: string;
  recommendedHashtags?: string[];
  audienceInsights?: {
    ageRange?: string;
    genderRatio?: {
      male: number;
      female: number;
    };
    topCountries?: Array<{
      country: string;
      percentage: number;
    }>;
  };
} 