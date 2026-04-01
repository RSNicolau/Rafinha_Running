import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { useOffline } from '../../hooks/useOffline';

export function OfflineIndicator() {
  const { colors } = useTheme();
  const { isOnline, pendingCount } = useOffline();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-60)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: isOnline ? -60 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [isOnline, slideAnim]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          paddingTop: insets.top + 4,
          backgroundColor: colors.warning,
        },
      ]}
      pointerEvents={isOnline ? 'none' : 'auto'}
    >
      <View style={styles.content}>
        <View style={styles.dot} />
        <Text style={styles.text}>
          Modo offline
          {pendingCount > 0 ? ` • ${pendingCount} pendente${pendingCount > 1 ? 's' : ''}` : ''}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingBottom: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFF',
    opacity: 0.8,
  },
  text: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
