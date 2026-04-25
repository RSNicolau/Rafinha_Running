/**
 * Riegel's Formula: T2 = T1 * (D2/D1)^1.06
 * Predicts race time at D2 based on known time T1 at D1
 */
export function riegelPredict(t1Seconds: number, d1Km: number, d2Km: number): number {
  return t1Seconds * Math.pow(d2Km / d1Km, 1.06);
}

export function secondsToPace(totalSeconds: number, distanceKm: number): string {
  const paceSeconds = totalSeconds / distanceKm;
  const min = Math.floor(paceSeconds / 60);
  const sec = Math.round(paceSeconds % 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export function secondsToTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export interface RiegelPredictions {
  pace5k: string;
  time5k: string;
  pace10k: string;
  time10k: string;
  pace21k: string;
  time21k: string;
  pace42k: string;
  time42k: string;
}

export function generatePredictions(baseTimeSeconds: number, baseDistanceKm: number): RiegelPredictions {
  const distances = [5, 10, 21.0975, 42.195];
  const [t5k, t10k, t21k, t42k] = distances.map(d =>
    riegelPredict(baseTimeSeconds, baseDistanceKm, d)
  );

  return {
    pace5k: secondsToPace(t5k, 5),
    time5k: secondsToTime(t5k),
    pace10k: secondsToPace(t10k, 10),
    time10k: secondsToTime(t10k),
    pace21k: secondsToPace(t21k, 21.0975),
    time21k: secondsToTime(t21k),
    pace42k: secondsToPace(t42k, 42.195),
    time42k: secondsToTime(t42k),
  };
}
