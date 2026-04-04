-- AddValue: COROS and POLAR to IntegrationProvider enum
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'COROS';
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'POLAR';

-- AddValue: COROS and POLAR to WorkoutSource enum
ALTER TYPE "WorkoutSource" ADD VALUE IF NOT EXISTS 'COROS';
ALTER TYPE "WorkoutSource" ADD VALUE IF NOT EXISTS 'POLAR';
