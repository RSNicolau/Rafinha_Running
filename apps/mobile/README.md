# Rafinha Running — Mobile App

React Native + Expo app for the RR Rafinha Running platform.

## Dev

```bash
npx expo start
```

For web preview:

```bash
npx expo start --web
```

## Build

```bash
# iOS
eas build --platform ios

# Android
eas build --platform android

# Both
eas build --platform all
```

## API

```
https://rrapi-production.up.railway.app/api/v1
```

## Environment variables

Create `.env.local` at the root of `apps/mobile/`:

```env
EXPO_PUBLIC_API_URL=https://rrapi-production.up.railway.app/api/v1
EXPO_PUBLIC_PROJECT_ID=34d8880d-2a9c-4163-9a04-07305e629b0e
EXPO_PUBLIC_SENTRY_DSN=   # optional
```

## Project structure

```
apps/mobile/
  app/
    _layout.tsx              Root layout — auth guard + QueryClient + Sentry
    index.tsx                Redirects by role (athlete / coach / admin)
    (auth)/                  Landing, Login, Register
    (athlete)/               Athlete tab bar + all athlete screens
    (coach)/                 Coach tab bar + athlete management
    (admin)/                 Admin panel
  src/
    components/ui/           Glass-morphism design system components
    components/workout/      Workout-specific cards
    hooks/                   Custom React hooks
    i18n/                    Portuguese (pt-BR) translations
    services/                API client, auth, workout, push-notifications, socket
    stores/                  Zustand stores (auth, theme, branding, settings)
    theme/                   Design tokens (colors, typography, spacing, animations)
    utils/                   Date, pace, currency helpers
  lib/                       Short-path re-exports (api, auth.store)
  constants/                 Brand colour tokens
```

## TypeScript

```bash
npx tsc --noEmit
```
