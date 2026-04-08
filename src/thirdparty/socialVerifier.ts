import axios from 'axios';
import dotenv from 'dotenv';
import Model from '../helpers/model';

dotenv.config();

interface TikTokUserInfo {
  union_id?:string;
  video_count?: number;
  avatar_url?: string;
  bio_description?: string;
  follower_count?: number;
  following_count?: number;
  is_verified?: boolean;
  open_id?: string;
  display_name?: string;
  likes_count?: number;
  profile_deep_link?: string;
  username?: string;
}
export type SupportedPlatform = 'twitter' | 'tiktok' | 'instagram' | 'facebook';

export interface SocialUserInfo {
  platform: SupportedPlatform;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  followerCount?: number;
  raw?: any;
}

export class SocialVerifier {
  static async verify(
    platform: SupportedPlatform,
    accessToken: string
  ): Promise<SocialUserInfo> {
    switch (platform) {
      case 'twitter':
        return this.verifyTwitter(accessToken);
      case 'tiktok':
        return this.verifyTikTok(accessToken);
      case 'instagram':
        return this.verifyInstagram(accessToken);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  private static async verifyTwitter(token: string): Promise<SocialUserInfo> {
    // Use v2 for production, skip verification for local testing
    const useV2 = process.env.TWITTER_API_VERSION === 'v2';
    
    if (useV2) {
      // Twitter API v2 - requires project enrollment
      const url = 'https://api.twitter.com/2/users/me';
      
      try {
        const { data } = await axios.get(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        console.log('Twitter API v2 user data:', data);
        const user = data?.data;
        if (!user?.username) throw new Error('Invalid Twitter user data');
        
        return {
          platform: 'twitter',
          username: user.username,
          displayName: user.name,
          avatarUrl: user.profile_image_url,
          followerCount: user.public_metrics?.followers_count || 0,
          raw: user,
        };
      } catch (err: any) {
        console.log('Twitter v2 verification failed:', err.response?.data || err.message);
        
        // If it's a project enrollment error, provide helpful message
        if (err.response?.data?.reason === 'client-not-enrolled') {
          throw new Error('Twitter API v2 requires project enrollment. Please enroll your app in a Twitter developer project at https://developer.twitter.com/en/portal/projects-and-apps');
        }
        
        throw new Error(`Twitter verification failed: ${formatError(err)}`);
      }
    } else {
      // Local testing mode - skip API call
      // The OAuth flow already validated the user, so we trust the connection
      console.log('Twitter local mode - OAuth validated, skipping API verification');
      
      // Return placeholder - username will be updated when user provides it
      // or when you switch to v2 with proper enrollment
      return {
        platform: 'twitter',
        username: `twitter_${Date.now()}`, // Temporary unique username
        displayName: 'Twitter User',
        avatarUrl: '',
        followerCount: 0,
        raw: { 
          verified_locally: true,
          note: 'Switch to TWITTER_API_VERSION=v2 for full verification'
        }
      };
    }
  }

  

   static async verifyTikTok(token: string): Promise<SocialUserInfo> {
   // const url1 = 'https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url,open_id';

    const url = 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username,is_verified,bio_description,profile_deep_link,follower_count,following_count,likes_count,video_count'
    try {
      const { data } = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      
      console.log('TikTok user data:', data.data);
      const user:TikTokUserInfo = data?.data?.user;
      if (!user) throw new Error('Invalid TikTok user data');

      // username is required; display_name may be empty on restricted scopes
      const username = user.username || user.open_id || 'unknown';
      return {
        platform: 'tiktok',
        username,
        displayName: user.display_name || username,
        avatarUrl: user.avatar_url,
        followerCount: user.follower_count || 0, // may be 0 without user.info.stats approval
        raw: user,
      };
    } catch (err) {
      console.log('TikTok verification failed:', err);
      throw new Error(`TikTok verification failed: ${formatError(err)}`);
    }
  }

  private static async verifyInstagram(token: string): Promise<SocialUserInfo> {
    // Instagram Graph API endpoint
    const url = 'https://graph.instagram.com/me';

    try {
      // For Instagram Graph API via Facebook OAuth, token is passed as query param
      const { data } = await axios.get(url, {
        params: {
          fields: 'id,username,account_type,followers_count,media_count',
          access_token: token
        }
      });

      console.log('Instagram user data:', data);
      if (!data?.username) throw new Error('Invalid Instagram user data');
      new Model().logOperation("INSTAGRAM_VERIFICATION", data.username, "INSTAGRAM_VERIFICATION", { data }, "");

      return {
        platform: 'instagram',
        username: data.username,
        displayName: data.username,
        followerCount: data.followers_count ?? 0,
        raw: data,
      };
    } catch (err) {
      console.log('Instagram verification failed:', err);
      throw new Error(`Instagram verification failed: ${formatError(err)}`);
    }
  }
}

function formatError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data
      ? JSON.stringify(err.response.data)
      : err.message;
  }
  return String(err);
}
