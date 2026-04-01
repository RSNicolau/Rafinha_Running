import { Injectable, Logger } from '@nestjs/common';
import { LiveTrackingData } from './live-tracking.gateway';

interface LiveSession {
  athleteId: string;
  clientId: string;
  workoutId?: string;
  startedAt: number;
  lastUpdate: LiveTrackingData | null;
  route: Array<{ lat: number; lng: number; timestamp: number }>;
  totalDistance: number;
  maxPace: number;
  avgPace: number;
  maxHeartRate: number;
}

@Injectable()
export class LiveTrackingService {
  private readonly logger = new Logger('LiveTrackingService');
  private sessions = new Map<string, LiveSession>(); // athleteId -> session
  private clientToAthlete = new Map<string, string>(); // clientId -> athleteId

  startSession(clientId: string, athleteId: string, workoutId?: string) {
    this.sessions.set(athleteId, {
      athleteId,
      clientId,
      workoutId,
      startedAt: Date.now(),
      lastUpdate: null,
      route: [],
      totalDistance: 0,
      maxPace: 0,
      avgPace: 0,
      maxHeartRate: 0,
    });
    this.clientToAthlete.set(clientId, athleteId);
  }

  updateLocation(data: LiveTrackingData) {
    const session = this.sessions.get(data.athleteId);
    if (!session) return;

    session.lastUpdate = data;
    session.totalDistance = data.distance;

    // Track route points (every 5 seconds max to avoid memory issues)
    const lastRoute = session.route[session.route.length - 1];
    if (!lastRoute || data.timestamp - lastRoute.timestamp >= 5000) {
      session.route.push({
        lat: data.latitude,
        lng: data.longitude,
        timestamp: data.timestamp,
      });
    }

    // Track max values
    if (data.pace > session.maxPace) session.maxPace = data.pace;
    if (data.heartRate && data.heartRate > session.maxHeartRate) {
      session.maxHeartRate = data.heartRate;
    }

    // Running average pace: elapsed is in seconds, distance in meters → min/km
    if (data.elapsed > 0 && data.distance > 0) {
      session.avgPace = (data.elapsed / 60) / (data.distance / 1000);
    }
  }

  endSession(athleteId: string) {
    const session = this.sessions.get(athleteId);
    if (!session) return null;

    const summary = {
      athleteId,
      workoutId: session.workoutId,
      duration: Date.now() - session.startedAt,
      totalDistance: session.totalDistance,
      avgPace: Math.round(session.avgPace * 100) / 100,
      maxHeartRate: session.maxHeartRate,
      routePoints: session.route.length,
    };

    this.clientToAthlete.delete(session.clientId);
    this.sessions.delete(athleteId);

    this.logger.log(`Session ended for ${athleteId}: ${JSON.stringify(summary)}`);
    return summary;
  }

  handleDisconnect(clientId: string) {
    const athleteId = this.clientToAthlete.get(clientId);
    if (athleteId) {
      this.endSession(athleteId);
    }
  }

  getCurrentPosition(athleteId: string): LiveTrackingData | null {
    return this.sessions.get(athleteId)?.lastUpdate || null;
  }

  getLiveAthletes(): Array<{
    athleteId: string;
    lastUpdate: LiveTrackingData | null;
    startedAt: number;
  }> {
    return Array.from(this.sessions.values()).map((s) => ({
      athleteId: s.athleteId,
      lastUpdate: s.lastUpdate,
      startedAt: s.startedAt,
    }));
  }

  getSessionRoute(athleteId: string) {
    return this.sessions.get(athleteId)?.route || [];
  }
}
