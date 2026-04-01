import React, { useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, Image, Animated, Dimensions, Platform,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';

export default function LandingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const recursosY = useRef(0);
  const coachesY = useRef(0);
  const precosY = useRef(0);

  const scrollToId = (id: string) => {
    if (Platform.OS === 'web') {
      const scroller = document.querySelector('[class*="WebkitOverflowScrolling"]') as HTMLElement;
      const target = document.getElementById(id) as HTMLElement;
      if (scroller && target) {
        const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 80;
        scroller.scrollTop = top;
      }
    } else {
      const yMap: Record<string, React.MutableRefObject<number>> = {
        recursos: recursosY, coaches: coachesY, precos: precosY,
      };
      const y = yMap[id];
      if (y) scrollViewRef.current?.scrollTo({ y: Math.max(0, y.current - 80), animated: true });
    }
  };

  const isWide = width >= 768;
  const isDesktop = width >= 1024;
  const maxW = 1200;
  const px = isDesktop ? 80 : isWide ? 48 : 24;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]).start();
  }, []);

  const Section = ({ children, style }: { children: React.ReactNode; style?: any }) => (
    <View style={[{
      width: '100%', maxWidth: maxW, alignSelf: 'center',
      paddingHorizontal: px,
    }, style]}>
      {children}
    </View>
  );

  const SectionLabel = ({ text }: { text: string }) => (
    <Text style={{
      color: colors.primary,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase' as any,
      letterSpacing: 3,
      marginBottom: 14,
    }}>
      {text}
    </Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══════════════════ NAV BAR ═══════════════════ */}
        <View style={{
          width: '100%',
          borderBottomWidth: 0.5,
          borderBottomColor: colors.text + '08',
          ...(Platform.OS === 'web' ? {
            position: 'sticky' as any,
            top: 0,
            zIndex: 100,
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            backgroundColor: colors.background + 'E6',
          } as any : {}),
        }}>
          <Section style={{
            flexDirection: 'row', justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: Platform.OS === 'web' ? 16 : insets.top + 12,
            paddingBottom: 16,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 44, height: 44, borderRadius: 12, overflow: 'hidden',
                ...(Platform.OS === 'web' ? { boxShadow: '0 2px 8px rgba(220,38,38,0.25)' } as any : {
                  shadowColor: '#DC2626', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
                }),
              }}>
                <Image
                  source={require('../../assets/logo.png')}
                  style={{ width: 44, height: 44 }}
                  resizeMode="cover"
                />
              </View>
              <Text style={{
                color: colors.primary, fontSize: 20,
                fontFamily: Platform.OS === 'web' ? 'Bebas Neue' : 'System',
                fontWeight: Platform.OS === 'web' ? '400' : '800',
                letterSpacing: 1.2,
                textTransform: 'uppercase' as any,
              }}>
                Rafinha Running
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: isWide ? 32 : 16 }}>
              {isWide && (
                <>
                  <Pressable onPress={() => scrollToId('recursos')}><Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '400' }}>Recursos</Text></Pressable>
                  <Pressable onPress={() => scrollToId('coaches')}><Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '400' }}>Para Coaches</Text></Pressable>
                  <Pressable onPress={() => scrollToId('precos')}><Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '400' }}>Preços</Text></Pressable>
                </>
              )}
              <Pressable
                onPress={() => router.push('/(auth)/login')}
                style={{
                  paddingHorizontal: 22, paddingVertical: 9,
                  borderRadius: 100,
                  borderWidth: 1,
                  borderColor: colors.text + '12',
                }}
              >
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500', letterSpacing: 0.3 }}>
                  Entrar
                </Text>
              </Pressable>
            </View>
          </Section>
        </View>

        {/* ═══════════════════ HERO ═══════════════════ */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <Section style={{
            paddingTop: isDesktop ? 100 : isWide ? 72 : 52,
            paddingBottom: isDesktop ? 100 : isWide ? 72 : 56,
            ...(isDesktop ? { flexDirection: 'row', alignItems: 'center', gap: 80 } : {}),
          }}>
            <View style={{ flex: isDesktop ? 1 : undefined, maxWidth: isDesktop ? 560 : undefined }}>
              <SectionLabel text="Assessoria Digital de Alto Nível" />
              <Text style={{
                color: colors.text,
                fontSize: isDesktop ? 56 : isWide ? 44 : 36,
                fontWeight: '300',
                letterSpacing: isDesktop ? -2 : -1.2,
                lineHeight: isDesktop ? 64 : isWide ? 52 : 44,
                marginBottom: 24,
              }}>
                Transforme sua{'\n'}corrida em{' '}
                <Text style={{ fontWeight: '700', color: colors.primary }}>resultado</Text>
              </Text>
              <Text style={{
                color: colors.textSecondary,
                fontSize: isDesktop ? 18 : 16,
                lineHeight: isDesktop ? 30 : 26,
                fontWeight: '400',
                marginBottom: isWide ? 44 : 36,
                maxWidth: 440,
              }}>
                A plataforma que conecta atletas e coaches com inteligência artificial,
                dados em tempo real e treinos sob medida para sua evolução.
              </Text>

              <View style={{ flexDirection: isWide ? 'row' : 'column', gap: 12, alignItems: isWide ? 'center' : 'stretch' }}>
                <Pressable
                  onPress={() => router.push('/(auth)/register')}
                  style={({ pressed }) => ({
                    paddingVertical: 16, paddingHorizontal: 36,
                    borderRadius: 100,
                    backgroundColor: colors.primary,
                    alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'row', gap: 10,
                    opacity: pressed ? 0.85 : 1,
                    ...(Platform.OS === 'web' ? { transition: 'all 0.2s ease', cursor: 'pointer' } as any : {}),
                  })}
                >
                  <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '500', letterSpacing: 0.8 }}>
                    COMEÇAR GRATUITAMENTE
                  </Text>
                  <Ionicons name="arrow-forward-outline" size={16} color="#FFF" />
                </Pressable>
                <Pressable
                  onPress={() => router.push('/(auth)/login')}
                  style={({ pressed }) => ({
                    paddingVertical: 16, paddingHorizontal: 36,
                    borderRadius: 100,
                    borderWidth: 1,
                    borderColor: colors.text + '15',
                    alignItems: 'center', justifyContent: 'center',
                    opacity: pressed ? 0.85 : 1,
                    ...(Platform.OS === 'web' ? { transition: 'all 0.2s ease', cursor: 'pointer' } as any : {}),
                  })}
                >
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500', letterSpacing: 0.8 }}>
                    JÁ TENHO CONTA
                  </Text>
                </Pressable>
              </View>

              {/* Google quick-access */}
              <Pressable
                onPress={() => router.push('/(auth)/login')}
                style={({ pressed }) => ({
                  marginTop: 20,
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  alignSelf: isWide ? 'flex-start' : 'center',
                  paddingVertical: 11, paddingHorizontal: 20,
                  borderRadius: 100,
                  borderWidth: 1,
                  borderColor: colors.text + '10',
                  backgroundColor: colors.surface,
                  opacity: pressed ? 0.8 : 1,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <Ionicons name="logo-google" size={16} color={colors.textSecondary} />
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
                  Entrar com Google
                </Text>
              </Pressable>
            </View>

            {/* Hero Right - Premium Dashboard Mockup (desktop only) */}
            {isDesktop && (
              <View style={{ flex: 1, gap: 12 }}>
                {/* Today's Workout Card */}
                <View style={{
                  borderRadius: 20,
                  backgroundColor: colors.surface,
                  borderWidth: 0.5,
                  borderColor: colors.text + '0A',
                  padding: 20,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.06,
                  shadowRadius: 24,
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <View>
                      <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Treino de Hoje</Text>
                      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 2 }}>Corrida de Tempo 8km</Text>
                    </View>
                    <View style={{ backgroundColor: colors.primary + '12', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
                      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>HOJE</Text>
                    </View>
                  </View>
                  {/* Stats row */}
                  <View style={{ flexDirection: 'row', gap: 0 }}>
                    {[
                      { label: 'Distância', value: '8.0 km' },
                      { label: 'Pace alvo', value: '5:15 /km' },
                      { label: 'Duração', value: '42 min' },
                    ].map((s, i) => (
                      <View key={s.label} style={{
                        flex: 1,
                        paddingVertical: 12,
                        paddingHorizontal: 10,
                        borderRadius: 12,
                        backgroundColor: i === 1 ? colors.primary + '08' : colors.text + '04',
                        marginHorizontal: 3,
                        alignItems: 'center',
                      }}>
                        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', letterSpacing: -0.3 }}>{s.value}</Text>
                        <Text style={{ color: colors.textTertiary, fontSize: 10, marginTop: 3, fontWeight: '500' }}>{s.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Pace + HR Row */}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {/* Live Pace Card */}
                  <View style={{
                    flex: 1, borderRadius: 20,
                    backgroundColor: colors.primary,
                    padding: 20,
                    shadowColor: colors.primary,
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.3,
                    shadowRadius: 20,
                  }}>
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Pace médio</Text>
                    <Text style={{ color: '#FFF', fontSize: 32, fontWeight: '200', letterSpacing: -1, marginTop: 4 }}>5:18</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }}>/km • ↓ 0:12 vs meta</Text>
                    {/* Simulated sparkline */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, marginTop: 14, height: 28 }}>
                      {[60, 75, 55, 80, 65, 90, 70, 85, 72, 88].map((h, i) => (
                        <View key={i} style={{ flex: 1, height: h * 0.28, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2 }} />
                      ))}
                    </View>
                  </View>

                  {/* HR Zone Card */}
                  <View style={{
                    flex: 1, borderRadius: 20,
                    backgroundColor: colors.surface,
                    borderWidth: 0.5,
                    borderColor: colors.text + '0A',
                    padding: 20,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.04,
                    shadowRadius: 12,
                  }}>
                    <Text style={{ color: colors.textTertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>FC Atual</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                      <Text style={{ color: colors.text, fontSize: 32, fontWeight: '200', letterSpacing: -1 }}>162</Text>
                      <Text style={{ color: colors.textTertiary, fontSize: 11 }}>bpm</Text>
                    </View>
                    <View style={{ marginTop: 14, gap: 4 }}>
                      {[
                        { label: 'Z4 Limiar', pct: 62, color: colors.primary },
                        { label: 'Z3 Aeróbico', pct: 24, color: '#F59E0B' },
                        { label: 'Z2 Fácil', pct: 14, color: '#10B981' },
                      ].map((z) => (
                        <View key={z.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.text + '08', overflow: 'hidden' }}>
                            <View style={{ width: `${z.pct}%` as any, height: '100%', backgroundColor: z.color, borderRadius: 2 }} />
                          </View>
                          <Text style={{ color: colors.textTertiary, fontSize: 9, width: 28, textAlign: 'right' }}>{z.pct}%</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>

                {/* Weekly Progress */}
                <View style={{
                  borderRadius: 20,
                  backgroundColor: colors.surface,
                  borderWidth: 0.5,
                  borderColor: colors.text + '0A',
                  padding: 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <View>
                    <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Progresso Semanal</Text>
                    <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 4 }}>38.5 <Text style={{ fontSize: 14, fontWeight: '400', color: colors.textSecondary }}>/ 50 km</Text></Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View style={{ width: 120, height: 6, borderRadius: 3, backgroundColor: colors.text + '08', overflow: 'hidden' }}>
                      <View style={{ width: '77%', height: '100%', backgroundColor: colors.primary, borderRadius: 3 }} />
                    </View>
                    <Text style={{ color: colors.textTertiary, fontSize: 10 }}>77% da meta • Qua</Text>
                  </View>
                </View>
              </View>
            )}
          </Section>
        </Animated.View>

        {/* ═══════════════════ METRICS BAR ═══════════════════ */}
        <View style={{
          backgroundColor: colors.text + '03',
          borderTopWidth: 0.5,
          borderBottomWidth: 0.5,
          borderColor: colors.text + '06',
        }}>
          <Section style={{
            flexDirection: 'row',
            justifyContent: isWide ? 'center' : 'space-between',
            gap: isWide ? 80 : 0,
            paddingVertical: isWide ? 36 : 28,
          }}>
            {[
              { value: '10K+', label: 'Atletas ativos' },
              { value: '98%', label: 'Satisfação' },
              { value: '4.9', label: 'App Store' },
              ...(isWide ? [{ value: '200+', label: 'Coaches' }] : []),
            ].map((stat) => (
              <View key={stat.label} style={{ alignItems: 'center' }}>
                <Text style={{
                  color: colors.text, fontSize: isWide ? 32 : 24, fontWeight: '700',
                  letterSpacing: -0.5,
                }}>
                  {stat.value}
                </Text>
                <Text style={{
                  color: colors.textTertiary, fontSize: 12, fontWeight: '400',
                  letterSpacing: 0.5, marginTop: 4,
                }}>
                  {stat.label}
                </Text>
              </View>
            ))}
          </Section>
        </View>

        {/* ═══════════════════ RECURSOS ═══════════════════ */}
        <View nativeID="recursos" onLayout={(e) => { recursosY.current = e.nativeEvent.layout.y; }}>
        <Section style={{ paddingTop: isDesktop ? 100 : 64 }}>
          <View>

            {/* Header */}
            <View style={{ alignItems: isDesktop ? 'center' : 'flex-start', marginBottom: isDesktop ? 72 : 40 }}>
              <SectionLabel text="Recursos" />
              <Text style={{
                color: colors.text,
                fontSize: isDesktop ? 44 : 30,
                fontWeight: '300',
                letterSpacing: -1,
                lineHeight: isDesktop ? 54 : 38,
                textAlign: isDesktop ? 'center' : 'left',
                marginBottom: 16,
              }}>
                Tudo que você precisa{'\n'}para <Text style={{ fontWeight: '700' }}>correr melhor</Text>
              </Text>
              <Text style={{
                color: colors.textSecondary,
                fontSize: isDesktop ? 17 : 15,
                lineHeight: 26,
                textAlign: isDesktop ? 'center' : 'left',
                maxWidth: 520,
              }}>
                Uma plataforma completa — do treino ao resultado. Coach e atleta conectados em tempo real.
              </Text>
            </View>

            {/* Stats Strip */}
            <View style={{
              flexDirection: isWide ? 'row' : 'column',
              gap: isWide ? 0 : 0,
              borderRadius: 20,
              overflow: 'hidden',
              borderWidth: 0.5,
              borderColor: colors.text + '08',
              marginBottom: isDesktop ? 80 : 48,
            }}>
              {[
                { value: '+500', label: 'Atletas ativos', icon: 'people-outline' },
                { value: '98%', label: 'Taxa de retenção', icon: 'heart-outline' },
                { value: '12×', label: 'Mais engajamento', icon: 'trending-up-outline' },
                { value: '4.9★', label: 'Avaliação média', icon: 'star-outline' },
              ].map((s, i, arr) => (
                <View key={s.label} style={{
                  flex: isWide ? 1 : undefined,
                  paddingVertical: isWide ? 28 : 20,
                  paddingHorizontal: 24,
                  alignItems: isWide ? 'center' : 'flex-start',
                  flexDirection: isWide ? 'column' : 'row',
                  gap: isWide ? 8 : 16,
                  backgroundColor: i % 2 === 0 ? colors.text + '02' : colors.text + '03',
                  borderRightWidth: isWide && i < arr.length - 1 ? 0.5 : 0,
                  borderBottomWidth: !isWide && i < arr.length - 1 ? 0.5 : 0,
                  borderColor: colors.text + '08',
                }}>
                  <Ionicons name={s.icon as any} size={isWide ? 20 : 18} color={colors.primary} />
                  <View style={{ alignItems: isWide ? 'center' : 'flex-start' }}>
                    <Text style={{
                      fontSize: isWide ? 28 : 22, fontWeight: '800',
                      letterSpacing: -1, color: colors.text,
                    }}>{s.value}</Text>
                    <Text style={{
                      fontSize: 12, color: colors.textTertiary, fontWeight: '500',
                      textAlign: isWide ? 'center' : 'left',
                    }}>{s.label}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Feature Spotlights — alternating layout on desktop */}
            {[
              {
                label: 'Live Tracking',
                title: 'Seu coach acompanha\ncada passada ao vivo',
                desc: 'Durante o treino, o coach vê sua posição no mapa, pace instantâneo, frequência cardíaca e distância percorrida — tudo em tempo real. Sem precisar de nenhuma ação da sua parte.',
                icon: 'navigate-outline',
                color: '#10B981',
                bullets: ['Mapa ao vivo com rota', 'Pace + FC em tempo real', 'Notificação automática ao iniciar', 'Histórico com replay'],
                reverse: false,
              },
              {
                label: 'Planilha Inteligente',
                title: 'Treinos feitos\npara o seu corpo',
                desc: 'O coach cria sua planilha com base na sua frequência semanal, histórico e objetivos. Cada treino chega direto no app e sincroniza com seu relógio GPS automaticamente.',
                icon: 'clipboard-outline',
                color: colors.primary,
                bullets: ['3×, 4× ou 5× por semana', 'Sincroniza com Garmin, Strava, Apple Watch', 'Coach ajusta conforme sua evolução', 'Descrição detalhada de cada treino'],
                reverse: true,
              },
              {
                label: 'Evolução',
                title: 'Dados que provam\nseu progresso',
                desc: 'Gráficos de pace, volume semanal, zonas de FC e recordes pessoais — tudo em um painel claro. Veja exatamente o quanto você evoluiu desde o primeiro treino.',
                icon: 'bar-chart-outline',
                color: '#8B5CF6',
                bullets: ['Recordes pessoais por distância', 'Gráfico de evolução de pace', 'Volume semanal e mensal', 'Comparativo com períodos anteriores'],
                reverse: false,
              },
            ].map((feature) => (
              <View key={feature.label} style={{
                marginBottom: isDesktop ? 80 : 48,
                ...(isDesktop ? {
                  flexDirection: feature.reverse ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  gap: 72,
                } : {}),
              }}>
                {/* Visual Panel */}
                <View style={{
                  flex: isDesktop ? 1 : undefined,
                  marginBottom: isDesktop ? 0 : 28,
                  borderRadius: 24,
                  overflow: 'hidden',
                  minHeight: isDesktop ? 320 : 200,
                  backgroundColor: feature.color + '06',
                  borderWidth: 0.5,
                  borderColor: feature.color + '15',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 32,
                }}>
                  {/* Mock UI inside panel */}
                  <View style={{
                    width: isDesktop ? 220 : 180,
                    backgroundColor: colors.surface,
                    borderRadius: 20,
                    padding: 20,
                    borderWidth: 0.5,
                    borderColor: colors.text + '08',
                    ...(Platform.OS === 'web' ? {
                      boxShadow: `0 16px 48px ${feature.color}20`,
                    } as any : {}),
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                      <View style={{
                        width: 36, height: 36, borderRadius: 10,
                        backgroundColor: feature.color + '15',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ionicons name={feature.icon as any} size={18} color={feature.color} />
                      </View>
                      <View>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{feature.label}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
                          <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '600' }}>AO VIVO</Text>
                        </View>
                      </View>
                    </View>
                    {[70, 90, 55, 80].map((w, i) => (
                      <View key={i} style={{ marginBottom: 8 }}>
                        <View style={{
                          height: 7, borderRadius: 4,
                          backgroundColor: feature.color + '15',
                          width: '100%',
                        }}>
                          <View style={{
                            height: 7, borderRadius: 4,
                            backgroundColor: feature.color,
                            width: `${w}%` as any,
                          }} />
                        </View>
                      </View>
                    ))}
                    <View style={{
                      marginTop: 12, paddingTop: 12,
                      borderTopWidth: 0.5, borderColor: colors.text + '08',
                      flexDirection: 'row', justifyContent: 'space-between',
                    }}>
                      <Text style={{ fontSize: 11, color: colors.textTertiary }}>Hoje</Text>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: feature.color }}>+12%</Text>
                    </View>
                  </View>
                </View>

                {/* Text */}
                <View style={{ flex: isDesktop ? 1 : undefined }}>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16,
                  }}>
                    <View style={{
                      width: 32, height: 32, borderRadius: 9,
                      backgroundColor: feature.color + '12',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Ionicons name={feature.icon as any} size={16} color={feature.color} />
                    </View>
                    <Text style={{
                      fontSize: 11, fontWeight: '700', letterSpacing: 1.5,
                      color: feature.color, textTransform: 'uppercase' as any,
                    }}>
                      {feature.label}
                    </Text>
                  </View>

                  <Text style={{
                    color: colors.text,
                    fontSize: isDesktop ? 32 : 24,
                    fontWeight: '300',
                    letterSpacing: -0.8,
                    lineHeight: isDesktop ? 42 : 32,
                    marginBottom: 16,
                  }}>
                    {feature.title.split('\n').map((line, i) => (
                      <Text key={i}>
                        {i === 0 ? line : <Text style={{ fontWeight: '700' }}>{'\n'}{line}</Text>}
                      </Text>
                    ))}
                  </Text>

                  <Text style={{
                    color: colors.textSecondary,
                    fontSize: 15, lineHeight: 24,
                    marginBottom: 24,
                  }}>
                    {feature.desc}
                  </Text>

                  <View style={{ gap: 10 }}>
                    {feature.bullets.map((b) => (
                      <View key={b} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{
                          width: 20, height: 20, borderRadius: 10,
                          backgroundColor: feature.color + '12',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Ionicons name="checkmark" size={12} color={feature.color} />
                        </View>
                        <Text style={{ fontSize: 14, color: colors.textSecondary }}>{b}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            ))}

            {/* Feature Grid — quick overview */}
            <View style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 8,
            }}>
              {[
                { icon: 'trophy-outline', title: 'Ranking e Streak', desc: 'Compita com a comunidade e mantenha sua sequência de treinos.', color: '#F59E0B' },
                { icon: 'calendar-outline', title: 'Eventos e Provas', desc: 'Descubra corridas, inscreva-se e prepare-se com plano específico.', color: '#EC4899' },
                { icon: 'chatbubble-outline', title: 'Comunicação', desc: 'Mensagens diretas com o coach e grupo de WhatsApp exclusivo.', color: '#3B82F6' },
                { icon: 'cloud-offline-outline', title: 'Modo Offline', desc: 'Treinos disponíveis sem internet. Sync automático ao voltar online.', color: '#6B7280' },
              ].map((f) => (
                <View key={f.title} style={{
                  flex: isWide ? 1 : undefined,
                  minWidth: isWide ? 0 : '100%',
                  padding: 24,
                  borderRadius: 18,
                  backgroundColor: colors.text + '02',
                  borderWidth: 0.5,
                  borderColor: colors.text + '06',
                }}>
                  <View style={{
                    width: 40, height: 40, borderRadius: 12,
                    backgroundColor: f.color + '10',
                    alignItems: 'center', justifyContent: 'center',
                    marginBottom: 14,
                  }}>
                    <Ionicons name={f.icon as any} size={20} color={f.color} />
                  </View>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 6 }}>
                    {f.title}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
                    {f.desc}
                  </Text>
                </View>
              ))}
            </View>

          </View>
        </Section>

        {/* ═══════════════════ INTEGRATIONS ═══════════════════ */}
        <Section style={{ paddingTop: isDesktop ? 100 : 56 }}>
          <View style={{
            ...(isDesktop ? { flexDirection: 'row', alignItems: 'center', gap: 80 } : {}),
          }}>
            <View style={{ flex: isDesktop ? 1 : undefined, marginBottom: isDesktop ? 0 : 28 }}>
              <SectionLabel text="Conexões" />
              <Text style={{
                color: colors.text,
                fontSize: isDesktop ? 36 : 28,
                fontWeight: '300',
                letterSpacing: -0.8,
                lineHeight: isDesktop ? 46 : 36,
                marginBottom: 16,
              }}>
                Seu relógio,{'\n'}<Text style={{ fontWeight: '700' }}>nosso ecossistema</Text>
              </Text>
              <Text style={{
                color: colors.textSecondary, fontSize: 15, lineHeight: 24,
                maxWidth: 400,
              }}>
                Compatível com todos os principais relógios GPS do mercado.
                Sincronização automática ou via Strava.
              </Text>
            </View>
            <View style={{ flex: isDesktop ? 1 : undefined }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {[
                  { name: 'Garmin', icon: 'watch-outline' },
                  { name: 'Strava', icon: 'bicycle-outline' },
                  { name: 'Apple Watch', icon: 'logo-apple' },
                  { name: 'Coros', icon: 'fitness-outline' },
                  { name: 'Polar', icon: 'heart-outline' },
                  { name: 'Suunto', icon: 'compass-outline' },
                  { name: 'Samsung', icon: 'phone-portrait-outline' },
                  { name: 'Google Fit', icon: 'logo-google' },
                ].map((brand) => (
                  <View key={brand.name} style={{
                    paddingHorizontal: 20, paddingVertical: 14,
                    borderRadius: 14,
                    borderWidth: 0.5,
                    borderColor: colors.text + '08',
                    backgroundColor: colors.text + '02',
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                  }}>
                    <Ionicons name={brand.icon as any} size={16} color={colors.textSecondary} />
                    <Text style={{
                      color: colors.text, fontSize: 14, fontWeight: '500',
                    }}>
                      {brand.name}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </Section>

        {/* ═══════════════════ HOW IT WORKS ═══════════════════ */}
        <Section style={{ paddingTop: isDesktop ? 100 : 56 }}>
          <View style={{
            alignItems: isDesktop ? 'center' : 'flex-start',
            marginBottom: isDesktop ? 56 : 32,
          }}>
            <SectionLabel text="Como funciona" />
            <Text style={{
              color: colors.text,
              fontSize: isDesktop ? 40 : 28,
              fontWeight: '300',
              letterSpacing: -0.8,
              lineHeight: isDesktop ? 50 : 36,
              textAlign: isDesktop ? 'center' : 'left',
            }}>
              Do cadastro ao <Text style={{ fontWeight: '700' }}>pódio</Text>
            </Text>
          </View>

          <View style={{
            flexDirection: isWide ? 'row' : 'column',
            gap: isWide ? 32 : 28,
          }}>
            {[
              { n: '01', title: 'Crie sua conta', desc: 'Cadastro gratuito em segundos. E-mail ou Google.', icon: 'person-add-outline' },
              { n: '02', title: 'Conecte seu coach', desc: 'Encontre sua assessoria ou insira o código do treinador.', icon: 'people-outline' },
              { n: '03', title: 'Receba seus treinos', desc: 'Planilhas personalizadas direto no celular e relógio GPS.', icon: 'clipboard-outline' },
              { n: '04', title: 'Evolua com dados', desc: 'Acompanhe sua progressão com métricas e gráficos precisos.', icon: 'trending-up-outline' },
            ].map((item) => (
              <View key={item.n} style={{
                flex: isWide ? 1 : undefined,
                ...(isWide ? {
                  padding: 28,
                  borderRadius: 20,
                  borderWidth: 0.5,
                  borderColor: colors.text + '06',
                  backgroundColor: colors.text + '02',
                  alignItems: 'center',
                } : {
                  flexDirection: 'row', gap: 20, alignItems: 'flex-start',
                }),
              }}>
                {isWide ? (
                  <>
                    <View style={{
                      width: 56, height: 56, borderRadius: 28,
                      backgroundColor: colors.primary + '08',
                      alignItems: 'center', justifyContent: 'center',
                      marginBottom: 16,
                    }}>
                      <Ionicons name={item.icon as any} size={24} color={colors.primary} />
                    </View>
                    <Text style={{
                      color: colors.primary + '25', fontSize: 11, fontWeight: '700',
                      letterSpacing: 2, marginBottom: 8,
                    }}>
                      PASSO {item.n}
                    </Text>
                    <Text style={{
                      color: colors.text, fontSize: 17, fontWeight: '600',
                      letterSpacing: -0.2, marginBottom: 8, textAlign: 'center',
                    }}>
                      {item.title}
                    </Text>
                    <Text style={{
                      color: colors.textSecondary, fontSize: 14, lineHeight: 22,
                      textAlign: 'center',
                    }}>
                      {item.desc}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={{
                      color: colors.primary + '30', fontSize: 32, fontWeight: '800',
                      letterSpacing: -1, lineHeight: 32, minWidth: 36,
                    }}>
                      {item.n}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{
                        color: colors.text, fontSize: 17, fontWeight: '600',
                        letterSpacing: -0.2, marginBottom: 4,
                      }}>
                        {item.title}
                      </Text>
                      <Text style={{
                        color: colors.textSecondary, fontSize: 14, lineHeight: 21,
                      }}>
                        {item.desc}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            ))}
          </View>
        </Section>
        </View>

        {/* ═══════════════════ FOR COACHES ═══════════════════ */}
        <View nativeID="coaches" onLayout={(e) => { coachesY.current = e.nativeEvent.layout.y; }}>
        <Section style={{ paddingTop: isDesktop ? 120 : 64 }}>
          <View>

            {/* Header */}
            <View style={{ alignItems: isDesktop ? 'center' : 'flex-start', marginBottom: isDesktop ? 72 : 40 }}>
              <SectionLabel text="Para Coaches" />
              <Text style={{
                color: colors.text,
                fontSize: isDesktop ? 44 : 30,
                fontWeight: '300',
                letterSpacing: -1,
                lineHeight: isDesktop ? 54 : 38,
                textAlign: isDesktop ? 'center' : 'left',
                marginBottom: 16,
              }}>
                Gerencie sua assessoria{'\n'}com <Text style={{ fontWeight: '700' }}>inteligência</Text>
              </Text>
              <Text style={{
                color: colors.textSecondary,
                fontSize: isDesktop ? 17 : 15,
                lineHeight: 26,
                textAlign: isDesktop ? 'center' : 'left',
                maxWidth: 540,
              }}>
                Painel web completo para treinadores. Acompanhe cada atleta, crie planilhas,
                monitore treinos ao vivo e tenha seu app com a sua marca.
              </Text>
            </View>

            {/* Main panel — dashboard mockup + features */}
            <View style={{
              borderRadius: 28,
              overflow: 'hidden',
              borderWidth: 0.5,
              borderColor: colors.text + '08',
              backgroundColor: colors.text + '02',
              marginBottom: isDesktop ? 64 : 40,
              ...(Platform.OS === 'web' ? {
                boxShadow: '0 8px 48px rgba(0,0,0,0.06)',
              } as any : {}),
            }}>
              {/* Dashboard Header Bar */}
              <View style={{
                paddingHorizontal: 24,
                paddingVertical: 14,
                borderBottomWidth: 0.5,
                borderColor: colors.text + '06',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: colors.surface,
              }}>
                {['#FF5F57', '#FFBD2E', '#28CA41'].map(c => (
                  <View key={c} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c }} />
                ))}
                <View style={{
                  flex: 1, marginLeft: 8,
                  backgroundColor: colors.text + '06',
                  borderRadius: 6, height: 22,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 10, color: colors.textTertiary }}>dashboard.rafinharunning.com.br</Text>
                </View>
              </View>

              <View style={{
                padding: isDesktop ? 32 : 20,
                ...(isDesktop ? { flexDirection: 'row', gap: 24 } : {}),
              }}>
                {/* Left: Athlete list */}
                <View style={{ flex: isDesktop ? 1.2 : undefined, marginBottom: isDesktop ? 0 : 20 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, color: colors.textTertiary, marginBottom: 12 }}>
                    ATLETAS HOJE
                  </Text>
                  {[
                    { initials: 'JS', name: 'João Santos', status: 'Correndo agora', dot: '#10B981', pace: '5:12 /km' },
                    { initials: 'MO', name: 'Maria Oliveira', status: 'Treino concluído', dot: '#3B82F6', pace: '5:48 /km' },
                    { initials: 'PR', name: 'Pedro Ramos', status: 'Aguardando', dot: colors.textTertiary, pace: '—' },
                    { initials: 'AL', name: 'Ana Lima', status: 'Pulou o treino', dot: '#F59E0B', pace: '—' },
                  ].map((a) => (
                    <View key={a.name} style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      paddingVertical: 10, paddingHorizontal: 14,
                      borderRadius: 12, marginBottom: 6,
                      backgroundColor: colors.surface,
                      borderWidth: 0.5, borderColor: colors.text + '05',
                    }}>
                      <View style={{
                        width: 32, height: 32, borderRadius: 16,
                        backgroundColor: colors.primary + '15',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>{a.initials}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{a.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: a.dot }} />
                          <Text style={{ fontSize: 11, color: colors.textTertiary }}>{a.status}</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>{a.pace}</Text>
                    </View>
                  ))}
                </View>

                {/* Right: Stats */}
                <View style={{ flex: isDesktop ? 0.8 : undefined, gap: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, color: colors.textTertiary, marginBottom: 4 }}>
                    VISÃO GERAL
                  </Text>
                  {[
                    { label: 'Atletas ativos', value: '24', icon: 'people-outline', color: colors.primary },
                    { label: 'Adesão semanal', value: '87%', icon: 'checkmark-circle-outline', color: '#10B981' },
                    { label: 'Ao vivo agora', value: '3', icon: 'radio-outline', color: '#EF4444' },
                    { label: 'Novos este mês', value: '+5', icon: 'person-add-outline', color: '#8B5CF6' },
                  ].map((s) => (
                    <View key={s.label} style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      padding: 14, borderRadius: 12,
                      backgroundColor: colors.surface,
                      borderWidth: 0.5, borderColor: colors.text + '05',
                    }}>
                      <View style={{
                        width: 32, height: 32, borderRadius: 9,
                        backgroundColor: s.color + '12',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ionicons name={s.icon as any} size={16} color={s.color} />
                      </View>
                      <Text style={{ flex: 1, fontSize: 12, color: colors.textSecondary }}>{s.label}</Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, letterSpacing: -0.5 }}>{s.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Coach Features Grid */}
            <View style={{
              flexDirection: isWide ? 'row' : 'column',
              flexWrap: 'wrap',
              gap: 16,
              marginBottom: isDesktop ? 64 : 40,
            }}>
              {[
                {
                  icon: 'clipboard-outline', color: colors.primary,
                  title: 'Criador de Planilhas',
                  desc: 'Monte treinos semanais arrastando e soltando. Templates por tipo de treino ou gere com IA com base nos dados do atleta.',
                },
                {
                  icon: 'navigate-outline', color: '#10B981',
                  title: 'Live Tracking',
                  desc: 'Veja todos seus atletas no mapa em tempo real. Pace, FC, distância e rota — tudo ao vivo durante a corrida.',
                },
                {
                  icon: 'bar-chart-outline', color: '#8B5CF6',
                  title: 'Relatórios e Evolução',
                  desc: 'Gráficos de progressão por atleta, comparativos entre períodos e exportação de dados para PDF.',
                },
                {
                  icon: 'brush-outline', color: '#F59E0B',
                  title: 'White-label',
                  desc: 'App com o nome e a identidade visual da sua assessoria. Seus alunos, sua marca — sem mencionar a plataforma.',
                },
                {
                  icon: 'notifications-outline', color: '#EC4899',
                  title: 'Alertas Inteligentes',
                  desc: 'Notificação quando um atleta inicia o treino, conclui, pulou ou está com pace abaixo da meta.',
                },
                {
                  icon: 'card-outline', color: '#3B82F6',
                  title: 'Gestão Financeira',
                  desc: 'Controle de pagamentos, assinaturas e recibos. PIX e cartão integrados diretamente no painel.',
                },
              ].map((f) => (
                <View key={f.title} style={{
                  flex: isWide ? 1 : undefined,
                  minWidth: isWide ? (isDesktop ? 0 : '45%') : '100%',
                  maxWidth: isDesktop ? '30%' : undefined,
                  padding: 24,
                  borderRadius: 20,
                  backgroundColor: colors.surface,
                  borderWidth: 0.5,
                  borderColor: colors.text + '06',
                  ...(Platform.OS === 'web' ? {
                    boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                  } as any : {}),
                }}>
                  <View style={{
                    width: 44, height: 44, borderRadius: 12,
                    backgroundColor: f.color + '10',
                    alignItems: 'center', justifyContent: 'center',
                    marginBottom: 14,
                  }}>
                    <Ionicons name={f.icon as any} size={20} color={f.color} />
                  </View>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 6 }}>
                    {f.title}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
                    {f.desc}
                  </Text>
                </View>
              ))}
            </View>

            {/* Coach CTA */}
            <View style={{
              padding: isDesktop ? 56 : 32,
              borderRadius: 24,
              backgroundColor: colors.primary,
              ...(isDesktop ? { flexDirection: 'row', alignItems: 'center', gap: 40 } : {}),
              ...(Platform.OS === 'web' ? {
                boxShadow: '0 20px 60px rgba(220,38,38,0.20)',
              } as any : {}),
            }}>
              <View style={{ flex: isDesktop ? 1 : undefined, marginBottom: isDesktop ? 0 : 28 }}>
                <Text style={{
                  color: '#FFF', fontSize: isDesktop ? 28 : 22,
                  fontWeight: '700', letterSpacing: -0.5,
                  lineHeight: isDesktop ? 36 : 30, marginBottom: 10,
                }}>
                  Já é treinador?{'\n'}Comece a usar hoje.
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, lineHeight: 22 }}>
                  Cadastre sua assessoria gratuitamente e convide seus atletas em minutos.
                </Text>
              </View>
              <View style={{ gap: 12 }}>
                <Pressable
                  onPress={() => router.push('/(auth)/register')}
                  style={({ pressed }) => ({
                    paddingVertical: 14, paddingHorizontal: 28,
                    borderRadius: 14,
                    backgroundColor: '#FFF',
                    alignItems: 'center',
                    opacity: pressed ? 0.9 : 1,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  })}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>
                    Criar minha conta de coach
                  </Text>
                </Pressable>
                <Text style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                  Grátis para começar · Sem cartão
                </Text>
              </View>
            </View>

          </View>
        </Section>
        </View>

        {/* ═══════════════════ TESTIMONIAL ═══════════════════ */}
        <Section style={{ paddingTop: isDesktop ? 100 : 56 }}>
          <View style={{
            borderTopWidth: 0.5,
            borderColor: colors.text + '06',
            paddingTop: isDesktop ? 64 : 40,
            alignItems: isDesktop ? 'center' : 'flex-start',
          }}>
            <SectionLabel text="Depoimento" />
            <Text style={{
              color: colors.text,
              fontSize: isDesktop ? 24 : 20,
              fontWeight: '300',
              letterSpacing: -0.3,
              lineHeight: isDesktop ? 38 : 30,
              fontStyle: 'italic',
              marginBottom: 24,
              textAlign: isDesktop ? 'center' : 'left',
              maxWidth: 640,
            }}>
              "Em 6 meses baixei meu pace de 6:30 para 5:15. Os dados em tempo real
              e o acompanhamento do coach fizeram toda a diferença."
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{
                width: 44, height: 44, borderRadius: 22,
                backgroundColor: colors.primary + '10',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>MC</Text>
              </View>
              <View>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>Marina Costa</Text>
                <Text style={{ color: colors.textTertiary, fontSize: 13 }}>Atleta — São Paulo</Text>
              </View>
            </View>
          </View>
        </Section>

        {/* ═══════════════════ FINAL CTA ═══════════════════ */}
        <Section style={{
          paddingTop: isDesktop ? 100 : 56,
          paddingBottom: isDesktop ? 100 : 48,
          alignItems: 'center',
        }}>
          <Text style={{
            color: colors.text,
            fontSize: isDesktop ? 48 : 32,
            fontWeight: '300',
            letterSpacing: isDesktop ? -1.5 : -1,
            textAlign: 'center',
            lineHeight: isDesktop ? 58 : 40,
            marginBottom: 16,
          }}>
            Pronto para{'\n'}<Text style={{ fontWeight: '700' }}>transformar</Text>{'\n'}seus treinos?
          </Text>
          <Text style={{
            color: colors.textSecondary,
            fontSize: isDesktop ? 17 : 15,
            textAlign: 'center',
            marginBottom: 40,
            lineHeight: isDesktop ? 28 : 23,
            maxWidth: 340,
          }}>
            Comece gratuitamente. Sem compromisso. Evolua no seu ritmo.
          </Text>

          <View style={{
            flexDirection: isWide ? 'row' : 'column',
            gap: 12,
            width: isWide ? undefined : '100%',
            alignItems: 'center',
          }}>
            <Pressable
              onPress={() => router.push('/(auth)/register')}
              style={({ pressed }) => ({
                paddingVertical: 18, paddingHorizontal: 44,
                borderRadius: 100,
                backgroundColor: colors.primary,
                alignItems: 'center', justifyContent: 'center',
                flexDirection: 'row', gap: 10,
                opacity: pressed ? 0.85 : 1,
                ...(Platform.OS === 'web' ? { transition: 'all 0.2s ease', cursor: 'pointer' } as any : {}),
              })}
            >
              <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '500', letterSpacing: 0.8 }}>
                CRIAR MINHA CONTA
              </Text>
              <Ionicons name="arrow-forward-outline" size={16} color="#FFF" />
            </Pressable>
          </View>

          <Pressable
            onPress={() => router.push('/(auth)/login')}
            style={{ marginTop: 24 }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 13, letterSpacing: 0.5 }}>
              Já tem conta? <Text style={{ color: colors.text, fontWeight: '500' }}>Entrar</Text>
            </Text>
          </Pressable>
        </Section>

        {/* ═══════════════════ PREÇOS ═══════════════════ */}
        <View nativeID="precos" onLayout={(e) => { precosY.current = e.nativeEvent.layout.y; }}>
        <Section style={{ paddingTop: isDesktop ? 100 : 56, paddingBottom: isDesktop ? 80 : 48 }}>
          <View>
            <View style={{ alignItems: isDesktop ? 'center' : 'flex-start', marginBottom: isDesktop ? 56 : 36 }}>
              <SectionLabel text="Planos" />
              <Text style={{
                color: colors.text,
                fontSize: isDesktop ? 40 : 28,
                fontWeight: '300',
                letterSpacing: -0.8,
                lineHeight: isDesktop ? 50 : 36,
                marginBottom: 12,
                textAlign: isDesktop ? 'center' : 'left',
              }}>
                Escolha o seu <Text style={{ fontWeight: '700' }}>nível de suporte</Text>
              </Text>
              <Text style={{
                color: colors.textSecondary,
                fontSize: isDesktop ? 17 : 15,
                lineHeight: 26,
                textAlign: isDesktop ? 'center' : 'left',
                maxWidth: 520,
              }}>
                Todos os treinos integrados à plataforma e enviados direto ao coach.
              </Text>
            </View>

            <View style={{
              flexDirection: isDesktop ? 'row' : 'column',
              gap: 20,
              alignItems: isDesktop ? 'stretch' : undefined,
            }}>
              {/* ── Card 1: Planilha ── */}
              {(() => {
                const isHighlight = false;
                return (
                  <View style={{
                    flex: isDesktop ? 1 : undefined,
                    borderRadius: 24,
                    padding: isDesktop ? 36 : 28,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.text + '08',
                    ...(Platform.OS === 'web' ? {
                      boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                    } as any : {}),
                  }}>
                    <View style={{
                      width: 44, height: 44, borderRadius: 12,
                      backgroundColor: colors.primary + '12',
                      alignItems: 'center', justifyContent: 'center',
                      marginBottom: 20,
                    }}>
                      <Ionicons name="document-text-outline" size={22} color={colors.primary} />
                    </View>

                    <Text style={{
                      fontSize: 11, fontWeight: '700', letterSpacing: 1.2,
                      color: colors.textTertiary, textTransform: 'uppercase' as any,
                      marginBottom: 6,
                    }}>
                      Planilha
                    </Text>
                    <Text style={{
                      fontSize: 20, fontWeight: '700',
                      color: colors.text, marginBottom: 4,
                    }}>
                      Treino no seu ritmo
                    </Text>
                    <Text style={{
                      fontSize: 13, color: colors.textTertiary,
                      marginBottom: 24, lineHeight: 20,
                    }}>
                      Planilha personalizada criada pelo coach com base na sua frequência semanal.
                    </Text>

                    <View style={{ gap: 11, marginBottom: 28 }}>
                      {[
                        'Planilha personalizada pelo coach',
                        'Escolha sua frequência: 3×, 4× ou 5×/semana',
                        'Treinos integrados à plataforma',
                        'Sync automático com relógio',
                        'Acompanhamento via app',
                      ].map((f) => (
                        <View key={f} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                          <View style={{
                            width: 18, height: 18, borderRadius: 9, marginTop: 1,
                            backgroundColor: colors.primary + '15',
                            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <Ionicons name="checkmark" size={11} color={colors.primary} />
                          </View>
                          <Text style={{ fontSize: 14, color: colors.textSecondary, flex: 1, lineHeight: 20 }}>
                            {f}
                          </Text>
                        </View>
                      ))}
                    </View>

                    <Pressable
                      onPress={() => router.push('/(auth)/register')}
                      style={({ pressed }) => ({
                        paddingVertical: 14,
                        borderRadius: 14,
                        borderWidth: 1.5,
                        borderColor: colors.primary,
                        alignItems: 'center',
                        opacity: pressed ? 0.8 : 1,
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      })}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary, letterSpacing: 0.3 }}>
                        Começar agora
                      </Text>
                    </Pressable>
                  </View>
                );
              })()}

              {/* ── Card 2: Grupo (highlight) ── */}
              {(() => {
                return (
                  <View style={{
                    flex: isDesktop ? 1 : undefined,
                    borderRadius: 24,
                    padding: isDesktop ? 36 : 28,
                    backgroundColor: colors.primary,
                    borderWidth: 0,
                    ...(Platform.OS === 'web' ? {
                      boxShadow: '0 24px 60px rgba(220,38,38,0.30)',
                    } as any : {}),
                  }}>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center',
                      justifyContent: 'space-between', marginBottom: 20,
                    }}>
                      <View style={{
                        width: 44, height: 44, borderRadius: 12,
                        backgroundColor: 'rgba(255,255,255,0.15)',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ionicons name="people-outline" size={22} color="#FFF" />
                      </View>
                      <View style={{
                        paddingHorizontal: 10, paddingVertical: 4,
                        borderRadius: 100,
                        backgroundColor: 'rgba(255,255,255,0.22)',
                      }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: '#FFF' }}>
                          MAIS POPULAR
                        </Text>
                      </View>
                    </View>

                    <Text style={{
                      fontSize: 11, fontWeight: '700', letterSpacing: 1.2,
                      color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' as any,
                      marginBottom: 6,
                    }}>
                      Grupo
                    </Text>
                    <Text style={{
                      fontSize: 20, fontWeight: '700',
                      color: '#FFF', marginBottom: 4,
                    }}>
                      Treino em comunidade
                    </Text>
                    <Text style={{
                      fontSize: 13, color: 'rgba(255,255,255,0.65)',
                      marginBottom: 24, lineHeight: 20,
                    }}>
                      Toda terça 6h–8h na pista com o coach. Grupo exclusivo no WhatsApp.
                    </Text>

                    <View style={{ gap: 11, marginBottom: 28 }}>
                      {[
                        'Tudo da Planilha',
                        'Grupo exclusivo no WhatsApp',
                        'Terças 6h–8h na pista com o coach',
                        'Coach marcando tempo ao vivo',
                        'Treinos ao ar livre e academia',
                        'Dados enviados direto ao coach',
                      ].map((f) => (
                        <View key={f} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                          <View style={{
                            width: 18, height: 18, borderRadius: 9, marginTop: 1,
                            backgroundColor: 'rgba(255,255,255,0.2)',
                            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <Ionicons name="checkmark" size={11} color="#FFF" />
                          </View>
                          <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', flex: 1, lineHeight: 20 }}>
                            {f}
                          </Text>
                        </View>
                      ))}
                    </View>

                    <Pressable
                      onPress={() => router.push('/(auth)/register')}
                      style={({ pressed }) => ({
                        paddingVertical: 14,
                        borderRadius: 14,
                        backgroundColor: '#FFF',
                        alignItems: 'center',
                        opacity: pressed ? 0.9 : 1,
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      })}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary, letterSpacing: 0.3 }}>
                        Entrar no grupo
                      </Text>
                    </Pressable>
                  </View>
                );
              })()}

              {/* ── Card 3: Coach 1:1 ── */}
              {(() => {
                return (
                  <View style={{
                    flex: isDesktop ? 1 : undefined,
                    borderRadius: 24,
                    padding: isDesktop ? 36 : 28,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.text + '08',
                    ...(Platform.OS === 'web' ? {
                      boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
                    } as any : {}),
                  }}>
                    <View style={{
                      width: 44, height: 44, borderRadius: 12,
                      backgroundColor: colors.primary + '12',
                      alignItems: 'center', justifyContent: 'center',
                      marginBottom: 20,
                    }}>
                      <Ionicons name="fitness-outline" size={22} color={colors.primary} />
                    </View>

                    <Text style={{
                      fontSize: 11, fontWeight: '700', letterSpacing: 1.2,
                      color: colors.textTertiary, textTransform: 'uppercase' as any,
                      marginBottom: 6,
                    }}>
                      Coach 1:1
                    </Text>
                    <Text style={{
                      fontSize: 20, fontWeight: '700',
                      color: colors.text, marginBottom: 4,
                    }}>
                      Acompanhamento total
                    </Text>
                    <Text style={{
                      fontSize: 13, color: colors.textTertiary,
                      marginBottom: 24, lineHeight: 20,
                    }}>
                      Coach 100% dedicado a você. Análise e ajustes em cada treino.
                    </Text>

                    <View style={{ gap: 11, marginBottom: 28 }}>
                      {[
                        'Tudo do Grupo',
                        'Coach dedicado exclusivamente',
                        'Ajustes em tempo real no treino',
                        'Live tracking em cada sessão',
                        'Análise semanal personalizada',
                        'Contato direto com o coach',
                      ].map((f) => (
                        <View key={f} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                          <View style={{
                            width: 18, height: 18, borderRadius: 9, marginTop: 1,
                            backgroundColor: colors.primary + '15',
                            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <Ionicons name="checkmark" size={11} color={colors.primary} />
                          </View>
                          <Text style={{ fontSize: 14, color: colors.textSecondary, flex: 1, lineHeight: 20 }}>
                            {f}
                          </Text>
                        </View>
                      ))}
                    </View>

                    <Pressable
                      onPress={() => router.push('/(auth)/register')}
                      style={({ pressed }) => ({
                        paddingVertical: 14,
                        borderRadius: 14,
                        backgroundColor: colors.primary,
                        alignItems: 'center',
                        opacity: pressed ? 0.85 : 1,
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      })}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF', letterSpacing: 0.3 }}>
                        Falar com o coach
                      </Text>
                    </Pressable>
                  </View>
                );
              })()}
            </View>

            <Text style={{
              textAlign: 'center',
              color: colors.textTertiary,
              fontSize: 13,
              marginTop: 28,
            }}>
              Todos os planos incluem sync com relógio GPS · Cancele quando quiser
            </Text>
          </View>
        </Section>
        </View>

        {/* ═══════════════════ FOOTER ═══════════════════ */}
        <View style={{
          borderTopWidth: 0.5,
          borderColor: colors.text + '06',
        }}>
          <Section style={{
            paddingVertical: isDesktop ? 48 : 32,
            ...(isDesktop ? {
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            } : {
              alignItems: 'center',
            }),
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: isDesktop ? 0 : 12 }}>
              <View style={{ width: 30, height: 30, borderRadius: 8, overflow: 'hidden' }}>
                <Image
                  source={require('../../assets/logo.png')}
                  style={{ width: 30, height: 30 }}
                  resizeMode="cover"
                />
              </View>
              <Text style={{
                color: colors.primary, fontSize: 16,
                fontFamily: Platform.OS === 'web' ? 'Bebas Neue' : 'System',
                fontWeight: Platform.OS === 'web' ? '400' : '700',
                letterSpacing: 1, textTransform: 'uppercase' as any,
              }}>
                Rafinha Running
              </Text>
            </View>
            <Text style={{ color: colors.textTertiary, fontSize: 11, letterSpacing: 0.3 }}>
              © {new Date().getFullYear()} Rafinha Running · Todos os direitos reservados
            </Text>
          </Section>
        </View>
      </ScrollView>
    </View>
  );
}
