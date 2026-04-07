// top-level shape for one network
// Database interface for storing analytics
export interface AnalyticsLog {
  analytics_id: string;
  username: string;
  platform: string;
  post_id?: string;
  total_posts: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_views: number;
  avg_views_per_post: number;
  engagement_rate: number;
  follower_count: number;
  growth_rate?: number;
  best_post_id?: string;
  worst_post_id?: string;
  tracking_period: string; // "2_months", "1_month", "1_week"
  created_at: string;
}


export interface NetworkData {
    overview: Overview;
    audienceQualityScore: AudienceQualityScore;
    demographics: Demographics;
    estimatedMetrics: EstimatedMetrics;
    audienceBreakdown: AudienceBreakdown;
  }
  
  export interface Overview {
    followers: number;
    qualityAudience: {
      percentage: number;
      count: number;
    };
    followersGrowth30d: {
      percentage: number;
      label: string;
    };
    engagementRate: {
      percentage: number;
      label: string;
    };
    authenticEngagement: {
      value: number;
      unit: string;
    };
    postFrequency: {
      value: number;
      unit: string;
      label: string;
    };
  }
  
  export interface AudienceQualityScore {
    score: number;
    label: string;
    insights: string[];
    ranks: {
      global: number;
      country: { name: string; rank: number };
      category: { name: string; rank: number };
    };
  }
  
  export interface Demographics {
    yearlyGrowth: {
      percentage: number;
      label: string;
      followersGained: number;
      peerGrowthRate: number;
    };
    followerGrowthTimeline: Array<{
      date: string;      // ISO date string
      followers: number;
    }>;
  }
  
  export interface EstimatedMetrics {
    reach: {
      post:   { min: number; max: number };
      story:  { min: number; max: number };
    };
    impressions: number;
    audienceReachability: {
      level: string;
      percentBelow1500: number;
      peerAverage: number;
    };
    audienceAuthenticity: {
      level: string;
      percentAuthentic: number;
      peerAverage: number;
    };
  }
  
  export interface AudienceBreakdown {
    ageDistribution: Array<{
      range: string;
      male: number;
      female: number;
    }>;
    genderRatio: {
      male: number;
      female: number;
      adults: number;
    };
    topCountry: string;
    audienceGeo: Array<{
      country: string;
      percentage: number;
    }>;
    audienceType: Array<{
      type: string;
      count?: number;      // some buckets may not have an exact count
      percentage: number;
    }>;
  }
  