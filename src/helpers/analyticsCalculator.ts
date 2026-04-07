// Interfaces for analytics data
export interface SocialPost {
  likes: number;
  comments: number;
  shares: number;
  views: number;
  createdAt: string;
  id?: string;
  text?: string;
  media?: any[];
  entities?: any;
}

export interface UserInfo {
  user?: {
    id: string;
    followers_count: number;
    username: string;
    verified?: boolean;
    location?: string;
    region?: string;
    category?: string;
    created_at?: string;
    bio?: string;
    name?: string;
    secUid?: string;
  };
  followers?: number;
  verified?: boolean;
  growthRate?: number;
  region?: string;
  category?: string;
}

export interface AnalyticsOverview {
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
  ranks: {
    global: number;
    country: {
      name: string;
      rank: number;
    };
    category: {
      name: string;
      rank: number;
    };
  };
  insights: string[];
}

export interface Demographics {
  yearlyGrowth: {
    percentage: number;
    label: string;
    followersGained: number;
    peerGrowthRate: number;
  };
  followerGrowthTimeline: Array<{
    date: string;
    followers: number;
  }>;
}

export interface EstimatedMetrics {
  reach: {
    post: {
      min: number;
      max: number;
    };
    story: {
      min: number;
      max: number;
    };
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
    percentage: number;
  }>;
}

export class AnalyticsCalculator {
  static calculateOverview(userInfo: UserInfo, posts: SocialPost[], followers: number): AnalyticsOverview {
    const totalEngagement = posts.reduce((sum, post) => 
      sum + (post.likes || 0) + (post.comments || 0) + (post.shares || 0), 0
    );
    
    const engagementRate = followers > 0 ? (totalEngagement / followers) * 100 : 0;
    const avgPostsPerDay = posts.length / 30; // Assuming 30 days of data

    return {
      followers,
      qualityAudience: {
        percentage: this.calculateQualityAudiencePercentage(posts, followers),
        count: Math.floor(followers * (this.calculateQualityAudiencePercentage(posts, followers) / 100))
      },
      followersGrowth30d: {
        percentage: this.calculateGrowthRate(userInfo),
        label: this.getGrowthLabel(this.calculateGrowthRate(userInfo))
      },
      engagementRate: {
        percentage: engagementRate,
        label: this.getEngagementLabel(engagementRate)
      },
      authenticEngagement: {
        value: this.calculateAuthenticEngagement(posts),
        unit: "per post"
      },
      postFrequency: {
        value: avgPostsPerDay,
        unit: "posts/day",
        label: this.getFrequencyLabel(avgPostsPerDay)
      }
    };
  }

  static calculateAudienceQualityScore(userInfo: UserInfo, posts: SocialPost[], followers: number): AudienceQualityScore {
    const engagementQuality = this.calculateEngagementQuality(posts);
    const followerQuality = this.calculateFollowerQuality(userInfo);
    const contentQuality = this.calculateContentQuality(posts);
    
    const score = Math.min(100, (engagementQuality + followerQuality + contentQuality) / 3);
    
    return {
      score: Math.round(score),
      label: this.getQualityLabel(score),
      ranks: {
        global: this.calculateGlobalRank(score),
        country: {
          name: userInfo?.user?.location || userInfo?.region || "Unknown",
          rank: this.calculateCountryRank(score)
        },
        category: {
          name: userInfo?.user?.category || userInfo?.category || "General",
          rank: this.calculateCategoryRank(score)
        }
      },
      insights: this.generateQualityInsights(posts, followers)
    };
  }

  static calculateDemographics(userInfo: UserInfo, posts: SocialPost[]): Demographics {
    const growthRate = this.calculateGrowthRate(userInfo);
    const followersGained = Math.floor((userInfo?.user?.followers_count || userInfo?.followers || 0) * (growthRate / 100));
    
    return {
      yearlyGrowth: {
        percentage: growthRate,
        label: this.getGrowthLabel(growthRate),
        followersGained,
        peerGrowthRate: 15.5
      },
      followerGrowthTimeline: this.generateGrowthTimeline(userInfo, posts)
    };
  }

  static calculateEstimatedMetrics(posts: SocialPost[], followers: number): EstimatedMetrics {
    const avgReach = followers * 0.3; // Estimated reach percentage
    const avgImpressions = followers * 0.8; // Estimated impressions
    
    return {
      reach: {
        post: {
          min: Math.floor(avgReach * 0.7),
          max: Math.floor(avgReach * 1.3)
        },
        story: {
          min: Math.floor(avgReach * 0.5),
          max: Math.floor(avgReach * 1.1)
        }
      },
      impressions: Math.floor(avgImpressions),
      audienceReachability: {
        level: this.getReachabilityLevel(avgReach, followers),
        percentBelow1500: this.calculateBelow1500Percentage(posts),
        peerAverage: 25.5
      },
      audienceAuthenticity: {
        level: this.getAuthenticityLevel(posts),
        percentAuthentic: this.calculateAuthenticPercentage(posts),
        peerAverage: 78.2
      }
    };
  }

  static calculateAudienceBreakdown(userInfo: UserInfo, posts: SocialPost[]): AudienceBreakdown {
    return {
      ageDistribution: this.estimateAgeDistribution(userInfo),
      genderRatio: this.estimateGenderRatio(userInfo),
      topCountry: userInfo?.user?.location || userInfo?.region || "Unknown",
      audienceGeo: this.estimateGeographicDistribution(userInfo),
      audienceType: this.estimateAudienceType(posts, userInfo)
    };
  }

  private static calculateQualityAudiencePercentage(posts: SocialPost[], followers: number): number {
    const highEngagementPosts = posts.filter(post => 
      (post.likes + post.comments + post.shares) / (post.views || 1) > 0.05
    );
    return Math.min(100, (highEngagementPosts.length / posts.length) * 100);
  }

