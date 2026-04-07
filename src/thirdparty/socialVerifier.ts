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
    const url = process.env.TWITTER_USERINFO_URL || 'https://api.twitter.com/2/users/me';

    try {
      const { data } = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const user = data?.data;
      console.log('Twitter user data:', user);
      if (!user?.username) throw new Error('Invalid Twitter user data');

      return {
        platform: 'twitter',
        username: user.username,
        displayName: user.name,
        avatarUrl: user.profile_image_url,
        raw: user,
      };
    } catch (err) {
      console.log('Twitter verification failed:', err);
      throw new Error(`Twitter verification failed: ${formatError(err)}`);
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
      if (!user?.display_name) throw new Error('Invalid TikTok user data');

      return {
        platform: 'tiktok',
        username: user.username || 'unknown',
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        followerCount: user.follower_count || 0,
        raw: user,
      };
    } catch (err) {
      console.log('TikTok verification failed:', err);
      throw new Error(`TikTok verification failed: ${formatError(err)}`);
    }
  }

  private static async verifyInstagram(token: string): Promise<SocialUserInfo> {
    const url = 'https://graph.instagram.com/me?fields=id,username,account_type,followers_count';

    try {
      const { data } = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
