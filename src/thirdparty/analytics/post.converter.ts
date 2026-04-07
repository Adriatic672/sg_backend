import { PostInterface, PostPlatform } from './post.interface';

// TikTok raw post structure (from API)
export interface TikTokRawPost {
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
    diggCount: number;
    commentCount: number;
    shareCount: number;
    playCount: number;
    collectCount: number;
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
  music?: {
    id: string;
    title: string;
    author: string;
  };
  hashtags?: Array<{
    id: string;
    name: string;
  }>;
  mentions?: Array<{
    id: string;
    uniqueId: string;
    nickname: string;
  }>;
}

// Instagram raw post structure
export interface InstagramRawPost {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
  owner: {
    id: string;
    username: string;
    full_name?: string;
    profile_picture_url?: string;
  };
}

// Twitter raw post structure
export interface TwitterRawPost {
  id: string;
  text: string;
  created_at: string;
  public_metrics: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
  author_id: string;
  author: {
    id: string;
    username: string;
    name: string;
    profile_image_url?: string;
    verified?: boolean;
  };
  entities?: {
    hashtags?: Array<{ tag: string }>;
    mentions?: Array<{ username: string }>;
    urls?: Array<{ url: string }>;
  };
}

// Facebook raw post structure
export interface FacebookRawPost {
  id: string;
  message?: string;
  created_time: string;
  reactions: {
    summary: {
      total_count: number;
    };
  };
  shares?: {
    count: number;
  };
  comments?: {
    summary: {
      total_count: number;
    };
  };
  from: {
    id: string;
    name: string;
    picture?: {
      data: {
        url: string;
      };
    };
  };
}

// YouTube raw post structure
export interface YouTubeRawPost {
  id: string;
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
    channelId: string;
    channelTitle: string;
    tags?: string[];
  };
  statistics: {
    viewCount: string;
    likeCount: string;
    commentCount: string;
  };
  contentDetails: {
    duration: string;
  };
}

// Converter class
export class PostConverter {
  
  // Convert TikTok raw post to unified PostInterface
  static fromTikTok(rawPost: any): PostInterface {
    return {
      id: rawPost.aweme_id || rawPost.id,
      platform: 'tiktok',
      content: rawPost.title || rawPost.desc,
      media: {
        type: 'video',
        url: rawPost.play || rawPost.video?.playAddr,
        thumbnail: rawPost.cover || rawPost.video?.cover,
        duration: rawPost.duration || rawPost.video?.duration,
        width: rawPost.video?.width,
        height: rawPost.video?.height,
        format: rawPost.video?.ratio
      },
      engagement: {
        likes: rawPost.digg_count || rawPost.stats?.diggCount || 0,
        comments: rawPost.comment_count || rawPost.stats?.commentCount || 0,
        shares: rawPost.share_count || rawPost.stats?.shareCount || 0,
        views: rawPost.play_count || rawPost.stats?.playCount || 0,
        saves: rawPost.collect_count || rawPost.stats?.collectCount || 0
      },
      author: {
        id: rawPost.author?.id,
        username: rawPost.author?.unique_id || rawPost.author?.uniqueId,
        displayName: rawPost.author?.nickname,
        avatar: rawPost.author?.avatar || rawPost.author?.avatarThumb,
        verified: rawPost.author?.verified || false
      },
      createdAt: rawPost.create_time || rawPost.createTime,
      metadata: {
        hashtags: rawPost.hashtags?.map((h: any) => h.name) || [],
        mentions: rawPost.mentioned_users ? rawPost.mentioned_users.split(',').filter((u: string) => u.trim()) : []
      }
    };
  }

  // Convert Instagram raw post to unified PostInterface
  static fromInstagram(rawPost: InstagramRawPost): PostInterface {
    return {
      id: rawPost.id,
      platform: 'instagram',
      content: rawPost.caption,
      media: {
        type: rawPost.media_type === 'VIDEO' ? 'video' : 
              rawPost.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : 'image',
        url: rawPost.media_url,
        thumbnail: rawPost.thumbnail_url
      },
      engagement: {
        likes: rawPost.like_count,
        comments: rawPost.comments_count,
        shares: 0, // Instagram doesn't provide share count in basic API
        views: 0
      },
      author: {
        id: rawPost.owner.id,
        username: rawPost.owner.username,
        displayName: rawPost.owner.full_name,
        avatar: rawPost.owner.profile_picture_url
      },
      createdAt: new Date(rawPost.timestamp).getTime() / 1000
    };
  }

