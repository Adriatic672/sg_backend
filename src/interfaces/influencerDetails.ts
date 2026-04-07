export interface SocialStats {
  instagram: number;
  tiktok: number;
  youtube: number;
  x: number;
}

export interface Review {
  reviewer: string;
  reviewerTitle: string;
  rating: number;
  comment: string;
  date: string;
}

export interface FCMMessage {
  title: string,
  body: string,
  messageType: string,
  senderUserName: string,
  conversationId: string,
  messageId: string,
  senderId: string,
  receiverId: string,
  originalMessageId?: string,
  text: string,
  edited: boolean,
  status: string,
  timestamp: string,
  mediaType?: string,
  mimeType?: string,
  mediaUrl?: string,
  size?: number|string,
  hasMedia?: string,
}
export interface MediaItem {
  media_type?: string;
  mime_type?: string;
  media_url?: string;
  size?: number;
  duration?: number;
  thumbnailUrl?: string;
}
export interface InfluencerDetails {
  name: string;
  address: string;
  level: string;
  verified: boolean;
  categories: string[];
  gemPoints: number;
  campaigns: number;
  sgRating: number;
  socialStats: SocialStats;
  about: string;
  location: string;
  reviews: Review[];
} 