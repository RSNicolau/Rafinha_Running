import React from 'react';
import { View, Text, Image, Pressable, ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { glassShadow } from '../../theme/liquid-glass';

interface GlassAvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: number;
  onPress?: () => void;
  showBorder?: boolean;
  badge?: React.ReactNode;
  style?: ViewStyle;
}

export function GlassAvatar({
  name,
  imageUrl,
  size = 48,
  onPress,
  showBorder = true,
  badge,
  style,
}: GlassAvatarProps) {
  const { colors } = useTheme();
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const fontSize = size * 0.36;
  const borderWidth = showBorder ? 2 : 0;

  const content = (
    <View
      style={[
        glassShadow.sm,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderColor: showBorder ? 'rgba(255, 255, 255, 0.5)' : 'transparent',
          overflow: 'hidden',
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <Text style={{ color: '#FFFFFF', fontSize, fontWeight: '700', letterSpacing: 0.5 }}>
          {initials}
        </Text>
      )}
    </View>
  );

  const wrapper = onPress ? (
    <Pressable onPress={onPress}>{content}</Pressable>
  ) : (
    content
  );

  if (badge) {
    return (
      <View>
        {wrapper}
        <View style={{ position: 'absolute', bottom: -2, right: -2 }}>{badge}</View>
      </View>
    );
  }

  return wrapper;
}
