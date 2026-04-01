import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/auth.store';
import { authService } from '../services/auth.service';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export interface LivePosition {
  athleteId: string;
  latitude: number;
  longitude: number;
  pace: number;
  distance: number;
  heartRate?: number;
  elapsed: number;
  altitude?: number;
  cadence?: number;
  timestamp: number;
}

interface LiveAthleteInfo {
  athleteId: string;
  lastUpdate: LivePosition | null;
  startedAt: number;
}

export function useLiveTracking() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [liveAthletes, setLiveAthletes] = useState<LiveAthleteInfo[]>([]);
  const [watchedPositions, setWatchedPositions] = useState<Map<string, LivePosition>>(new Map());
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    let socket: Socket;

    authService.getAccessToken().then((token) => {
      if (!token) return;

      socket = io(`${API_URL}/live`, {
        transports: ['websocket'],
        autoConnect: true,
        auth: { token },
      });

      socket.on('connect', () => setIsConnected(true));
      socket.on('disconnect', () => setIsConnected(false));

      // Coach: receive athlete updates
      socket.on('athlete-update', (data: LivePosition) => {
        setWatchedPositions((prev) => {
          const next = new Map(prev);
          next.set(data.athleteId, data);
          return next;
        });
      });

      socket.on('athlete-started', (data: { athleteId: string }) => {
        setLiveAthletes((prev) => {
          if (prev.find((a) => a.athleteId === data.athleteId)) return prev;
          return [...prev, { athleteId: data.athleteId, lastUpdate: null, startedAt: Date.now() }];
        });
      });

      socket.on('athlete-stopped', (data: { athleteId: string }) => {
        setLiveAthletes((prev) => prev.filter((a) => a.athleteId !== data.athleteId));
        setWatchedPositions((prev) => {
          const next = new Map(prev);
          next.delete(data.athleteId);
          return next;
        });
      });

      socketRef.current = socket;
    });

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated]);

  // Athlete: start tracking
  const startTracking = useCallback((workoutId?: string) => {
    if (!socketRef.current || !user) return;
    socketRef.current.emit('start-tracking', { athleteId: user.id, workoutId });
    setIsTracking(true);
  }, [user]);

  // Athlete: send location update
  const sendUpdate = useCallback((data: Omit<LivePosition, 'athleteId'>) => {
    if (!socketRef.current || !user) return;
    socketRef.current.emit('location-update', { ...data, athleteId: user.id });
  }, [user]);

  // Athlete: stop tracking
  const stopTracking = useCallback(() => {
    if (!socketRef.current || !user) return;
    socketRef.current.emit('stop-tracking', { athleteId: user.id });
    setIsTracking(false);
  }, [user]);

  // Coach: watch a specific athlete
  const watchAthlete = useCallback((athleteId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('watch-athlete', { athleteId });
  }, []);

  // Coach: unwatch
  const unwatchAthlete = useCallback((athleteId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('unwatch-athlete', { athleteId });
  }, []);

  // Get live athletes list
  const refreshLiveAthletes = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('get-live-athletes', {}, (data: LiveAthleteInfo[]) => {
      setLiveAthletes(data || []);
    });
  }, []);

  return {
    isConnected,
    isTracking,
    liveAthletes,
    watchedPositions,
    startTracking,
    sendUpdate,
    stopTracking,
    watchAthlete,
    unwatchAthlete,
    refreshLiveAthletes,
  };
}
