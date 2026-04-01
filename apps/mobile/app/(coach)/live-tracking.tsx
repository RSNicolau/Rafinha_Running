import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { GlassHeader } from '../../src/components/ui/GlassHeader';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { GlassButton } from '../../src/components/ui/GlassButton';
import { GlassBadge } from '../../src/components/ui/GlassBadge';
import { GlassAvatar } from '../../src/components/ui/GlassAvatar';
import { StatCard } from '../../src/components/ui/StatCard';
import { useLiveTracking, LivePosition } from '../../src/hooks/useLiveTracking';

export default function CoachLiveTrackingScreen() {
  const { colors, isDark } = useTheme();
  const {
    isConnected,
    liveAthletes,
    watchedPositions,
    watchAthlete,
    unwatchAthlete,
    refreshLiveAthletes,
  } = useLiveTracking();

  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);

  useEffect(() => {
    refreshLiveAthletes();
    const interval = setInterval(refreshLiveAthletes, 10000);
    return () => clearInterval(interval);
  }, [refreshLiveAthletes]);

  const formatPace = (paceSeconds: number) => {
    if (!paceSeconds || !isFinite(paceSeconds)) return '--:--';
    const min = Math.floor(paceSeconds / 60);
    const sec = Math.round(paceSeconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const formatDistance = (meters: number) => {
    if (!meters) return '0m';
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(2)}km`;
  };

  const formatElapsed = (secs: number) => {
    if (!secs) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSelectAthlete = (athleteId: string) => {
    if (selectedAthleteId === athleteId) {
      unwatchAthlete(athleteId);
      setSelectedAthleteId(null);
    } else {
      if (selectedAthleteId) unwatchAthlete(selectedAthleteId);
      watchAthlete(athleteId);
      setSelectedAthleteId(athleteId);
    }
  };

  const selectedPosition = selectedAthleteId
    ? watchedPositions.get(selectedAthleteId)
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GlassHeader
        title="Live Tracking"
        subtitle={`${liveAthletes.length} atleta${liveAthletes.length !== 1 ? 's' : ''} ao vivo`}
        rightIcon={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: isConnected ? colors.success : colors.error,
              }}
            />
            <Ionicons name="refresh" size={20} color={colors.text} />
          </View>
        }
        onRightPress={refreshLiveAthletes}
      />

      {/* Map Placeholder */}
      <View
        style={{
          height: 250,
          backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottomWidth: 0.5,
          borderBottomColor: colors.glassBorder,
        }}
      >
        <Ionicons name="map-outline" size={56} color={colors.textTertiary} />
        <Text style={{ color: colors.textTertiary, fontSize: 14, marginTop: 8, fontWeight: '500' }}>
          Mapa em tempo real
        </Text>
        <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 4 }}>
          {liveAthletes.length > 0
            ? `${liveAthletes.length} atleta${liveAthletes.length !== 1 ? 's' : ''} correndo`
            : 'Nenhum atleta correndo agora'}
        </Text>
      </View>

      {/* Selected Athlete Stats */}
      {selectedPosition && (
        <View style={{ padding: 16, paddingBottom: 0 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <StatCard
              compact
              icon={<Ionicons name="speedometer-outline" size={16} color={colors.primary} />}
              value={formatPace(selectedPosition.pace)}
              label="pace"
              style={{ flex: 1 }}
            />
            <StatCard
              compact
              icon={<Ionicons name="navigate-outline" size={16} color={colors.primary} />}
              value={formatDistance(selectedPosition.distance)}
              label="distância"
              style={{ flex: 1 }}
            />
            <StatCard
              compact
              icon={<Ionicons name="heart-outline" size={16} color={colors.error} />}
              value={selectedPosition.heartRate ? `${selectedPosition.heartRate}` : '--'}
              label="bpm"
              style={{ flex: 1 }}
            />
            <StatCard
              compact
              icon={<Ionicons name="time-outline" size={16} color={colors.primary} />}
              value={formatElapsed(selectedPosition.elapsed)}
              label="tempo"
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}

      {/* Athletes List */}
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Atletas ao vivo
        </Text>

        {liveAthletes.length === 0 ? (
          <GlassCard intensity="subtle" padding={32} style={{ alignItems: 'center' as any }}>
            <Ionicons name="radio-outline" size={40} color={colors.textTertiary} />
            <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: '500', marginTop: 12 }}>
              Nenhum atleta correndo
            </Text>
            <Text style={{ color: colors.textTertiary, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
              Quando um atleta iniciar um treino com GPS, ele aparecerá aqui.
            </Text>
          </GlassCard>
        ) : (
          <FlatList
            data={liveAthletes}
            keyExtractor={(item) => item.athleteId}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 10 }}
            renderItem={({ item }) => {
              const pos = watchedPositions.get(item.athleteId);
              const isSelected = selectedAthleteId === item.athleteId;

              return (
                <Pressable onPress={() => handleSelectAthlete(item.athleteId)}>
                  <GlassCard
                    intensity={isSelected ? 'strong' : 'subtle'}
                    padding={16}
                    style={{
                      borderWidth: isSelected ? 1.5 : 0.5,
                      borderColor: isSelected ? colors.primary : colors.glassBorder,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <GlassAvatar name={item.athleteId} size={44} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
                          Atleta {item.athleteId.slice(0, 6)}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <GlassBadge label="Ao vivo" variant="success" size="sm" />
                          {pos && (
                            <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
                              {formatDistance(pos.distance)} • {formatPace(pos.pace)} /km
                            </Text>
                          )}
                        </View>
                      </View>
                      <Ionicons
                        name={isSelected ? 'eye' : 'eye-outline'}
                        size={22}
                        color={isSelected ? colors.primary : colors.textTertiary}
                      />
                    </View>
                  </GlassCard>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </View>
  );
}
