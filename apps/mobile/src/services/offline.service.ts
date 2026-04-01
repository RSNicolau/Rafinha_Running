import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { api } from './api';

const CACHE_PREFIX = 'rr_cache_';
const QUEUE_KEY = 'rr_offline_queue';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface QueuedRequest {
  id: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  data?: any;
  createdAt: number;
}

class OfflineService {
  private isOnline = true;
  private listeners: Array<(online: boolean) => void> = [];
  private syncInProgress = false;

  constructor() {
    this.init();
  }

  private async init() {
    // Subscribe to network changes
    NetInfo.addEventListener((state: NetInfoState) => {
      const wasOffline = !this.isOnline;
      this.isOnline = !!state.isConnected;
      this.listeners.forEach((fn) => fn(this.isOnline));

      // Auto-sync when coming back online
      if (wasOffline && this.isOnline) {
        this.processQueue();
      }
    });

    // Check initial state
    const state = await NetInfo.fetch();
    this.isOnline = !!state.isConnected;
  }

  // ── Network Status ──

  getIsOnline() {
    return this.isOnline;
  }

  onStatusChange(listener: (online: boolean) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((fn) => fn !== listener);
    };
  }

  // ── Caching ──

  async cacheGet<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
      if (!raw) return null;

      const entry: CacheEntry<T> = JSON.parse(raw);

      // Check if expired
      if (Date.now() - entry.timestamp > entry.ttl) {
        await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`);
        return null;
      }

      return entry.data;
    } catch {
      return null;
    }
  }

  async cacheSet<T>(key: string, data: T, ttl = CACHE_TTL): Promise<void> {
    try {
      const entry: CacheEntry<T> = { data, timestamp: Date.now(), ttl };
      await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));
    } catch {
      // Cache write failure is non-critical
    }
  }

  async cacheRemove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`);
    } catch {
      // Ignore
    }
  }

  async cacheClearAll(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
      for (const key of cacheKeys) {
        await AsyncStorage.removeItem(key);
      }
    } catch {
      // Ignore
    }
  }

  // ── Offline-first fetch: try cache, fall back to network, update cache ──

  async fetchWithCache<T>(key: string, url: string, ttl = CACHE_TTL): Promise<T | null> {
    // Try cache first if offline
    if (!this.isOnline) {
      return this.cacheGet<T>(key);
    }

    try {
      const { data } = await api.get<T>(url);
      await this.cacheSet(key, data, ttl);
      return data;
    } catch {
      // Network failed — return cached version
      return this.cacheGet<T>(key);
    }
  }

  // ── Offline Queue (for mutations) ──

  async enqueue(request: Omit<QueuedRequest, 'id' | 'createdAt'>): Promise<void> {
    const queue = await this.getQueue();
    queue.push({
      ...request,
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
    });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  async getQueue(): Promise<QueuedRequest[]> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async processQueue(): Promise<{ processed: number; failed: number }> {
    if (this.syncInProgress || !this.isOnline) return { processed: 0, failed: 0 };
    this.syncInProgress = true;

    const queue = await this.getQueue();
    if (queue.length === 0) {
      this.syncInProgress = false;
      return { processed: 0, failed: 0 };
    }

    let processed = 0;
    let failed = 0;
    const remaining: QueuedRequest[] = [];

    for (const req of queue) {
      try {
        switch (req.method) {
          case 'POST':
            await api.post(req.url, req.data);
            break;
          case 'PUT':
            await api.put(req.url, req.data);
            break;
          case 'PATCH':
            await api.patch(req.url, req.data);
            break;
          case 'DELETE':
            await api.delete(req.url);
            break;
        }
        processed++;
      } catch {
        // If request is older than 48h, discard it
        if (Date.now() - req.createdAt > 48 * 60 * 60 * 1000) {
          failed++;
        } else {
          remaining.push(req);
        }
      }
    }

    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    this.syncInProgress = false;

    return { processed, failed };
  }

  // ── Convenience: cache common data ──

  async cacheWorkouts(userId: string, workouts: any[]) {
    await this.cacheSet(`workouts_${userId}`, workouts);
  }

  async getCachedWorkouts(userId: string) {
    return this.cacheGet<any[]>(`workouts_${userId}`);
  }

  async cacheProfile(userId: string, profile: any) {
    await this.cacheSet(`profile_${userId}`, profile, 7 * 24 * 60 * 60 * 1000); // 7 days
  }

  async getCachedProfile(userId: string) {
    return this.cacheGet<any>(`profile_${userId}`);
  }

  async cacheWeekPlan(userId: string, plan: any) {
    await this.cacheSet(`weekplan_${userId}`, plan);
  }

  async getCachedWeekPlan(userId: string) {
    return this.cacheGet<any>(`weekplan_${userId}`);
  }
}

export const offlineService = new OfflineService();
