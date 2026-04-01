export enum UserRole {
  ATHLETE = 'ATHLETE',
  COACH = 'COACH',
  ADMIN = 'ADMIN',
}

export enum AthleteLevel {
  BEGINNER = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  ADVANCED = 'ADVANCED',
  ELITE = 'ELITE',
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  phone?: string;
  dateOfBirth?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CoachProfile {
  id: string;
  userId: string;
  bio?: string;
  specializations: string[];
  certifications: string[];
  maxAthletes: number;
}

export interface AthleteProfile {
  id: string;
  userId: string;
  coachId?: string;
  weight?: number;
  height?: number;
  vo2max?: number;
  restingHR?: number;
  maxHR?: number;
  weeklyGoalKm?: number;
  level: AthleteLevel;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}
