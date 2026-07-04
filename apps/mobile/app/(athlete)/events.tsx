import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Platform, Modal, ActivityIndicator, Alert, RefreshControl, Linking, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { api } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/auth.store';

type MainTab = 'eventos' | 'loja';
type RegStep = 'distance' | 'kit' | 'review' | 'done';

// ─── API types ────────────────────────────────────────────────────────────────

interface ApiEvent {
  id: string;
  title: string;
  description?: string | null;
  eventDate: string;
  location?: string | null;
  city?: string | null;
  state?: string | null;
  modality?: string | null;
  maxParticipants?: number | null;
  price: number; // cents
  status: string;
  tags: string[];
  kitDescription?: string | null;
  kitCompletePrice?: number | null;
  kitPremiumPrice?: number | null;
  kitPickupLocation?: string | null;
  kitPickupDate?: string | null;
  registrationCount?: number;
  coverImageUrl?: string | null;
}

interface ApiDistance {
  id: string;
  name: string;
  distanceKm?: number | null;
  price: number; // cents; 0 = inherits event price
  maxParticipants?: number | null;
  registeredCount: number;
  description?: string | null;
  ageGroup?: string | null;
  isActive: boolean;
}

interface ApiRegistration {
  id: string;
  eventId: string;
  status: string;
  bibNumber?: string | null;
  shirtSize?: string | null;
  kitType?: string | null;
  kitPickupScheduledAt?: string | null;
  event?: ApiEvent;
}

interface ApiProduct {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  priceInCents: number;
  originalPriceInCents?: number;
  finalPriceInCents?: number;
  hasAthleteDiscount?: boolean;
  images: string[];
  sizes: string[];
  colors: string[];
  totalStock: number;
  reserved: number;
  featured: boolean;
  athleteDiscountPercent: number;
}