  // Convert Twitter raw post to unified PostInterface
  static fromTwitter(rawPost: TwitterRawPost): PostInterface {
    return {
      id: rawPost.id,
      platform: 'twitter',
      content: rawPost.text,
      engagement: {
        likes: rawPost.public_metrics.like_count,
        comments: rawPost.public_metrics.reply_count,
        shares: rawPost.public_metrics.retweet_count,
        views: 0, // Twitter doesn't provide view count in basic API
        retweets: rawPost.public_metrics.retweet_count
      },
      author: {
        id: rawPost.author.id,
        username: rawPost.author.username,
        displayName: rawPost.author.name,
        avatar: rawPost.author.profile_image_url,
        verified: rawPost.author.verified
      },
      createdAt: new Date(rawPost.created_at).getTime() / 1000,
      metadata: {
        hashtags: rawPost.entities?.hashtags?.map(h => h.tag),
        mentions: rawPost.entities?.mentions?.map(m => m.username)
      }
    };
  }

  // Convert Facebook raw post to unified PostInterface
  static fromFacebook(rawPost: FacebookRawPost): PostInterface {
    return {
      id: rawPost.id,
      platform: 'facebook',
      content: rawPost.message,
      engagement: {
        likes: rawPost.reactions.summary.total_count,
        comments: rawPost.comments?.summary.total_count || 0,
        shares: rawPost.shares?.count || 0,
        views: 0, // Facebook doesn't provide view count in basic API
        reactions: rawPost.reactions.summary.total_count
      },
      author: {
        id: rawPost.from.id,
        username: rawPost.from.name,
        displayName: rawPost.from.name,
        avatar: rawPost.from.picture?.data.url
      },
      createdAt: new Date(rawPost.created_time).getTime() / 1000
    };
  }

  // Convert YouTube raw post to unified PostInterface
  static fromYouTube(rawPost: YouTubeRawPost): PostInterface {
    return {
      id: rawPost.id,
      platform: 'youtube',
      content: rawPost.snippet.title,
      description: rawPost.snippet.description,
      media: {
        type: 'video',
        thumbnail: rawPost.snippet.thumbnails.high?.url || 
                  rawPost.snippet.thumbnails.medium?.url || 
                  rawPost.snippet.thumbnails.default?.url,
        duration: this.parseYouTubeDuration(rawPost.contentDetails.duration)
      },
      engagement: {
        likes: parseInt(rawPost.statistics.likeCount) || 0,
        comments: parseInt(rawPost.statistics.commentCount) || 0,
        shares: 0, // YouTube doesn't provide share count in basic API
        views: parseInt(rawPost.statistics.viewCount) || 0
      },
      author: {
        id: rawPost.snippet.channelId,
        username: rawPost.snippet.channelTitle,
        displayName: rawPost.snippet.channelTitle
      },
      createdAt: new Date(rawPost.snippet.publishedAt).getTime() / 1000,
      metadata: {
        tags: rawPost.snippet.tags
      }
    };
  }

  // Helper method to parse YouTube duration (PT4M13S -> 253 seconds)
  private static parseYouTubeDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');
    
    return hours * 3600 + minutes * 60 + seconds;
  }

  // Generic converter that detects platform and converts accordingly
  static convert(rawPost: any, platform: PostPlatform): PostInterface {
    switch (platform) {
      case 'tiktok':
        return this.fromTikTok(rawPost as TikTokRawPost);
      case 'instagram':
        return this.fromInstagram(rawPost as InstagramRawPost);
      case 'twitter':
        return this.fromTwitter(rawPost as TwitterRawPost);
      case 'facebook':
        return this.fromFacebook(rawPost as FacebookRawPost);
      case 'youtube':
        return this.fromYouTube(rawPost as YouTubeRawPost);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  // Convert multiple posts
  static convertMultiple(rawPosts: any[], platform: PostPlatform): PostInterface[] {
    return rawPosts.map(post => this.convert(post, platform));
  }
} 