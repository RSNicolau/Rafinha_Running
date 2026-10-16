import React from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { LEGAL_URLS, type ConsentState } from './legal';

interface Props {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  /** Exibe (e exige) o consentimento específico de dados de saúde — apenas atletas */
  showHealth: boolean;
}

function Row({
  checked, onToggle, children, required, highlight, hint,
}: {
  checked: boolean; onToggle: () => void; children: React.ReactNode; required?: boolean; highlight?: boolean; hint?: string;
}) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={{
        marginBottom: 10,
        ...(highlight
          ? {
              padding: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(239,68,68,0.35)' : 'rgba(220,38,38,0.30)',
              backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(220,38,38,0.05)',
            }
          : {}),
      }}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}
        hitSlop={4}
      >
        <View
          style={{
            width: 20, height: 20, borderRadius: 6, marginTop: 1,
            borderWidth: 1.5,
            borderColor: checked ? colors.primary : colors.textTertiary,
            backgroundColor: checked ? colors.primary : 'transparent',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          {checked && <Ionicons name="checkmark" size={14} color="#FFF" />}
        </View>
        <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: colors.text }}>
          {children}
          {required ? <Text style={{ color: colors.primary, fontWeight: '700' }}> *</Text> : null}
        </Text>
      </Pressable>
      {hint ? (
        <Text style={{ marginLeft: 30, marginTop: 4, fontSize: 11, lineHeight: 15, color: colors.textSecondary }}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Consentimentos LGPD (todos começam desmarcados). */
export function ConsentCheckboxes({ value, onChange, showHealth }: Props) {
  const { colors } = useTheme();
  const toggle = (k: keyof ConsentState) => () => onChange({ ...value, [k]: !value[k] });
  const link = (url: string, label: string) => (
    <Text
      onPress={() => Linking.openURL(url).catch(() => {})}
      style={{ color: colors.primary, fontWeight: '600', textDecorationLine: 'underline' }}
      accessibilityRole="link"
    >
      {label}
    </Text>
  );

  return (
    <View>
      <Row checked={value.terms} onToggle={toggle('terms')} required>
        Li e aceito os {link(LEGAL_URLS.terms, 'Termos de Uso')} e a {link(LEGAL_URLS.privacy, 'Política de Privacidade')}
      </Row>
      {showHealth && (
        <Row
          checked={value.health}
          onToggle={toggle('health')}
          required
          highlight
          hint="Dados pessoais sensíveis — consentimento específico e destacado (LGPD art. 11, I). Você pode revogar quando quiser."
        >
          <Text style={{ fontWeight: '700' }}>Dados de saúde: </Text>
          Autorizo o tratamento dos meus dados de saúde (anamnese, frequência cardíaca, avaliações físicas) para
          acompanhamento do meu treino pela minha assessoria
        </Row>
      )}
      <Row checked={value.age} onToggle={toggle('age')} required>
        Tenho 18 anos ou mais, ou tenho autorização do meu responsável legal
      </Row>
      <Row checked={value.marketing} onToggle={toggle('marketing')}>
        Quero receber novidades, conteúdos e ofertas por e-mail (opcional)
      </Row>
      <Text style={{ fontSize: 11, color: colors.textTertiary }}>
        <Text style={{ color: colors.primary }}>*</Text> obrigatório
      </Text>
    </View>
  );
}