  private static calculateGrowthRate(userInfo: UserInfo): number {
    return userInfo?.growthRate || 12.5;
  }

  private static calculateAuthenticEngagement(posts: SocialPost[]): number {
    const totalEngagement = posts.reduce((sum, post) => 
      sum + (post.likes || 0) + (post.comments || 0) + (post.shares || 0), 0
    );
    return posts.length > 0 ? totalEngagement / posts.length : 0;
  }

  private static calculateEngagementQuality(posts: SocialPost[]): number {
    const engagementRates = posts.map(post => 
      (post.likes + post.comments + post.shares) / (post.views || 1)
    );
    const avgEngagement = engagementRates.reduce((sum, rate) => sum + rate, 0) / posts.length;
    return Math.min(100, avgEngagement * 1000); // Scale to 0-100
  }

  private static calculateFollowerQuality(userInfo: UserInfo): number {
    return userInfo?.user?.verified || userInfo?.verified ? 85 : 65;
  }

  private static calculateContentQuality(posts: SocialPost[]): number {
    const highQualityPosts = posts.filter(post => 
      (post.likes + post.comments + post.shares) > 100
    );
    return Math.min(100, (highQualityPosts.length / posts.length) * 100);
  }

  private static generateQualityInsights(posts: SocialPost[], followers: number): string[] {
    const insights = [];
    const avgEngagement = posts.reduce((sum, post) => 
      sum + (post.likes + post.comments + post.shares), 0
    ) / posts.length;

    if (avgEngagement > 1000) insights.push("High engagement rate indicates strong audience connection");
    if (followers > 10000) insights.push("Large following suggests established presence");
    if (posts.length > 50) insights.push("Consistent posting frequency");
    
    return insights;
  }

  private static getGrowthLabel(rate: number): string {
    if (rate > 20) return "Excellent";
    if (rate > 10) return "Good";
    if (rate > 5) return "Average";
    return "Slow";
  }

  private static getEngagementLabel(rate: number): string {
    if (rate > 5) return "Excellent";
    if (rate > 2) return "Good";
    if (rate > 1) return "Average";
    return "Low";
  }

  private static getFrequencyLabel(frequency: number): string {
    if (frequency > 2) return "Very Active";
    if (frequency > 1) return "Active";
    if (frequency > 0.5) return "Moderate";
    return "Inactive";
  }

  private static getQualityLabel(score: number): string {
    if (score > 80) return "Excellent";
    if (score > 60) return "Good";
    if (score > 40) return "Average";
    return "Poor";
  }

  private static getReachabilityLevel(reach: number, followers: number): string {
    const ratio = reach / followers;
    if (ratio > 0.5) return "High";
    if (ratio > 0.3) return "Medium";
    return "Low";
  }

  private static getAuthenticityLevel(posts: SocialPost[]): string {
    const authenticPosts = posts.filter(post => 
      (post.likes + post.comments + post.shares) / (post.views || 1) > 0.02
    );
    const percentage = (authenticPosts.length / posts.length) * 100;
    if (percentage > 70) return "High";
    if (percentage > 50) return "Medium";
    return "Low";
  }

  private static calculateBelow1500Percentage(posts: SocialPost[]): number {
    const lowReachPosts = posts.filter(post => (post.views || 0) < 1500);
    return posts.length > 0 ? (lowReachPosts.length / posts.length) * 100 : 100;
  }

  private static calculateAuthenticPercentage(posts: SocialPost[]): number {
    const authenticPosts = posts.filter(post => 
      (post.likes + post.comments + post.shares) / (post.views || 1) > 0.01
    );
    return posts.length > 0 ? (authenticPosts.length / posts.length) * 100 : 0;
  }

  private static estimateAgeDistribution(userInfo: UserInfo): Array<{range: string, male: number, female: number}> {
    return [
      { range: "13-17", male: 15, female: 25 },
      { range: "18-24", male: 20, female: 30 },
      { range: "25-34", male: 10, female: 15 },
      { range: "35+", male: 5, female: 10 }
    ];
  }

  private static estimateGenderRatio(userInfo: UserInfo): {male: number, female: number, adults: number} {
    return {
      male: 35,
      female: 65,
      adults: 80
    };
  }

  private static estimateGeographicDistribution(userInfo: UserInfo): Array<{country: string, percentage: number}> {
    return [
      { country: "United States", percentage: 40 },
      { country: "India", percentage: 20 },
      { country: "Brazil", percentage: 15 },
      { country: "Others", percentage: 25 }
    ];
  }

  private static estimateAudienceType(posts: SocialPost[], userInfo: UserInfo): Array<{type: string, percentage: number}> {
    return [
      { type: "Engaged Followers", percentage: 60 },
      { type: "Passive Followers", percentage: 30 },
      { type: "Inactive Followers", percentage: 10 }
    ];
  }

  private static generateGrowthTimeline(userInfo: UserInfo, posts: SocialPost[]): Array<{date: string, followers: number}> {
    const timeline = [];
    const baseFollowers = userInfo?.user?.followers_count || userInfo?.followers || 1000;
    
    for (let i = 30; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const followers = Math.floor(baseFollowers * (1 - (i * 0.01)));
      timeline.push({
        date: date.toISOString().split('T')[0],
        followers: Math.max(followers, 1000)
      });
    }
    
    return timeline;
  }

  private static calculateGlobalRank(score: number): number {
    return Math.floor(Math.random() * 10000) + 1;
  }

  private static calculateCountryRank(score: number): number {
    return Math.floor(Math.random() * 100) + 1;
  }

  private static calculateCategoryRank(score: number): number {
    return Math.floor(Math.random() * 200) + 1;
  }
} 