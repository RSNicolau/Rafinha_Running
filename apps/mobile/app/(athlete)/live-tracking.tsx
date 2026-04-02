import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
  Dimensions,
  AppState,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme';
import { GlassHeader } from '../../src/components/ui/GlassHeader';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { GlassButton } from '../../src/components/ui/GlassButton';
import { GlassBadge } from '../../src/components/ui/GlassBadge';
import { StatCard } from '../../src/components/ui/StatCard';
import { useLiveTracking, LivePosition } from '../../src/hooks/useLiveTracking';

export default function LiveTrackingScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const {
    isConnected,
    isTracking,
    startTracking,
    sendUpdate,
    stopTracking,
  } = useLiveTracking();

  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [pace, setPace] = useState(0);
  const [heartRate, setHeartRate] = useState(0);
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const locationWatcherRef = useRef<Location.LocationSubscription | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const totalDistanceRef = useRef<number>(0);

  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  useEffect(() => {
    if (!isTracking) {
      if (timerRef.current) clearInterval(timerRef.current);
      locationWatcherRef.current?.remove();
      locationWatcherRef.current = null;
      return;
    }

    startTimeRef.current = Date.now();
    totalDistanceRef.current = 0;
    lastPositionRef.current = null;

    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    const startLocationTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permissão de Localização',
          'Ative o acesso à localização nas configurações para usar o rastreamento ao vivo.',
        );
        return;
      }

      locationWatcherRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (location) => {
          const { latitude, longitude, altitude, speed } = location.coords;
          const elapsedSec = Math.floor((Date.now() - startTimeRef.current) / 1000);

          if (lastPositionRef.current) {
            const delta = haversineDistance(
              lastPositionRef.current.lat,
              lastPositionRef.current.lng,
              latitude,
              longitude,
            );
            totalDistanceRef.current += delta;
          }
          lastPositionRef.current = { lat: latitude, lng: longitude };

          const dist = totalDistanceRef.current;
          // pace in sec/km from GPS speed (m/s), fallback to elapsed/distance
          const currentPace =
            speed && speed > 0.5
              ? 1000 / speed
              : dist > 0
              ? (elapsedSec / dist) * 1000
              : 0;

          setDistance(dist);
          setPace(currentPace);

          sendUpdate({
            latitude,
            longitude,
            pace: currentPace,
            distance: dist,
            elapsed: elapsedSec,
            altitude: altitude || undefined,
            timestamp: Date.now(),
          });
        },
      );
    };

    startLocationTracking();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      locationWatcherRef.current?.remove();
      locationWatcherRef.current = null;
    };
  }, [isTracking, sendUpdate]);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatPace = (paceSeconds: number) => {
    if (paceSeconds <= 0 || !isFinite(paceSeconds)) return '--:--';
    const min = Math.floor(paceSeconds / 60);
    const sec = Math.round(paceSeconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(2)}km`;
  };

  const handleStart = () => {
    setElapsed(0);
    setDistance(0);
    setPace(0);
    setHeartRate(0);
    setPositions([]);
    startTracking();
  };

  const handleStop = () => {
    stopTracking();
    if (timerRef.current) clearInterval(timerRef.current);
    locationWatcherRef.current?.remove();
    locationWatcherRef.current = null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlassHeader
        title="Live Tracking"
        subtitle={isConnected ? 'Conectado' : 'Desconectado'}
        leftIcon={<Ionicons name="arrow-back" size={24} color={colors.text} />}
        onLeftPress={() => router.back()}
        rightIcon={
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: isConnected ? colors.success : colors.error,
            }}
          />
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Badge */}
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <GlassBadge
            label={isTracking ? 'Gravando' : 'Parado'}
            variant={isTracking ? 'success' : 'default'}
            icon={
              isTracking ? (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.success,
                  }}
                />
              ) : undefined
            }
          />
        </View>

        {/* Main Timer */}
        <GlassCard intensity="strong" padding={32} style={{ marginBottom: 20, alignItems: 'center' as any }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '500', marginBottom: 8 }}>
            TEMPO
          </Text>
          <Text
            style={{
              color: colors.text,
              fontSize: 56,
              fontWeight: '200',
              letterSpacing: -2,
              fontVariant: ['tabular-nums'],
            }}
          >
            {formatTime(elapsed)}
          </Text>
        </GlassCard>

        {/* Stats Grid */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
          <StatCard
            compact
            icon={<Ionicons name="speedometer-outline" size={18} color={colors.primary} />}
            value={formatPace(pace)}
            label="pace /km"
            style={{ flex: 1 }}
          />
          <StatCard
            compact
            icon={<Ionicons name="navigate-outline" size={18} color={colors.primary} />}
            value={formatDistance(distance)}
            label="distância"
            style={{ flex: 1 }}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
          <StatCard
            compact
            icon={<Ionicons name="heart-outline" size={18} color={colors.error} />}
            value={heartRate > 0 ? `${heartRate}` : '--'}
            label="bpm"
            style={{ flex: 1 }}
          />
          <StatCard
            compact
            icon={<Ionicons name="footsteps-outline" size={18} color={colors.primary} />}
            value={elapsed > 0 ? Math.round(distance / (elapsed / 60)).toString() : '--'}
            label="m/min"
            style={{ flex: 1 }}
          />
        </View>

        {/* Map Placeholder */}
        <GlassCard intensity="subtle" padding={0} style={{ marginBottom: 24, overflow: 'hidden' }}>
          <View
            style={{
              height: 200,
              backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="map-outline" size={48} color={colors.textTertiary} />
            <Text style={{ color: colors.textTertiary, fontSize: 13, marginTop: 8 }}>
              Mapa em tempo real (Mapbox)
            </Text>
            {isTracking && (
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>
                Transmitindo posição ao vivo...
              </Text>
            )}
          </View>
        </GlassCard>

        {/* Start/Stop Button */}
        {!isTracking ? (
          <GlassButton
            title="Iniciar Treino"
            onPress={handleStart}
            variant="primary"
            size="lg"
            fullWidth
            icon={<Ionicons name="play" size={20} color="#FFF" />}
            disabled={!isConnected}
          />
        ) : (
          <GlassButton
            title="Parar Treino"
            onPress={handleStop}
            variant="danger"
            size="lg"
            fullWidth
            icon={<Ionicons name="stop" size={20} color="#FFF" />}
          />
        )}

        {!isConnected && (
          <Text style={{ color: colors.error, fontSize: 12, textAlign: 'center', marginTop: 12 }}>
            Sem conexão com o servidor. Verifique sua internet.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
