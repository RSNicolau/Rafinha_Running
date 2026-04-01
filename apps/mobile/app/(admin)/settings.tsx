import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTheme } from '../../src/theme';
import { spacing, typography } from '../../src/theme';
import { GlassCard, GlassInput, GlassButton } from '../../src/components/ui';
import { api } from '../../src/services/api';

export default function AdminSettingsScreen() {
  const { colors } = useTheme();
  const [primaryColor, setPrimaryColor] = useState('#DC2626');
  const [secondaryColor, setSecondaryColor] = useState('#FFFFFF');
  const [fontFamily, setFontFamily] = useState('Inter');

  useQuery({
    queryKey: ['themeConfig'],
    queryFn: async () => {
      const { data } = await api.get('/admin/config/theme');
      if (data.primaryColor) setPrimaryColor(data.primaryColor);
      if (data.secondaryColor) setSecondaryColor(data.secondaryColor);
      if (data.fontFamily) setFontFamily(data.fontFamily);
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.put('/admin/config/theme', {
        primaryColor,
        secondaryColor,
        fontFamily,
      });
    },
    onSuccess: () => Alert.alert('Sucesso', 'Tema atualizado!'),
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: colors.text }]}>Personalização do Tema</Text>

        {/* Brand Colors Section */}
        <GlassCard intensity="medium" shadow="md" style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Cores da Marca</Text>
          <GlassInput
            label="Cor Primária (hex)"
            value={primaryColor}
            onChangeText={setPrimaryColor}
            placeholder="#DC2626"
            containerStyle={styles.inputGap}
          />
          <GlassInput
            label="Cor Secundária (hex)"
            value={secondaryColor}
            onChangeText={setSecondaryColor}
            placeholder="#FFFFFF"
            containerStyle={styles.inputGap}
          />

          {/* Color Preview */}
          <View style={styles.previewRow}>
            <View style={[styles.colorPreview, { backgroundColor: primaryColor }]}>
              <Text style={styles.colorText}>Primária</Text>
            </View>
            <View style={[styles.colorPreview, { backgroundColor: secondaryColor, borderWidth: 1, borderColor: colors.border }]}>
              <Text style={[styles.colorText, { color: colors.text }]}>Secundária</Text>
            </View>
          </View>
        </GlassCard>

        {/* Typography Section */}
        <GlassCard intensity="medium" shadow="md" style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Tipografia</Text>
          <GlassInput
            label="Família de Fonte"
            value={fontFamily}
            onChangeText={setFontFamily}
            placeholder="Inter"
          />
        </GlassCard>

        {/* Logo Section */}
        <GlassCard intensity="medium" shadow="md" style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Logo</Text>
          <GlassButton
            title="Fazer Upload do Logo"
            onPress={() => {}}
            variant="secondary"
            fullWidth
          />
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            Formatos: PNG, SVG. Tamanho máximo: 2MB
          </Text>
        </GlassCard>

        {/* Version Info */}
        <GlassCard intensity="subtle" shadow="none" style={styles.versionCard}>
          <Text style={[styles.versionText, { color: colors.textSecondary }]}>
            RR Rafinha Running Admin
          </Text>
          <Text style={[styles.versionSubText, { color: colors.textTertiary }]}>
            Versão 1.0.0
          </Text>
        </GlassCard>

        <GlassButton
          title="Salvar Configurações"
          onPress={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          fullWidth
          size="lg"
          style={{ marginTop: spacing.xl }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: spacing.base, paddingBottom: spacing['3xl'] },
  title: { ...typography.h2, marginBottom: spacing.xl },
  section: { marginBottom: spacing.base },
  sectionTitle: { ...typography.h4, marginBottom: spacing.md },
  inputGap: { marginBottom: spacing.sm },
  previewRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  colorPreview: {
    flex: 1, height: 60, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  colorText: { color: '#FFFFFF', fontWeight: '600', fontSize: 12 },
  hint: { ...typography.caption, marginTop: spacing.sm },
  versionCard: { marginBottom: spacing.base, alignItems: 'center' },
  versionText: { ...typography.bodyMedium },
  versionSubText: { ...typography.caption, marginTop: spacing.xs },
});
