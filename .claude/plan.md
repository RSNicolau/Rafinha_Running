# Plan: Official Logo + Garmin Connect Integration

## Part 1: Official Logo Integration

### What
Replace the CSS-based "RR" logo with the official logo image across the app.

### Changes
1. **Save the official logo** as `apps/mobile/assets/logo.png` (use the uploaded image)
2. **Generate proper app icons** from the logo:
   - `assets/icon.png` (1024x1024) - App Store/Play Store icon
   - `assets/adaptive-icon.png` (1024x1024) - Android adaptive
   - `assets/favicon.png` (48x48) - Web favicon
   - `assets/splash.png` (1284x2778) - Splash screen
3. **Update `login.tsx`** - Replace the `<View style={logoContainer}><Text>RR</Text></View>` with `<Image source={require('../../assets/logo.png')} />`
4. **Update coach/admin headers** if they also use the CSS logo

---

## Part 2: Garmin Connect Integration (Push Workouts to Watch)

### Architecture Overview
```
Coach creates workout → API saves to DB → API pushes to Garmin Training API
→ Garmin Connect syncs to athlete's watch → Athlete completes workout
→ Garmin syncs results back → API matches and records results
```

### What Exists (already coded)
- OAuth flow structure (URL generation, callback, token storage)
- Activity sync FROM Garmin (pulls completed activities)
- DB model `FitnessIntegration` with all fields
- REST endpoints for connect/disconnect/sync
- Workout matching logic (date + distance ±10%)

### What Needs to Be Built

#### A. Backend — Real Garmin API HTTP Calls (garmin.service.ts)

1. **`exchangeCodeForToken()`** — Replace stub with real HTTP POST to `https://connect.garmin.com/oauth-service/oauth/token`
2. **`refreshAccessToken()`** — New method to refresh expired tokens (3-month expiry)
3. **`fetchRecentActivities()`** — Replace stub with real GET to Garmin Wellness API
4. **`pushWorkoutToGarmin()`** — NEW: Push a structured workout to Garmin Training API

The workout JSON format for Garmin:
```json
{
  "workoutName": "Treino Intervalado 5x1km",
  "sportType": { "sportTypeId": 1, "sportTypeKey": "running" },
  "workoutSegments": [{
    "segmentOrder": 1,
    "sportType": { "sportTypeId": 1, "sportTypeKey": "running" },
    "workoutSteps": [
      {
        "type": "ExecutableStepDTO",
        "stepOrder": 1,
        "stepType": { "stepTypeId": 0, "stepTypeKey": "warmup" },
        "endCondition": { "conditionTypeId": 2, "conditionTypeKey": "time" },
        "endConditionValue": "600.0",
        "targetType": { "workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target" }
      },
      {
        "type": "RepeatGroupDTO",
        "stepOrder": 2,
        "stepType": { "stepTypeId": 6, "stepTypeKey": "repeat" },
        "numberOfIterations": 5,
        "workoutSteps": [
          { "stepTypeKey": "interval", "endCondition": "distance", "endConditionValue": 1000 },
          { "stepTypeKey": "rest", "endCondition": "time", "endConditionValue": 120 }
        ]
      },
      { "stepTypeKey": "cooldown", "endCondition": "time", "endConditionValue": 300 }
    ]
  }]
}
```

5. **`scheduleWorkoutOnGarmin()`** — NEW: Schedule pushed workout on a specific date in Garmin Calendar
6. **`convertWorkoutToGarminFormat()`** — NEW: Convert our Workout model → Garmin JSON format

Mapping our WorkoutType → Garmin steps:
| Our Type | Garmin Structure |
|----------|-----------------|
| EASY_RUN | Single step, time-based, HR Zone 2 target |
| TEMPO | Warmup + tempo step (pace target) + cooldown |
| INTERVAL | Warmup + repeat group (interval + rest) + cooldown |
| LONG_RUN | Single step, distance-based, HR Zone 2 target |
| RECOVERY | Single step, time-based, HR Zone 1 target |
| RACE | Single step, distance-based, no target |

#### B. Backend — New Endpoint: Push Workout to Garmin

Add to `IntegrationsController`:
```
POST /integrations/garmin/push-workout/:workoutId
```
- Coach calls this after creating/scheduling a workout
- Converts workout → Garmin JSON format
- Pushes to athlete's Garmin Connect (using athlete's stored tokens)
- Stores Garmin workout ID in our DB for future reference

Add to `IntegrationsController`:
```
POST /integrations/garmin/push-plan/:planId
```
- Pushes ALL workouts in a training plan to Garmin at once
- Schedules each on the correct date in Garmin Calendar

#### C. Database — Add `garminWorkoutId` field

Add to Workout model:
```prisma
garminWorkoutId String? @map("garmin_workout_id")
```
This tracks which Garmin workout corresponds to our workout.

#### D. Mobile — Integrations Screen for Athletes

New screen `apps/mobile/app/(athlete)/integrations.tsx`:
- List connected integrations (Garmin, Strava)
- "Conectar Garmin" button → opens OAuth URL in browser
- Show sync status, last sync time
- Manual sync button
- Disconnect button

Wire up from Profile screen's "Integrações" menu item.

#### E. Mobile — Coach Workout Push UI

On the coach's athlete detail / workout creation screen:
- After creating a workout, show "Enviar para Garmin" button
- On training plan view, show "Enviar plano para Garmin" button
- Status indicator showing if workout was pushed (green check)

### Important Note: Garmin Developer Program

The Garmin Training API requires enrollment in the **Garmin Connect Developer Program** (free for business use). To get production API access:
1. Apply at https://developerportal.garmin.com
2. Garmin reviews within 2 business days
3. After approval, you get Consumer Key + Secret
4. Set these in `.env` as `GARMIN_CLIENT_ID` and `GARMIN_CLIENT_SECRET`

**I will build the full integration code now** — it will be fully functional once the API credentials are configured.

### File Changes Summary

| File | Action |
|------|--------|
| `apps/mobile/assets/logo.png` | Create — official logo |
| `apps/mobile/assets/icon.png` | Replace — proper icon from logo |
| `apps/mobile/app/(auth)/login.tsx` | Edit — use Image component for logo |
| `apps/api/src/modules/integrations/garmin/garmin.service.ts` | Edit — real API calls + push workout |
| `apps/api/src/modules/integrations/garmin/garmin-workout.converter.ts` | Create — workout format converter |
| `apps/api/src/modules/integrations/integrations.controller.ts` | Edit — add push endpoints |
| `apps/api/src/modules/integrations/integrations.service.ts` | Edit — add push methods |
| `apps/api/prisma/schema.prisma` | Edit — add garminWorkoutId field |
| `apps/mobile/app/(athlete)/integrations.tsx` | Create — integrations management screen |
| `apps/mobile/app/(athlete)/profile.tsx` | Edit — wire integrations menu item |
| `apps/mobile/app/(coach)/athlete-detail.tsx` | Edit — add "Push to Garmin" button |
