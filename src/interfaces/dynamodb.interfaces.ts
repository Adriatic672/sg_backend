// interfaces.ts
// Interface for the Post in DynamoDB
export interface Post {
  post_id: string;
  user_id: string;
  username: string;
  text: string;
  likes: 0,
  comments: 0,
  views: 0,
  status:string,
  images: string[];
  thumbnail_images?: string[];
  created_at: string;
  media?: {
    media_type: string;
    mime_type: string;
    media_url: string;
    size: string;
  };
  contentModeration?: contentModeration;

}
export interface contentModeration {
  flagged: boolean;
  prediction: {
    code: string;
    description: string;
    label: string;
    probability: number;
  }
}

export interface Video {
  video_id: string;
  title: string;
  file_id?: string;
  description: string;
  category: string;
  tags: string[];
  duration: string;
  views: number;
  reward: number;
  likes: number;
  comments_count: number;
  published_date: string;
  video_url?: string;
  thumbnail_url?: string;
  trending_score?: number;
  is_trending?: boolean;
}


export interface ActivityNews {
  news_id: string,
  source: {
    name: string;
    id: string;
  };
  country: string,
  category: string,
  author: string | null;
  title: string;
  description: string | null;
  news_url: string;
  image_url: string | null;
  published_at: string;
  content: string | null;
  status: string;
  created_by: string;
  approved_by?: string | null;
  ttl: any;
}


interface RelatedNews {
  news_id: string;
  title: string;
  published_date: string;
  image_url: string;
}

export interface Message {
  message_id: string;
  sender_id: string;
  receiver_id: string;
  message_text: string;
  created_at: string;
}

export interface Conversation {
  conversationId: string;
  participants: string[];
  isGroup: boolean;
  createdAt: string;
}



export interface ChatMessage {
  messageId: string;
  senderUserName: string;
  conversationId: string;
  senderId: string;
  receiverId: string,
  edited: boolean;
  text: string;
  timestamp: string;
  status: MessageStatus;
  originalMessageId?: string;
  media?: MediaItem[];
}

export interface MediaItem {
  url: string;
  type: MediaType;
  size?: number;
  duration?: number;
  thumbnailUrl?: string;
}

export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ' | 'DELETED' | 'FAILED';

export type MediaType = 'image' | 'video' | 'audio' | 'file';


