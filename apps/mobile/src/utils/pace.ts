/**
 * Convert distance in meters and duration in seconds to pace string (min/km)
 */
export function calculatePace(distanceMeters: number, durationSeconds: number): string {
  if (distanceMeters <= 0 || durationSeconds <= 0) return '--:--';
  const paceSeconds = (durationSeconds / distanceMeters) * 1000;
  const minutes = Math.floor(paceSeconds / 60);
  const seconds = Math.round(paceSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format pace string (e.g., "5:42" -> "5:42 min/km")
 */
export function formatPace(pace: string | null | undefined): string {
  if (!pace) return '--:--';
  return `${pace} min/km`;
}

/**
 * Convert meters to km with 2 decimals
 */
export function metersToKm(meters: number): string {
  return (meters / 1000).toFixed(2);
}

/**
 * Format distance in meters to readable string
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters}m`;
  return `${metersToKm(meters)} km`;
}

/**
 * Format duration in seconds to HH:MM:SS or MM:SS
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format heart rate
 */
export function formatHeartRate(bpm: number | null | undefined): string {
  if (!bpm) return '--';
  return `${bpm} bpm`;
}
