export interface Conversation {
  id: string;
  athleteId: string;
  coachId: string;
  lastMessageAt?: string;
  lastMessage?: Message;
  otherUser?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  unreadCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  readAt?: string;
  createdAt: string;
}

export interface SendMessageRequest {
  conversationId: string;
  content: string;
}

export interface ChatEvents {
  'message:send': SendMessageRequest;
  'message:received': Message;
  'typing:start': { conversationId: string; userId: string };
  'typing:stop': { conversationId: string; userId: string };
  'message:read': { conversationId: string; messageId: string };
}
