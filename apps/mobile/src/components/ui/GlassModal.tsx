import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../theme';
import { glass, glassShadow } from '../../theme/liquid-glass';

interface GlassModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function GlassModal({ visible, onClose, title, children }: GlassModalProps) {
  const { colors, isDark } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
        }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            glass.modal,
            glassShadow.lg,
            {
              width: '100%',
              maxWidth: 400,
              borderColor: colors.glassBorder,
              backgroundColor: Platform.OS === 'web' ? colors.glass : 'transparent',
            },
          ]}
        >
          {Platform.OS !== 'web' && (
            <BlurView
              intensity={60}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          )}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} />
          <View style={{ padding: 24, zIndex: 1 }}>
            {title && (
              <Text
                style={{
                  color: colors.text,
                  fontSize: 20,
                  fontWeight: '700',
                  marginBottom: 16,
                  letterSpacing: -0.3,
                }}
              >
                {title}
              </Text>
            )}
            {children}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
