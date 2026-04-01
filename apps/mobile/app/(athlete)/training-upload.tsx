import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, SafeAreaView, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Animated, Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { GlassCard, GlassButton, GlassBadge, StatCard } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/auth.store';
import { api } from '../../src/services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface TrainingSheet {
  id: string;
  name: string;
  description: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  uploadedBy: {
    id: string;
    name: string;
    role: string;
  };
  status: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'ARCHIVED';
  weekStart: string;
  weekEnd: string;
  createdAt: string;
}

export default function TrainingUploadScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuthStore();
  const [sheets, setSheets] = useState<TrainingSheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'received' | 'upload'>('received');
  const [dragActive, setDragActive] = useState(false);
  const pulseAnim = useState(new Animated.Value(1))[0];

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const fetchSheets = useCallback(async () => {
    try {
      const res = await api.get('/training-plans');
      const plans = res.data || [];
      const transformed: TrainingSheet[] = plans.map((plan: any) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description || 'Plano de treino personalizado',
        fileUrl: '',
        fileType: 'plan',
        fileSize: 0,
        uploadedBy: plan.coach || { id: '', name: 'Treinador', role: 'COACH' },
        status: plan.status === 'ACTIVE' ? 'ACTIVE' : plan.status === 'COMPLETED' ? 'ARCHIVED' : 'PENDING',
        weekStart: plan.startDate,
        weekEnd: plan.endDate,
        createdAt: plan.createdAt,
      }));
      setSheets(transformed);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSheets(); }, [fetchSheets]);

  const handleFileUpload = async () => {
    setUploading(true);
    try {
      Alert.alert(
        'Upload de Planilha',
        'Selecione o formato do arquivo de treino:',
        [
          { text: 'Planilha Excel (.xlsx)', onPress: () => simulateUpload('xlsx') },
          { text: 'Planilha Google Sheets', onPress: () => simulateUpload('gsheets') },
          { text: 'PDF', onPress: () => simulateUpload('pdf') },
          { text: 'Cancelar', style: 'cancel', onPress: () => setUploading(false) },
        ],
      );
    } catch {
      setUploading(false);
    }
  };

  const simulateUpload = async (_type: string) => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      Alert.alert(
        'Sucesso!',
        'Planilha de treino enviada com sucesso! Seu treinador sera notificado.',
        [{ text: 'OK' }],
      );
      fetchSheets();
    } catch {
      Alert.alert('Erro', 'Falha ao enviar planilha');
    } finally {
      setUploading(false);
    }
  };

  const handleShareSheet = (sheet: TrainingSheet) => {
    Alert.alert(
      'Enviar Planilha',
      `Enviar "${sheet.name}" para:`,
      [
        { text: 'Treinador via Chat', onPress: () => handleSendToChat(sheet) },
        { text: 'Exportar PDF', onPress: () => handleExportPDF(sheet) },
        { text: 'Compartilhar', onPress: () => handleNativeShare(sheet) },
        { text: 'Cancelar', style: 'cancel' },
      ],
    );
  };

  const handleSendToChat = async (_sheet: TrainingSheet) => {
    Alert.alert('Enviado!', 'Planilha enviada ao treinador via chat.');
  };

  const handleExportPDF = async (_sheet: TrainingSheet) => {
    Alert.alert('Exportando', 'PDF da planilha sera gerado e baixado em instantes.');
  };

  const handleNativeShare = async (_sheet: TrainingSheet) => {
    Alert.alert('Compartilhar', 'Compartilhamento nativo sera aberto.');
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getStatusBadgeVariant = (status: string): 'success' | 'warning' | 'info' | 'default' => {
    const map: Record<string, 'success' | 'warning' | 'info' | 'default'> = {
      ACTIVE: 'success',
      PENDING: 'warning',
      APPROVED: 'info',
      ARCHIVED: 'default',
    };
    return map[status] || 'default';
  };

  const getStatusLabel = (status: string): string => {
    const map: Record<string, string> = {
      ACTIVE: 'Ativa',
      PENDING: 'Pendente',
      APPROVED: 'Aprovada',
      ARCHIVED: 'Arquivada',
    };
    return map[status] || status;
  };

  const getStatusIcon = (status: string) => {
    const map: Record<string, keyof typeof Ionicons.glyphMap> = {
      ACTIVE: 'flash-outline',
      PENDING: 'time-outline',
      APPROVED: 'checkmark-circle-outline',
      ARCHIVED: 'archive-outline',
    };
    return map[status] || 'document-outline';
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      ACTIVE: colors.success,
      PENDING: colors.warning,
      APPROVED: colors.info,
      ARCHIVED: colors.textTertiary,
    };
    return map[status] || colors.textTertiary;
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 12 }}>
            Carregando planilhas...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
          Planilha de Treino
        </Text>
        <TouchableOpacity
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="help-circle-outline" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Tab Selector */}
      <View style={{
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}>
        <TouchableOpacity
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 10,
            borderRadius: 14,
            backgroundColor: activeTab === 'received' ? colors.glass : 'transparent',
            borderWidth: 1,
            borderColor: activeTab === 'received' ? colors.glassBorder : colors.divider,
          }}
          onPress={() => setActiveTab('received')}
        >
          <Ionicons
            name="folder-outline"
            size={18}
            color={activeTab === 'received' ? colors.primary : colors.textTertiary}
          />
          <Text style={{
            fontSize: 14,
            fontWeight: '600',
            color: activeTab === 'received' ? colors.primary : colors.textTertiary,
          }}>
            Recebidas
          </Text>
          {sheets.length > 0 && (
            <View style={{
              backgroundColor: colors.primary,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 4,
            }}>
              <Text style={{ color: colors.textOnPrimary, fontSize: 10, fontWeight: '700' }}>
                {sheets.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 10,
            borderRadius: 14,
            backgroundColor: activeTab === 'upload' ? colors.glass : 'transparent',
            borderWidth: 1,
            borderColor: activeTab === 'upload' ? colors.glassBorder : colors.divider,
          }}
          onPress={() => setActiveTab('upload')}
        >
          <Ionicons
            name="cloud-upload-outline"
            size={18}
            color={activeTab === 'upload' ? colors.primary : colors.textTertiary}
          />
          <Text style={{
            fontSize: 14,
            fontWeight: '600',
            color: activeTab === 'upload' ? colors.primary : colors.textTertiary,
          }}>
            Enviar
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'received' ? (
          <>
            {/* Stats Row */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
              <StatCard
                icon={<Ionicons name="flash" size={20} color={colors.success} />}
                value={sheets.filter((s) => s.status === 'ACTIVE').length}
                label="Ativas"
                compact
                style={{ flex: 1 }}
              />
              <StatCard
                icon={<Ionicons name="time" size={20} color={colors.warning} />}
                value={sheets.filter((s) => s.status === 'PENDING').length}
                label="Pendentes"
                compact
                style={{ flex: 1 }}
              />
              <StatCard
                icon={<Ionicons name="archive" size={20} color={colors.textTertiary} />}
                value={sheets.filter((s) => s.status === 'ARCHIVED').length}
                label="Arquivadas"
                compact
                style={{ flex: 1 }}
              />
            </View>

            {/* Sheet Cards */}
            {sheets.length > 0 ? (
              sheets.map((sheet) => {
                const statusColor = getStatusColor(sheet.status);

                return (
                  <View key={sheet.id} style={{ marginBottom: 14 }}>
                    <GlassCard intensity="medium" shadow="md">
                      {/* Sheet Header */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{
                          width: 48,
                          height: 48,
                          borderRadius: 14,
                          backgroundColor: statusColor + '15',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <Ionicons name="document-text" size={24} color={statusColor} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{ fontSize: 15, fontWeight: '600', color: colors.text }}
                            numberOfLines={1}
                          >
                            {sheet.name}
                          </Text>
                          <Text
                            style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}
                            numberOfLines={1}
                          >
                            {sheet.description}
                          </Text>
                        </View>
                        <GlassBadge
                          label={getStatusLabel(sheet.status)}
                          variant={getStatusBadgeVariant(sheet.status)}
                          icon={<Ionicons name={getStatusIcon(sheet.status)} size={10} color={statusColor} />}
                          size="sm"
                        />
                      </View>

                      {/* Meta */}
                      <View style={{
                        flexDirection: 'row',
                        gap: 16,
                        marginTop: 14,
                        paddingTop: 14,
                        borderTopWidth: 1,
                        borderTopColor: colors.divider,
                      }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="calendar-outline" size={14} color={colors.textTertiary} />
                          <Text style={{ fontSize: 12, color: colors.textTertiary }}>
                            {formatDate(sheet.weekStart)} - {formatDate(sheet.weekEnd)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="person-outline" size={14} color={colors.textTertiary} />
                          <Text style={{ fontSize: 12, color: colors.textTertiary }}>
                            {sheet.uploadedBy?.name || 'Treinador'}
                          </Text>
                        </View>
                      </View>

                      {/* Actions */}
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                        <TouchableOpacity
                          style={{
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            paddingVertical: 10,
                            borderRadius: 10,
                            backgroundColor: colors.glass,
                            borderWidth: 1,
                            borderColor: colors.glassBorder,
                          }}
                          onPress={() => handleShareSheet(sheet)}
                        >
                          <Ionicons name="share-outline" size={16} color={colors.primary} />
                          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>
                            Enviar
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            paddingVertical: 10,
                            borderRadius: 10,
                            backgroundColor: colors.glass,
                            borderWidth: 1,
                            borderColor: colors.glassBorder,
                          }}
                        >
                          <Ionicons name="eye-outline" size={16} color={colors.info} />
                          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.info }}>
                            Visualizar
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            paddingVertical: 10,
                            borderRadius: 10,
                            backgroundColor: colors.glass,
                            borderWidth: 1,
                            borderColor: colors.glassBorder,
                          }}
                        >
                          <Ionicons name="download-outline" size={16} color={colors.success} />
                          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.success }}>
                            Baixar
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </GlassCard>
                  </View>
                );
              })
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 64 }}>
                <View style={{
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  backgroundColor: colors.glass,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 20,
                }}>
                  <Ionicons name="document-text-outline" size={48} color={colors.textTertiary} />
                </View>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
                  Nenhuma planilha
                </Text>
                <Text style={{
                  fontSize: 15,
                  color: colors.textSecondary,
                  textAlign: 'center',
                  maxWidth: 300,
                  lineHeight: 22,
                }}>
                  Seu treinador ainda nao enviou planilhas de treino. Voce tambem pode enviar suas proprias planilhas na aba "Enviar".
                </Text>
              </View>
            )}
          </>
        ) : (
          <>
            {/* Upload Zone */}
            <Animated.View style={{ marginBottom: 24, transform: [{ scale: dragActive ? pulseAnim : 1 }] }}>
              <GlassCard intensity="subtle" shadow="md">
                <TouchableOpacity
                  style={{
                    borderWidth: 2.5,
                    borderStyle: 'dashed',
                    borderColor: colors.glassBorder,
                    borderRadius: 18,
                    padding: 32,
                    alignItems: 'center',
                  }}
                  onPress={handleFileUpload}
                  disabled={uploading}
                  activeOpacity={0.8}
                >
                  {uploading ? (
                    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                      <ActivityIndicator size="large" color={colors.primary} />
                      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.primary }}>
                        Enviando planilha...
                      </Text>
                      <View style={{
                        width: 200,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: colors.divider,
                        overflow: 'hidden',
                      }}>
                        <View style={{
                          width: '60%',
                          height: '100%',
                          borderRadius: 3,
                          backgroundColor: colors.primary,
                        }} />
                      </View>
                    </View>
                  ) : (
                    <>
                      <View style={{
                        width: 80,
                        height: 80,
                        borderRadius: 40,
                        backgroundColor: colors.primaryFaded,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 14,
                      }}>
                        <Ionicons name="cloud-upload" size={40} color={colors.primary} />
                      </View>
                      <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
                        Enviar Planilha de Treino
                      </Text>
                      <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>
                        Toque para selecionar ou arraste o arquivo aqui
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                        <GlassBadge
                          label=".xlsx"
                          variant="success"
                          icon={<Ionicons name="document" size={10} color={colors.success} />}
                          size="sm"
                        />
                        <GlassBadge
                          label=".csv"
                          variant="info"
                          icon={<Ionicons name="document" size={10} color={colors.info} />}
                          size="sm"
                        />
                        <GlassBadge
                          label=".pdf"
                          variant="error"
                          icon={<Ionicons name="document" size={10} color={colors.error} />}
                          size="sm"
                        />
                        <GlassBadge
                          label="Sheets"
                          variant="warning"
                          icon={<Ionicons name="logo-google" size={10} color={colors.warning} />}
                          size="sm"
                        />
                      </View>
                    </>
                  )}
                </TouchableOpacity>
              </GlassCard>
            </Animated.View>

            {/* Quick Actions */}
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 12 }}>
              Acoes Rapidas
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
              {[
                { icon: 'document-text' as const, label: 'Upload Excel', desc: 'Importe planilha .xlsx', iconColor: colors.success, bg: colors.success + '15' },
                { icon: 'link' as const, label: 'Google Sheets', desc: 'Cole o link da planilha', iconColor: colors.info, bg: colors.info + '15' },
                { icon: 'camera' as const, label: 'Foto da Planilha', desc: 'Tire foto e envie', iconColor: colors.primary, bg: colors.primaryFaded },
                { icon: 'create' as const, label: 'Criar Manual', desc: 'Monte sua planilha', iconColor: colors.warning, bg: colors.warning + '15' },
              ].map((action, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={{ width: (SCREEN_WIDTH - 42) / 2 }}
                  onPress={handleFileUpload}
                  activeOpacity={0.8}
                >
                  <GlassCard intensity="subtle" shadow="sm" padding={16}>
                    <View style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      backgroundColor: action.bg,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 10,
                    }}>
                      <Ionicons name={action.icon} size={24} color={action.iconColor} />
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
                      {action.label}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                      {action.desc}
                    </Text>
                  </GlassCard>
                </TouchableOpacity>
              ))}
            </View>

            {/* How it works */}
            <GlassCard intensity="subtle" shadow="sm">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Ionicons name="bulb-outline" size={20} color={colors.warning} />
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
                  Como funciona?
                </Text>
              </View>

              {[
                { num: '1', color: colors.primary, title: 'Envie sua planilha', desc: 'Faca upload do arquivo Excel, PDF ou compartilhe o link do Google Sheets' },
                { num: '2', color: colors.info, title: 'Treinador analisa', desc: 'Seu treinador revisa e adapta o plano para suas necessidades' },
                { num: '3', color: colors.success, title: 'Treinos no relogio', desc: 'Os treinos sao enviados direto para o Garmin Connect do seu relogio' },
              ].map((step, idx) => (
                <View key={idx}>
                  {idx > 0 && (
                    <View style={{
                      width: 2,
                      height: 20,
                      backgroundColor: colors.divider,
                      marginLeft: 13,
                      marginVertical: 4,
                    }} />
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                    <View style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: step.color,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Text style={{ color: colors.textOnPrimary, fontWeight: '700', fontSize: 13 }}>
                        {step.num}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
                        {step.title}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 18 }}>
                        {step.desc}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </GlassCard>
          </>
        )}

        <View style={{ height: 64 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
