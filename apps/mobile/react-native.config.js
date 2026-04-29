/**
 * react-native.config.js
 *
 * Exclude iOS-only native modules from Android auto-linking.
 * react-native-health uses HealthKit which is iOS-exclusive.
 */
module.exports = {
  dependencies: {
    'react-native-health': {
      platforms: {
        android: null, // disable Android auto-linking
      },
    },
  },
};
