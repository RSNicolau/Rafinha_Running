import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { LiveTrackingData } from './live-tracking.gateway';

interface LiveSession {
  athleteId: string;
  clientId: string;
  workoutId?: string;
  startedAt: number;
  lastUpdate: LiveTrackingData | null;
  totalDistance: number;
  maxPace: number;
  avgPace: number;
  maxHeartRate: number;
}

const SESSION_TTL = 4 * 60 * 60; // 4 hours
const ROUTE_TTL = 4 * 60 * 60;

@Injectable()
export class LiveTrackingService {
  private readonly logger = new Logger('LiveTrackingService');

  constructor(private readonly cache: CacheService) {}

  private sessionKey(athleteId: string) {
    return `live:session:${athleteId}`;
  }
  private routeKey(athleteId: string) {
    return `live:route:${athleteId}`;
  }
  private clientKey(clientId: string) {
    return `live:client:${clientId}`;
  }

  async startSession(clientId: string, athleteId: string, workoutId?: string) {
    const session: LiveSession = {
      athleteId,
      clientId,
      workoutId,
      startedAt: Date.now(),
      lastUpdate: null,
      totalDistance: 0,
      maxPace: 0,
      avgPace: 0,
      maxHeartRate: 0,
    };

    await this.cache.set(this.sessionKey(athleteId), session, SESSION_TTL);
    await this.cache.set(this.clientKey(clientId), athleteId, SESSION_TTL);
    // Clear any previous route
    await this.cache.del(this.routeKey(athleteId));
  }

  async updateLocation(data: LiveTrackingData) {
    const session = await this.cache.get<LiveSession>(this.sessionKey(data.athleteId));
    if (!session) return;

    session.lastUpdate = data;
    session.totalDistance = data.distance;

    if (data.pace > session.maxPace) session.maxPace = data.pace;
    if (data.heartRate && data.heartRate > session.maxHeartRate) {
      session.maxHeartRate = data.heartRate;
    }
    if (data.elapsed > 0 && data.distance > 0) {
      session.avgPace = (data.elapsed / 60) / (data.distance / 1000);
    }

    await this.cache.set(this.sessionKey(data.athleteId), session, SESSION_TTL);

    // Append route point (stored as JSON array in cache)
    const route = await this.cache.get<Array<{ lat: number; lng: number; timestamp: number }>>(this.routeKey(data.athleteId)) || [];
    const lastRoute = route[route.length - 1];
    if (!lastRoute || data.timestamp - lastRoute.timestamp >= 5000) {
      route.push({ lat: data.latitude, lng: data.longitude, timestamp: data.timestamp });
      await this.cache.set(this.routeKey(data.athleteId), route, ROUTE_TTL);
    }
  }

  async endSession(athleteId: string) {
    const session = await this.cache.get<LiveSession>(this.sessionKey(athleteId));
    if (!session) return null;

    const route = await this.cache.get<Array<{ lat: number; lng: number; timestamp: number }>>(this.routeKey(athleteId)) || [];

    const summary = {
      athleteId,
      workoutId: session.workoutId,
      duration: Date.now() - session.startedAt,
      totalDistance: session.totalDistance,
      avgPace: Math.round(session.avgPace * 100) / 100,
      maxHeartRate: session.maxHeartRate,
      routePoints: route.length,
    };

    await this.cache.del(this.clientKey(session.clientId));
    await this.cache.del(this.sessionKey(athleteId));
    await this.cache.del(this.routeKey(athleteId));

    this.logger.log(`Session ended for ${athleteId}: ${JSON.stringify(summary)}`);
    return summary;
  }

  async handleDisconnect(clientId: string) {
    const athleteId = await this.cache.get<string>(this.clientKey(clientId));
    if (athleteId) {
      await this.endSession(athleteId);
    }
  }

  async getCurrentPosition(athleteId: string): Promise<LiveTrackingData | null> {
    const session = await this.cache.get<LiveSession>(this.sessionKey(athleteId));
    return session?.lastUpdate || null;
  }

  async getLiveAthletes(): Promise<Array<{
    athleteId: string;
    lastUpdate: LiveTrackingData | null;
    startedAt: number;
  }>> {
    // Scan for all live session keys
    const keys = await this.cache.getKeysByPattern('live:session:*');
    const results: Array<{ athleteId: string; lastUpdate: LiveTrackingData | null; startedAt: number }> = [];

    for (const key of keys) {
      const athleteId = key.replace('live:session:', '');
      const session = await this.cache.get<LiveSession>(key);
      if (session) {
        results.push({
          athleteId,
          lastUpdate: session.lastUpdate,
          startedAt: session.startedAt,
        });
      }
    }

    return results;
  }

  async getSessionRoute(athleteId: string) {
    return await this.cache.get<Array<{ lat: number; lng: number; timestamp: number }>>(this.routeKey(athleteId)) || [];
  }
}
