import { Easing } from 'react-native-reanimated';

export const springConfig = {
  gentle: { damping: 20, stiffness: 150, mass: 1 },
  snappy: { damping: 15, stiffness: 250, mass: 0.8 },
  bouncy: { damping: 12, stiffness: 200, mass: 1 },
  smooth: { damping: 28, stiffness: 120, mass: 1 },
} as const;

export const timingConfig = {
  fast: { duration: 150, easing: Easing.out(Easing.cubic) },
  normal: { duration: 250, easing: Easing.out(Easing.cubic) },
  slow: { duration: 400, easing: Easing.out(Easing.cubic) },
  entrance: { duration: 350, easing: Easing.out(Easing.exp) },
  exit: { duration: 200, easing: Easing.in(Easing.cubic) },
} as const;

export const duration = {
  instant: 100,
  fast: 150,
  normal: 250,
  slow: 400,
  entrance: 350,
} as const;
