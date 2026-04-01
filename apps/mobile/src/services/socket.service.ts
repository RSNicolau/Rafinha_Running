import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';

const SOCKET_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

let socket: Socket | null = null;

export const socketService = {
  async connect(): Promise<Socket> {
    if (socket?.connected) return socket;

    const token = await SecureStore.getItemAsync('accessToken');

    socket = io(`${SOCKET_URL}/chat`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    return socket;
  },

  disconnect(): void {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  },

  getSocket(): Socket | null {
    return socket;
  },

  joinConversation(conversationId: string): void {
    socket?.emit('conversation:join', { conversationId });
  },

  sendMessage(conversationId: string, content: string): void {
    socket?.emit('message:send', { conversationId, content });
  },

  startTyping(conversationId: string): void {
    socket?.emit('typing:start', { conversationId });
  },

  stopTyping(conversationId: string): void {
    socket?.emit('typing:stop', { conversationId });
  },

  markRead(conversationId: string): void {
    socket?.emit('message:read', { conversationId });
  },
};
