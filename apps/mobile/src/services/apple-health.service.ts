/**
 * Apple Health (HealthKit) Service
 *
 * Reads workout data from HealthKit and syncs to the RR API.
 * Only available on iOS — all methods are no-ops on Android.
 *
 * Requires:
 *  - app.json: react-native-health plugin with NSHealthShareUsageDescription
 *  - App ID: com.rafinharunning.app with HealthKit capability (registered ✅)
 *  - Team ID: LPMFPMB2ZG
 *
 * Install: npx expo install react-native-health
 */

import { Platform } from 'react-native';
import { api } from './api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HealthWorkout {
  id: string;
  type: string; // 'Running', 'Walking', etc.
  startDate: string;
  endDate: string;
  durationMinutes: number;
  distanceKm: number;
  calories: number;
  averageHeartRate?: number;
  averagePaceMinPerKm?: number;
  source: 'APPLE_HEALTH';
}

// ─── Lazy-load react-native-health (iOS only) ────────────────────────────────

let AppleHealthKit: any = null;
let Permissions: any = null;

function getHealthKit() {
  if (Platform.OS !== 'ios') return null;
  if (!AppleHealthKit) {
    try {
      const mod = require('react-native-health');
      AppleHealthKit = mod.default ?? mod;
      Permissions = mod.HealthKitPermissions ?? AppleHealthKit?.Constants?.Permissions;
    } catch {
      // react-native-health not installed yet
      AppleHealthKit = null;
    }
  }
  return AppleHealthKit;
}

// ─── Permission request ───────────────────────────────────────────────────────

const HEALTH_PERMISSIONS = {
  permissions: {
    read: [
      'HeartRate',
      'ActiveEnergyBurned',
      'DistanceWalkingRunning',
      'StepCount',
      'Workout',
      'RunningSpeed',
      'RunningGroundContactTime',
      'RunningStrideLength',
      'RunningVerticalOscillation',
      'RunningPower',
      'VO2Max',
      'SleepAnalysis',
      'RestingHeartRate',
      'HeartRateVariabilitySDNN',
    ],
    write: ['Workout', 'ActiveEnergyBurned', 'DistanceWalkingRunning'],
  },
};

export async function requestHealthKitPermissions(): Promise<boolean> {
  const HK = getHealthKit();
  if (!HK) return false;

  return new Promise((resolve) => {
    HK.initHealthKit(HEALTH_PERMISSIONS, (err: any) => {
      if (err) {
        console.warn('[HealthKit] Permission denied:', err);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

export function isHealthKitAvailable(): boolean {
  return Platform.OS === 'ios' && !!getHealthKit();
}

// ─── Fetch workouts from HealthKit ───────────────────────────────────────────

export async function fetchRecentWorkouts(daysSince = 30): Promise<HealthWorkout[]> {
  const HK = getHealthKit();
  if (!HK) return [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysSince);

  return new Promise((resolve) => {
    const options = {
      startDate: startDate.toISOString(),
      endDate: new Date().toISOString(),
      type: 'Running',
      includeManuallyAdded: true,
    };

    HK.getSamples(options, (err: any, results: any[]) => {
      if (err || !results) { resolve([]); return; }

      const workouts: HealthWorkout[] = results.map((r) => {
        const durationMin = r.duration ? r.duration / 60 : 0;
        const distKm = r.distance ? r.distance / 1000 : 0;
        const pace = distKm > 0 ? durationMin / distKm : undefined;

        return {
          id: r.id ?? r.startDate,
          type: r.activityName ?? 'Running',
          startDate: r.startDate,
          endDate: r.endDate,
          durationMinutes: Math.round(durationMin),
          distanceKm: Math.round(distKm * 100) / 100,
          calories: Math.round(r.totalEnergyBurned ?? 0),
          averageHeartRate: r.averageHeartRate ?? undefined,
          averagePaceMinPerKm: pace ? Math.round(pace * 100) / 100 : undefined,
          source: 'APPLE_HEALTH',
        };
      });

      resolve(workouts);
    });
  });
}

// ─── Sync to RR API ──────────────────────────────────────────────────────────

export async function syncHealthKitToAPI(daysSince = 7): Promise<{ synced: number; errors: number }> {
  const granted = await requestHealthKitPermissions();
  if (!granted) return { synced: 0, errors: 0 };

  const workouts = await fetchRecentWorkouts(daysSince);
  if (workouts.length === 0) return { synced: 0, errors: 0 };

  let synced = 0;
  let errors = 0;

  for (const workout of workouts) {
    try {
      await api.post('/workouts/sync/health', workout);
      synced++;
    } catch {
      errors++;
    }
  }

  return { synced, errors };
}

// ─── Read heart rate samples ─────────────────────────────────────────────────

export async function fetchHeartRateSamples(
  startDate: Date,
  endDate: Date,
): Promise<Array<{ value: number; startDate: string }>> {
  const HK = getHealthKit();
  if (!HK) return [];

  return new Promise((resolve) => {
    HK.getHeartRateSamples(
      { startDate: startDate.toISOString(), endDate: endDate.toISOString(), limit: 1000 },
      (err: any, results: any[]) => {
        if (err || !results) { resolve([]); return; }
        resolve(results.map((r) => ({ value: r.value, startDate: r.startDate })));
      },
    );
  });
}

// ─── Read VO2 Max ─────────────────────────────────────────────────────────────

export async function fetchVO2Max(): Promise<number | null> {
  const HK = getHealthKit();
  if (!HK) return null;

  return new Promise((resolve) => {
    HK.getVo2MaxSamples(
      { startDate: new Date(0).toISOString(), endDate: new Date().toISOString(), limit: 1 },
      (err: any, results: any[]) => {
        if (err || !results?.length) { resolve(null); return; }
        resolve(results[0]?.value ?? null);
      },
    );
  });
}
