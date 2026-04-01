export enum PlanStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  PAUSED = 'PAUSED',
  DRAFT = 'DRAFT',
}

export interface TrainingPlan {
  id: string;
  coachId: string;
  athleteId: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  status: PlanStatus;
  weeklyFrequency: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlanRequest {
  athleteId: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  weeklyFrequency: number;
}

export interface PlanWithWorkouts extends TrainingPlan {
  workouts: import('./workout').Workout[];
  completionPercentage: number;
}