interface ApiPartner {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  emoji?: string | null;
  color?: string | null;
  linkUrl?: string | null;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const GRADIENTS: [string, string][] = [
  ['#DC2626', '#7F1D1D'],
  ['#F59E0B', '#B45309'],
  ['#8B5CF6', '#5B21B6'],
  ['#3B82F6', '#1D4ED8'],
];

const SHIRT_SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XGG'];

const CATEGORY_EMOJI: Record<string, string> = {
  CAMISA: '👕', CASACO: '🧥', CORTA_VENTO: '🧥', VISEIRA: '🧢', BONE: '🧢', MEIA: '🧦', CALCA: '🩳', SHORTS: '🩳', ACESSORIO: '🎽', OUTRO: '🛍️',
};

function formatPrice(cents?: number | null): string {
  if (!cents || cents <= 0) return 'Gratuito';
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatTime(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + 'h';
}

function isExternal(e: ApiEvent): boolean {
  return e.tags?.some((t) => t.toLowerCase() === 'externa' || t.toLowerCase() === 'external');
}

// ─── Registration Modal (real: POST /events/:id/register) ─────────────────────

function RegistrationModal({ event, visible, onClose, onRegistered }: {
  event: ApiEvent | null;
  visible: boolean;
  onClose: () => void;
  onRegistered: () => void;
}) {
  const { colors } = useTheme();
  const [step, setStep] = useState<RegStep>('distance');
  const [distances, setDistances] = useState<ApiDistance[]>([]);
  const [loadingDistances, setLoadingDistances] = useState(false);
  const [selectedDistance, setSelectedDistance] = useState<ApiDistance | null>(null);
  const [selectedShirtSize, setSelectedShirtSize] = useState('');
  const [selectedKit, setSelectedKit] = useState<'COMPLETO' | 'PREMIUM' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [registration, setRegistration] = useState<ApiRegistration | null>(null);

  useEffect(() => {
    if (visible && event) {
      setStep('distance');
      setSelectedDistance(null);
      setSelectedShirtSize('');
      setSelectedKit(null);
      setError('');
      setRegistration(null);
      setLoadingDistances(true);
      api.get(`/events/${event.id}/distances`)
        .then(({ data }) => setDistances((Array.isArray(data) ? data : []).filter((d: ApiDistance) => d.isActive)))
        .catch(() => setDistances([]))
        .finally(() => setLoadingDistances(false));
    }
  }, [visible, event?.id]);

  if (!event) return null;

  const hasKitOptions = !!(event.kitCompletePrice || event.kitPremiumPrice);
  const basePrice = selectedDistance && selectedDistance.price > 0 ? selectedDistance.price : event.price;
  const kitPrice = selectedKit === 'PREMIUM' ? (event.kitPremiumPrice ?? 0) : selectedKit === 'COMPLETO' ? (event.kitCompletePrice ?? 0) : 0;

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post(`/events/${event.id}/register`, {
        distanceId: selectedDistance?.id,
        shirtSize: selectedShirtSize || undefined,
        kitType: selectedKit ?? undefined,
      });
      setRegistration(data);
      setStep('done');
      onRegistered();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Não foi possível concluir a inscrição. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const STEPS: RegStep[] = ['distance', 'kit', 'review', 'done'];
  const stepIdx = STEPS.indexOf(step);

  const canProceedDistance = (distances.length === 0 || !!selectedDistance) && !!selectedShirtSize;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%', paddingBottom: 28 }}>
          {/* Header */}
          <View style={{ padding: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }} numberOfLines={1}>{event.title}</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{formatDate(event.eventDate)}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={{ padding: 6 }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Progress */}
          {step !== 'done' && (
            <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginBottom: 10 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= stepIdx ? colors.primary : colors.text + '15' }} />
              ))}
            </View>
          )}

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            {step === 'distance' && (
              <>
                {loadingDistances ? (
                  <ActivityIndicator style={{ marginVertical: 30 }} color={colors.primary} />
                ) : (
                  <>
                    {distances.length > 0 && (
                      <>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 10 }}>Escolha o percurso</Text>
                        {distances.map((d) => {
                          const soldOut = d.maxParticipants != null && d.registeredCount >= d.maxParticipants;
                          const selected = selectedDistance?.id === d.id;
                          return (
                            <Pressable
                              key={d.id}
                              disabled={soldOut}
                              onPress={() => setSelectedDistance(d)}
                              style={{
                                borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1.5, opacity: soldOut ? 0.5 : 1,
                                borderColor: selected ? colors.primary : colors.text + '15',
                                backgroundColor: selected ? colors.primary + '10' : 'transparent',
                                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                              }}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{d.name}</Text>
                                {(d.description || d.ageGroup) && (
                                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{d.description || d.ageGroup}</Text>
                                )}
                              </View>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: selected ? colors.primary : colors.textSecondary }}>
                                {soldOut ? 'Esgotado' : formatPrice(d.price > 0 ? d.price : event.price)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </>
                    )}

                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginTop: distances.length ? 14 : 0, marginBottom: 10 }}>Tamanho da camiseta</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {SHIRT_SIZES.map((s) => {
                        const selected = selectedShirtSize === s;
                        return (
                          <Pressable
                            key={s}
                            onPress={() => setSelectedShirtSize(s)}
                            style={{
                              paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5,
                              borderColor: selected ? colors.primary : colors.text + '15',
                              backgroundColor: selected ? colors.primary + '10' : 'transparent',
                            }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: '700', color: selected ? colors.primary : colors.textSecondary }}>{s}</Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <Pressable
                      disabled={!canProceedDistance}
                      onPress={() => setStep(hasKitOptions ? 'kit' : 'review')}
                      style={{ marginTop: 20, borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: canProceedDistance ? colors.primary : colors.text + '20' }}
                    >
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>Continuar</Text>
                    </Pressable>
                  </>
                )}
              </>
            )}

            {step === 'kit' && (
              <>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 10 }}>Kit do atleta</Text>
                {event.kitDescription && (
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12 }}>{event.kitDescription}</Text>
                )}
                {([
                  event.kitCompletePrice != null ? { key: 'COMPLETO' as const, label: 'Kit Completo', price: event.kitCompletePrice } : null,
                  event.kitPremiumPrice != null ? { key: 'PREMIUM' as const, label: 'Kit Premium', price: event.kitPremiumPrice } : null,
                ].filter(Boolean) as Array<{ key: 'COMPLETO' | 'PREMIUM'; label: string; price: number }>).map((k) => {
                  const selected = selectedKit === k.key;
                  return (
                    <Pressable
                      key={k.key}
                      onPress={() => setSelectedKit(k.key)}
                      style={{
                        borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1.5,
                        borderColor: selected ? colors.primary : colors.text + '15',
                        backgroundColor: selected ? colors.primary + '10' : 'transparent',
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      }}
                    >
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{k.label}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: selected ? colors.primary : colors.textSecondary }}>{formatPrice(k.price)}</Text>
                    </Pressable>
                  );
                })}

                {(event.kitPickupLocation || event.kitPickupDate) && (
                  <View style={{ borderRadius: 14, padding: 14, marginTop: 6, backgroundColor: colors.text + '06' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 4 }}>📦 Retirada do kit</Text>
                    {event.kitPickupLocation && <Text style={{ fontSize: 12, color: colors.textSecondary }}>{event.kitPickupLocation}</Text>}
                    {event.kitPickupDate && <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{formatDate(event.kitPickupDate)} às {formatTime(event.kitPickupDate)}</Text>}
                  </View>
                )}

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                  <Pressable onPress={() => setStep('distance')} style={{ flex: 1, borderRadius: 14, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: colors.text + '20' }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textSecondary }}>Voltar</Text>
                  </Pressable>
                  <Pressable onPress={() => setStep('review')} style={{ flex: 2, borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: colors.primary }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>Continuar</Text>
                  </Pressable>
                </View>
              </>
            )}

            {step === 'review' && (
              <>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 12 }}>Confirme sua inscrição</Text>
                <View style={{ borderRadius: 14, padding: 16, backgroundColor: colors.text + '06', gap: 8 }}>
                  {selectedDistance && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>Percurso</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{selectedDistance.name}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>Camiseta</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{selectedShirtSize || '—'}</Text>
                  </View>
                  {selectedKit && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>Kit</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{selectedKit === 'PREMIUM' ? 'Premium' : 'Completo'} · {formatPrice(kitPrice)}</Text>
                    </View>
                  )}
                  <View style={{ height: 1, backgroundColor: colors.text + '10', marginVertical: 4 }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>Inscrição</Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.primary }}>{formatPrice(basePrice)}</Text>
                  </View>
                </View>

                {!!error && <Text style={{ fontSize: 13, color: '#DC2626', marginTop: 12 }}>{error}</Text>}

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                  <Pressable onPress={() => setStep(hasKitOptions ? 'kit' : 'distance')} style={{ flex: 1, borderRadius: 14, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: colors.text + '20' }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textSecondary }}>Voltar</Text>
                  </Pressable>
                  <Pressable disabled={submitting} onPress={submit} style={{ flex: 2, borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }}>
                    {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>Confirmar inscrição</Text>}
                  </Pressable>
                </View>
              </>
            )}

            {step === 'done' && registration && (
              <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                <Ionicons name="checkmark-circle" size={56} color="#10B981" />
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 10 }}>
                  {registration.status === 'WAITLIST' ? 'Você entrou na lista de espera' : 'Inscrição confirmada!'}
                </Text>
                {registration.status !== 'WAITLIST' && registration.bibNumber && (
                  <View style={{ alignItems: 'center', marginTop: 16, padding: 18, borderRadius: 16, backgroundColor: colors.primary + '10', minWidth: 160 }}>
                    <Text style={{ fontSize: 36, fontWeight: '900', color: colors.primary, letterSpacing: -1 }}>#{registration.bibNumber}</Text>
                    <Text style={{ fontSize: 10, color: colors.textTertiary, fontWeight: '700', marginTop: 2 }}>SEU NÚMERO DE PEITO</Text>
                  </View>
                )}
                {(event.kitPickupLocation || event.kitPickupDate) && (
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 14, textAlign: 'center' }}>
                    📦 Retirada do kit: {event.kitPickupLocation}{event.kitPickupDate ? ` — ${formatDate(event.kitPickupDate)}` : ''}
                  </Text>
                )}
                <Pressable onPress={onClose} style={{ marginTop: 20, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 40, alignItems: 'center', backgroundColor: colors.primary }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>Fechar</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function EventsScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<MainTab>('eventos');
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [myRegs, setMyRegs] = useState<ApiRegistration[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [partners, setPartners] = useState<ApiPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [regEvent, setRegEvent] = useState<ApiEvent | null>(null);
  const [orderingId, setOrderingId] = useState<string | null>(null);
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});

  const loadAll = useCallback(async () => {
    const [ev, regs, prods, parts] = await Promise.allSettled([
      api.get('/events', { params: { limit: 50 } }),
      api.get('/events/my-registrations'),
      api.get('/store/athlete/products'),
      api.get('/partners/my'),
    ]);
    if (ev.status === 'fulfilled') setEvents(ev.value.data?.data ?? []);
    if (regs.status === 'fulfilled') setMyRegs(regs.value.data?.data ?? []);
    if (prods.status === 'fulfilled') setProducts(Array.isArray(prods.value.data) ? prods.value.data : []);
    if (parts.status === 'fulfilled') setPartners(Array.isArray(parts.value.data) ? parts.value.data : []);
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll().finally(() => setRefreshing(false));
  }, [loadAll]);

  const regByEvent = React.useMemo(() => {
    const m: Record<string, ApiRegistration> = {};
    myRegs.forEach((r) => { m[r.eventId] = r; });
    return m;
  }, [myRegs]);

  const officialEvents = events.filter((e) => !isExternal(e));
  const externalEvents = events.filter(isExternal);

  const shadow = Platform.OS === 'web'
    ? { boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.25)' : '0 2px 16px rgba(0,0,0,0.06)' } as any
    : {};

  const orderProduct = async (p: ApiProduct) => {
    if (!user) return;
    const size = selectedSizes[p.id];
    if (p.sizes.length > 0 && !size) {
      Alert.alert('Escolha o tamanho', 'Selecione um tamanho antes de reservar.');
      return;
    }
    setOrderingId(p.id);
    try {
      const { data } = await api.post('/store/public/orders', {
        productId: p.id,
        customerName: user.name,
        customerEmail: user.email,
        size: size || undefined,
        quantity: 1,
      });
      Alert.alert('Pedido reservado! 🎉', `Sua reserva de "${p.name}" foi registrada. Pedido #${String(data?.id ?? '').slice(0, 8)} — o pagamento será combinado com a assessoria.`);
      loadAll();
    } catch (e: any) {
      Alert.alert('Não foi possível reservar', e?.response?.data?.message || 'Tente novamente.');
    } finally {
      setOrderingId(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <RegistrationModal event={regEvent} visible={!!regEvent} onClose={() => setRegEvent(null)} onRegistered={loadAll} />

      {/* Header */}
      <View style={{
        paddingTop: insets.top + 12, paddingHorizontal: 20,
        borderBottomWidth: 0.5, borderBottomColor: colors.text + '08',
        ...(Platform.OS === 'web' ? { position: 'sticky' as any, top: 0, zIndex: 10, backgroundColor: colors.background + 'F4', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } as any : {}),
      }}>
        <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: colors.text, marginBottom: 14 }}>
          Eventos & Loja
        </Text>
        <View style={{ flexDirection: 'row' }}>
          {([
            { key: 'eventos' as MainTab, label: 'Corridas', icon: 'flag-outline' as const },
            { key: 'loja' as MainTab, label: 'Loja RR 👕', icon: 'bag-outline' as const },
          ]).map((tab) => (
            <Pressable key={tab.key} onPress={() => setActiveTab(tab.key)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderBottomWidth: 2.5, borderBottomColor: activeTab === tab.key ? colors.primary : 'transparent' }}>
              <Ionicons name={tab.icon} size={16} color={activeTab === tab.key ? colors.primary : colors.textTertiary} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: activeTab === tab.key ? colors.primary : colors.textTertiary }}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} size="large" />
        ) : activeTab === 'eventos' ? (
          <>
            {/* My registrations banner */}
            {myRegs.length > 0 && (
              <View style={{ borderRadius: 16, padding: 14, marginBottom: 24, backgroundColor: '#10B981' + '12', borderWidth: 1, borderColor: '#10B981' + '25', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#10B981' }}>
                    Inscrito em {myRegs.length} evento{myRegs.length > 1 ? 's' : ''}!
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 1 }} numberOfLines={1}>
                    {myRegs.map((r) => r.event?.title).filter(Boolean).join(' • ')}
                  </Text>
                </View>
              </View>
            )}

            {/* Official events */}
            <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text, marginBottom: 16 }}>⭐ Eventos Rafinha Running</Text>

            {officialEvents.length === 0 && (
              <View style={{ borderRadius: 16, padding: 24, marginBottom: 20, backgroundColor: colors.text + '06', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>Nenhum evento aberto no momento</Text>
              </View>
            )}

            {officialEvents.map((event, idx) => {
              const gradient = GRADIENTS[idx % GRADIENTS.length];
              const myReg = regByEvent[event.id];
              const spotsTaken = event.registrationCount ?? 0;
              const fillPct = event.maxParticipants ? Math.min(100, Math.round((spotsTaken / event.maxParticipants) * 100)) : null;
              const soldOut = event.status === 'SOLD_OUT' || (event.maxParticipants != null && spotsTaken >= event.maxParticipants);

              return (
                <View key={event.id} style={{ borderRadius: 24, overflow: 'hidden', marginBottom: 20, ...shadow }}>
                  <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 20 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                      <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)' }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFF', letterSpacing: 1 }}>EVENTO OFICIAL RR</Text>
                      </View>
                      <Text style={{ fontSize: 32 }}>🏁</Text>
                    </View>
                    <Text style={{ fontSize: 24, fontWeight: '800', color: '#FFF', letterSpacing: -0.5, marginBottom: 4 }}>{event.title}</Text>
                    {!!event.modality && <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 14 }}>{event.modality}</Text>}
                    <View style={{ flexDirection: 'row', gap: 14, marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="calendar-outline" size={12} color="rgba(255,255,255,0.8)" /><Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '600' }}>{formatDate(event.eventDate)}</Text></View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.8)" /><Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '600' }}>{formatTime(event.eventDate)}</Text></View>
                    </View>
                    {!!event.location && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.7)" /><Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>{event.location}{event.city ? ` — ${event.city}` : ''}</Text></View>
                    )}
                  </LinearGradient>

                  <View style={{ backgroundColor: isDark ? '#160303' : '#FFFAFA', padding: 20 }}>
                    {myReg ? (
                      <View style={{ borderRadius: 16, padding: 16, backgroundColor: '#10B981' + '0C', borderWidth: 1.5, borderColor: '#10B981' + '30' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                          <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#10B981' }}>
                            {myReg.status === 'WAITLIST' ? 'Você está na lista de espera' : 'Você está inscrito!'}
                          </Text>
                        </View>
                        {myReg.bibNumber && myReg.status !== 'WAITLIST' && (
                          <View style={{ flexDirection: 'row', gap: 12 }}>
                            <View style={{ flex: 1, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: gradient[0] + '12' }}>
                              <Text style={{ fontSize: 28, fontWeight: '900', color: gradient[0], letterSpacing: -1 }}>#{myReg.bibNumber}</Text>
                              <Text style={{ fontSize: 10, color: colors.textTertiary, fontWeight: '600', marginTop: 2 }}>SEU NÚMERO</Text>
                            </View>
                            <View style={{ flex: 2, gap: 6, justifyContent: 'center' }}>
                              {!!myReg.shirtSize && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Ionicons name="shirt-outline" size={13} color={gradient[0]} />
                                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>Camiseta: <Text style={{ fontWeight: '700', color: colors.text }}>{myReg.shirtSize}</Text></Text>
                                </View>
                              )}
                              {!!myReg.kitPickupScheduledAt && (
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                                  <Ionicons name="cube-outline" size={13} color={gradient[0]} />
                                  <Text style={{ fontSize: 12, color: colors.textSecondary, flex: 1 }}>Kit: {formatDate(myReg.kitPickupScheduledAt)}</Text>
                                </View>
                              )}
                            </View>
                          </View>
                        )}
                      </View>
                    ) : (
                      <>
                        {!!event.description && (
                          <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: 14 }} numberOfLines={3}>{event.description}</Text>
                        )}
                        {fillPct != null && (
                          <View style={{ marginBottom: 14 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                              <Text style={{ fontSize: 11, color: colors.textTertiary }}>{spotsTaken} inscritos</Text>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: gradient[0] }}>{fillPct}% preenchido</Text>
                            </View>
                            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.text + '10', overflow: 'hidden' }}>
                              <View style={{ width: `${fillPct}%`, height: '100%', borderRadius: 3, backgroundColor: gradient[0] }} />
                            </View>
                          </View>
                        )}
                        <Pressable
                          disabled={soldOut}
                          onPress={() => setRegEvent(event)}
                          style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: soldOut ? colors.text + '20' : gradient[0] }}
                        >
                          <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>
                            {soldOut ? 'Vagas esgotadas' : `Inscrever-se · ${formatPrice(event.price)}`}
                          </Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              );
            })}

            {/* External races (events tagged 'externa') */}
            {externalEvents.length > 0 && (
              <>
                <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text, marginTop: 10, marginBottom: 16 }}>🏙️ Corridas em Equipe</Text>
                {externalEvents.map((race) => {
                  const myReg = regByEvent[race.id];
                  return (
                    <View key={race.id} style={{ borderRadius: 18, padding: 16, marginBottom: 12, backgroundColor: isDark ? colors.text + '08' : '#FFF', borderWidth: 1, borderColor: colors.text + '0A', ...shadow }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#8B5CF6' + '15', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 22 }}>🏙️</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }} numberOfLines={1}>{race.title}</Text>
                          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                            {formatDate(race.eventDate)}{race.modality ? ` · ${race.modality}` : ''}{race.location ? ` · ${race.location}` : ''}
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 3 }}>
                            👥 {race.registrationCount ?? 0} do grupo confirmados{race.price > 0 ? ` · ${formatPrice(race.price)}` : ''}
                          </Text>
                        </View>
                        {myReg ? (
                          <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#10B981' + '15' }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>Confirmado</Text>
                          </View>
                        ) : (
                          <Pressable onPress={() => setRegEvent(race)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.primary }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>Participar</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            {/* Partners */}
            {partners.length > 0 && (
              <>
                <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text, marginTop: 20, marginBottom: 16 }}>🤝 Nossos Parceiros</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {partners.map((p) => (
                    <Pressable
                      key={p.id}
                      disabled={!p.linkUrl}
                      onPress={() => p.linkUrl && Linking.openURL(p.linkUrl)}
                      style={{ width: '48%', flexGrow: 1, borderRadius: 16, padding: 14, backgroundColor: isDark ? colors.text + '08' : '#FFF', borderWidth: 1, borderColor: colors.text + '0A', ...shadow }}
                    >
                      <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: (p.color ?? '#DC2626') + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                        {p.logoUrl ? (
                          <Image source={{ uri: p.logoUrl }} style={{ width: 38, height: 38, borderRadius: 10 }} />
                        ) : (
                          <Text style={{ fontSize: 18 }}>{p.emoji || '🤝'}</Text>
                        )}
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }} numberOfLines={1}>{p.name}</Text>
                      {!!p.category && <Text style={{ fontSize: 10, fontWeight: '600', color: p.color ?? colors.primary, marginTop: 1 }}>{p.category}</Text>}
                      {!!p.description && <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 3 }} numberOfLines={2}>{p.description}</Text>}
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </>
        ) : (
          <>
            {/* Store */}
            {products.length === 0 ? (
              <View style={{ borderRadius: 16, padding: 24, backgroundColor: colors.text + '06', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>Nenhum produto disponível no momento</Text>
              </View>
            ) : (
              products.map((p) => {
                const available = p.totalStock - p.reserved;
                const soldOut = available <= 0;
                const pct = p.totalStock > 0 ? Math.min(100, Math.round((p.reserved / p.totalStock) * 100)) : 0;
                const effectivePrice = p.finalPriceInCents ?? p.priceInCents;
                const hasDiscount = !!p.hasAthleteDiscount && effectivePrice < (p.originalPriceInCents ?? p.priceInCents);
                const emoji = CATEGORY_EMOJI[p.category] ?? '🛍️';
                return (
                  <View key={p.id} style={{ borderRadius: 20, padding: 18, marginBottom: 14, backgroundColor: isDark ? colors.text + '08' : '#FFF', borderWidth: 1, borderColor: colors.text + '0A', opacity: soldOut ? 0.65 : 1, ...shadow }}>
                    <View style={{ flexDirection: 'row', gap: 14 }}>
                      <View style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: colors.primary + '10', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {p.images?.[0] ? (
                          <Image source={{ uri: p.images[0] }} style={{ width: 64, height: 64 }} resizeMode="cover" />
                        ) : (
                          <Text style={{ fontSize: 30 }}>{emoji}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{p.name}</Text>
                          {p.featured && (
                            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.primary + '15' }}>
                              <Text style={{ fontSize: 9, fontWeight: '800', color: colors.primary }}>DESTAQUE</Text>
                            </View>
                          )}
                        </View>
                        {!!p.description && <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }} numberOfLines={2}>{p.description}</Text>}
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.primary }}>{formatPrice(effectivePrice)}</Text>
                          {hasDiscount && (
                            <>
                              <Text style={{ fontSize: 12, color: colors.textTertiary, textDecorationLine: 'line-through' }}>{formatPrice(p.originalPriceInCents)}</Text>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#10B981' }}>-{p.athleteDiscountPercent}% aluno</Text>
                            </>
                          )}
                        </View>
                      </View>
                    </View>

                    {p.totalStock > 0 && (
                      <View style={{ marginTop: 12 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 10, color: colors.textTertiary }}>{p.reserved}/{p.totalStock} reservados</Text>
                          {!soldOut && available <= 10 && <Text style={{ fontSize: 10, fontWeight: '700', color: '#F59E0B' }}>Últimas {available} unidades!</Text>}
                        </View>
                        <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.text + '10', overflow: 'hidden' }}>
                          <View style={{ width: `${pct}%`, height: '100%', borderRadius: 3, backgroundColor: soldOut ? colors.textTertiary : colors.primary }} />
                        </View>
                      </View>
                    )}

                    {!soldOut && p.sizes.length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                        {p.sizes.map((s) => {
                          const selected = selectedSizes[p.id] === s;
                          return (
                            <Pressable
                              key={s}
                              onPress={() => setSelectedSizes((prev) => ({ ...prev, [p.id]: s }))}
                              style={{
                                paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5,
                                borderColor: selected ? colors.primary : colors.text + '15',
                                backgroundColor: selected ? colors.primary + '10' : 'transparent',
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '700', color: selected ? colors.primary : colors.textSecondary }}>{s}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}

                    <Pressable
                      disabled={soldOut || orderingId === p.id}
                      onPress={() => orderProduct(p)}
                      style={{ marginTop: 14, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: soldOut ? colors.text + '15' : colors.primary, opacity: orderingId === p.id ? 0.7 : 1 }}
                    >
                      {orderingId === p.id ? (
                        <ActivityIndicator color="#FFF" size="small" />
                      ) : (
                        <Text style={{ fontSize: 14, fontWeight: '700', color: soldOut ? colors.textTertiary : '#FFF' }}>
                          {soldOut ? 'Esgotado' : 'Reservar'}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
