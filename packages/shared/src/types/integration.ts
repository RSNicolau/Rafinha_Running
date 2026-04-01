export enum IntegrationProvider {
  GARMIN = 'GARMIN',
  STRAVA = 'STRAVA',
  APPLE_HEALTH = 'APPLE_HEALTH',
  GOOGLE_FIT = 'GOOGLE_FIT',
}

export interface FitnessIntegration {
  id: string;
  userId: string;
  provider: IntegrationProvider;
  externalUserId?: string;
  isActive: boolean;
  lastSyncAt?: string;
  createdAt: string;
}

export interface IntegrationConnectRequest {
  provider: IntegrationProvider;
  redirectUri: string;
}

export interface IntegrationCallbackData {
  provider: IntegrationProvider;
  code: string;
  state?: string;
}
