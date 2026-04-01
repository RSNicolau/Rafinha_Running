export enum WorkoutType {
  EASY_RUN = 'EASY_RUN',
  TEMPO = 'TEMPO',
  INTERVAL = 'INTERVAL',
  LONG_RUN = 'LONG_RUN',
  RECOVERY = 'RECOVERY',
  RACE = 'RACE',
  CROSS_TRAINING = 'CROSS_TRAINING',
  REST = 'REST',
}

export enum WorkoutStatus {
  SCHEDULED = 'SCHEDULED',
  COMPLETED = 'COMPLETED',
  SKIPPED = 'SKIPPED',
  MISSED = 'MISSED',
}

export enum WorkoutSource {
  MANUAL = 'MANUAL',
  GARMIN = 'GARMIN',
  STRAVA = 'STRAVA',
  APPLE_HEALTH = 'APPLE_HEALTH',
  GOOGLE_FIT = 'GOOGLE_FIT',
}

export enum HeartRateZone {
  Z1_RECOVERY = 'Z1_RECOVERY',
  Z2_EASY = 'Z2_EASY',
  Z3_AEROBIC = 'Z3_AEROBIC',
  Z4_THRESHOLD = 'Z4_THRESHOLD',
  Z5_MAXIMUM = 'Z5_MAXIMUM',
}

export interface Workout {
  id: string;
  planId: string;
  athleteId: string;
  scheduledDate: string;
  type: WorkoutType;
  title: string;
  description?: string;
  targetDistanceMeters?: number;
  targetDurationSeconds?: number;
  targetPace?: string;
  heartRateZone?: HeartRateZone;
  status: WorkoutStatus;
  completedAt?: string;
  result?: WorkoutResult;
}

export interface WorkoutResult {
  id: string;
  workoutId: string;
  source: WorkoutSource;
  externalId?: string;
  distanceMeters: number;
  durationSeconds: number;
  avgPace?: string;
  avgHeartRate?: number;
  maxHeartRate?: number;
  calories?: number;
  elevationGain?: number;
  splits?: Split[];
  gpsRoute?: GpsPoint[];
}

export interface Split {
  kilometer: number;
  durationSeconds: number;
  pace: string;
  heartRate?: number;
}

export interface GpsPoint {
  lat: number;
  lng: number;
  elevation?: number;
  timestamp: string;
}

export interface CreateWorkoutRequest {
  planId: string;
  scheduledDate: string;
  type: WorkoutType;
  title: string;
  description?: string;
  targetDistanceMeters?: number;
  targetDurationSeconds?: number;
  targetPace?: string;
  heartRateZone?: HeartRateZone;
}

export interface WeeklyWorkouts {
  week: string;
  workouts: Workout[];
  totalDistanceMeters: number;
  completedCount: number;
  totalCount: number;
}
