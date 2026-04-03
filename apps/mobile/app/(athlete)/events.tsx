import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Platform, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { api } from '../../src/services/api';

type MainTab = 'eventos' | 'loja';
type RegStep = 'distance' | 'kit' | 'payment' | 'confirmation';

// ─── Static data ──────────────────────────────────────────────────────────────

const SAO_GARRAFA_EVENTS = [
  {
    id: 'sg2025', name: 'São Garrafa 2025', subtitle: '8ª Edição — Corrida de Fim de Ano',
    date: '14 Dezembro 2025', time: '07:00h', location: 'Parque Estadual das Nações — SP',
    distances: [
      { id: '5k', label: '5K', price: 85, description: 'Para todos os níveis' },
      { id: '10k', label: '10K', price: 95, description: 'Ritmo moderado a rápido' },
    ],
    status: 'open', spots: 48, totalSpots: 500,
    description: 'A maior confraternização de fim de ano da assessoria! Corra com o grupo, comemore as conquistas do ano e encerre 2025 com muita animação.',
    gradient: ['#DC2626', '#7F1D1D'] as [string, string], emoji: '🎄', tag: 'EVENTO OFICIAL RR',
    highlights: ['Kit participante', 'Camiseta exclusiva', 'Medalha finisher', 'Café da manhã', 'DJ ao vivo'],
    teamRegistered: 38,
    kitLocations: [
      { id: 'kl1', name: 'Assessoria RR — Sede', address: 'R. Ministro Jesuíno Cardoso, 454 — Vila Olímpia, SP', dates: ['06 Dez (Sex)', '07 Dez (Sáb)'], times: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'] },
      { id: 'kl2', name: 'On Running Store — Iguatemi', address: 'Av. Brigadeiro Faria Lima, 2232 — Jardim Europa, SP', dates: ['07 Dez (Sáb)', '08 Dez (Dom)'], times: ['11:00', '13:00', '15:00', '17:00'] },
      { id: 'kl3', name: 'No local — Parque das Nações', address: 'Parque Estadual das Nações Indígenas — SP', dates: ['14 Dez (Dom) — Dia do evento'], times: ['05:30', '06:00', '06:30'] },
    ],
    shirtSizes: ['PP', 'P', 'M', 'G', 'GG', 'XGG'],
  },
  {
    id: 'sgk2025', name: 'São Garrafa Kids 2025', subtitle: 'Para os pequenos atletas!',
    date: '05 Julho 2025', time: '08:00h', location: 'Parque Villa-Lobos — SP',
    distances: [
      { id: '200m', label: '200m', price: 45, description: '2 a 4 anos' },
      { id: '500m', label: '500m', price: 45, description: '5 a 7 anos' },
      { id: '1k', label: '1K', price: 45, description: '8 a 12 anos' },
    ],
    status: 'coming', spots: 120, totalSpots: 300,
    description: 'Especial para os filhos dos nossos atletas! Uma experiência divertida para introduzir os pequenos ao mundo das corridas.',
    gradient: ['#F59E0B', '#B45309'] as [string, string], emoji: '🧒', tag: 'EVENTO KIDS',
    highlights: ['Kit kids especial', 'Medalha personalizada', 'Lanche saudável', 'Animação e música', 'Foto oficial'],
    teamRegistered: 12,
    kitLocations: [
      { id: 'kl1', name: 'Assessoria RR — Sede', address: 'R. Ministro Jesuíno Cardoso, 454 — Vila Olímpia, SP', dates: ['03 Jul (Qui)', '04 Jul (Sex)'], times: ['09:00', '10:00', '11:00', '14:00', '15:00'] },
      { id: 'kl2', name: 'No local — Parque Villa-Lobos', address: 'Av. Prof. Fonseca Rodrigues, 2001 — Alto de Pinheiros, SP', dates: ['05 Jul (Sáb) — Dia do evento'], times: ['06:30', '07:00', '07:30'] },
    ],
    shirtSizes: ['2', '4', '6', '8', '10', '12'],
  },
];

const EXTERNAL_RACES = [
  { id: 'er1', name: 'Meia Maratona de São Paulo', date: '24 Mai 2026', distance: '21K', location: 'Ibirapuera, SP', teamGoing: 14, price: 'R$ 189,00', status: 'open', color: '#8B5CF6', logo: '🏙️', myStatus: 'registered' },
  { id: 'er2', name: 'Maratona de SP', date: '06 Dez 2026', distance: '42K', location: 'Ibirapuera, SP', teamGoing: 6, price: 'R$ 250,00', status: 'open', color: '#3B82F6', logo: '🏆', myStatus: null },
  { id: 'er3', name: 'Night Run SP', date: '12 Abr 2026', distance: '10K', location: 'Parque Burle Marx, SP', teamGoing: 22, price: 'R$ 99,00', status: 'open', color: '#6366F1', logo: '🌙', myStatus: 'registered' },
  { id: 'er4', name: 'Corrida Vila Funchal', date: '02 Ago 2026', distance: '5K / 10K', location: 'Vila Olímpia, SP', teamGoing: 31, price: 'R$ 75,00', status: 'coming', color: '#10B981', logo: '🌳', myStatus: null },
];

const STORE_ITEMS = [
  { id: 'shirt2026', category: 'Camiseta', name: 'Camisa Oficial RR 2026', color: 'Azul Cobalto', colorHex: '#1D4ED8', price: 89.90, status: 'pre-order', deadline: '30 Abr 2026', sold: 87, total: 150, sizes: ['PP', 'P', 'M', 'G', 'GG', 'XGG'], isNew: true, emoji: '👕' },
  { id: 'jacket2026', category: 'Casaco', name: 'Casaco RR Corta-Vento 2026', color: 'Preto/Vermelho', colorHex: '#111827', price: 149.90, status: 'pre-order', deadline: '30 Abr 2026', sold: 34, total: 100, sizes: ['PP', 'P', 'M', 'G', 'GG'], isNew: true, emoji: '🧥' },
  { id: 'visor2026', category: 'Viseira', name: 'Viseira RR 2026', color: 'Vermelho', colorHex: '#DC2626', price: 39.90, status: 'pre-order', deadline: '30 Abr 2026', sold: 52, total: 80, sizes: ['Único'], isNew: true, emoji: '🧢' },
  { id: 'socks', category: 'Meias', name: 'Meias de Corrida RR', color: 'Branco/Vermelho', colorHex: '#DC2626', price: 24.90, status: 'pre-order', deadline: '30 Abr 2026', sold: 63, total: 120, sizes: ['P (35–38)', 'M (39–42)', 'G (43–46)'], isNew: true, emoji: '🧦' },
  { id: 'shirt2025', category: 'Camiseta', name: 'Camisa Oficial RR 2025', color: 'Verde Militar', colorHex: '#16A34A', price: 89.90, status: 'sold-out', sold: 150, total: 150, sizes: [] as string[], isNew: false, emoji: '👕' },
];

const PARTNERS = [
  { id: 'p1', name: 'Cervejaria Malteca', category: 'Bebidas', emoji: '🍺', color: '#F59E0B', description: 'Parceiro oficial pós-corrida' },
  { id: 'p2', name: 'Açaí Naboah', category: 'Alimentação', emoji: '🍇', color: '#7C3AED', description: 'Açaí oficial dos eventos RR' },
  { id: 'p3', name: 'On Running', category: 'Calçados', emoji: '👟', color: '#111827', description: 'Calçados e acessórios oficiais' },
  { id: 'p4', name: 'Gatorade', category: 'Hidratação', emoji: '💧', color: '#F97316', description: 'Hidratação nos postos de água' },
  { id: 'p5', name: 'Garmin Brasil', category: 'Tecnologia', emoji: '⌚', color: '#007CC3', description: 'Tecnologia GPS oficial' },
  { id: 'p6', name: 'Physio Sports', category: 'Saúde', emoji: '🏥', color: '#10B981', description: 'Fisioterapia e prevenção' },
];

// ─── Registration Modal ───────────────────────────────────────────────────────

function RegistrationModal({
  event, visible, onClose,
}: {
  event: typeof SAO_GARRAFA_EVENTS[0] | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const [step, setStep] = useState<RegStep>('distance');
  const [selectedDistance, setSelectedDistance] = useState<string>('');
  const [selectedShirtSize, setSelectedShirtSize] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix');
  const [bibNumber] = useState(() => String(Math.floor(Math.random() * 9000) + 1000).padStart(4, '0'));

  if (!event) return null;

  const distObj = event.distances.find((d) => d.id === selectedDistance);
  const locObj = event.kitLocations.find((l) => l.id === selectedLocation);

  const reset = () => {
    setStep('distance'); setSelectedDistance(''); setSelectedShirtSize('');
    setSelectedLocation(''); setSelectedDate(''); setSelectedTime(''); setPaymentMethod('pix');
    onClose();
  };

  const canProceedDistance = selectedDistance && selectedShirtSize;
  const canProceedKit = selectedLocation && selectedDate && selectedTime;

  const STEPS = ['distance', 'kit', 'payment', 'confirmation'];
  const stepIdx = STEPS.indexOf(step);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: isDark ? '#111' : '#FFF',
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          maxHeight: '94%',
        }}>
          {/* Drag indicator */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.text + '20' }} />
          </View>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: colors.text + '08' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{event.name}</Text>
              <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>
                {step === 'distance' ? 'Escolha a distância' : step === 'kit' ? 'Retirada do Kit' : step === 'payment' ? 'Pagamento' : 'Inscrição confirmada!'}
              </Text>
            </View>
            <Pressable onPress={reset} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.text + '08', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Step indicator */}
          {step !== 'confirmation' && (
            <View style={{ flexDirection: 'row', paddingHorizontal: 24, paddingTop: 16, gap: 6 }}>
              {['Distância', 'Kit', 'Pagamento'].map((s, i) => (
                <View key={s} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                  <View style={{ height: 3, borderRadius: 2, width: '100%', backgroundColor: i <= stepIdx ? event.gradient[0] : colors.text + '10' }} />
                  <Text style={{ fontSize: 9, fontWeight: '600', color: i <= stepIdx ? event.gradient[0] : colors.textTertiary }}>{s}</Text>
                </View>
              ))}
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
            {/* ── STEP 1: Distance ── */}
            {step === 'distance' && (
              <View style={{ gap: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 }}>Modalidade</Text>
                {event.distances.map((d) => (
                  <Pressable key={d.id} onPress={() => setSelectedDistance(d.id)} style={{
                    borderRadius: 16, padding: 16, borderWidth: 2,
                    borderColor: selectedDistance === d.id ? event.gradient[0] : colors.text + '10',
                    backgroundColor: selectedDistance === d.id ? event.gradient[0] + '08' : colors.surface,
                    flexDirection: 'row', alignItems: 'center',
                  }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 20, fontWeight: '800', color: selectedDistance === d.id ? event.gradient[0] : colors.text }}>{d.label}</Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{d.description}</Text>
                    </View>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: selectedDistance === d.id ? event.gradient[0] : colors.text }}>R$ {d.price.toFixed(2)}</Text>
                    {selectedDistance === d.id && <Ionicons name="checkmark-circle" size={22} color={event.gradient[0]} style={{ marginLeft: 10 }} />}
                  </Pressable>
                ))}

                <View style={{ height: 1, backgroundColor: colors.text + '08' }} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 }}>Tamanho da camiseta do kit</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {event.shirtSizes.map((size) => (
                    <Pressable key={size} onPress={() => setSelectedShirtSize(size)} style={{
                      paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 2,
                      borderColor: selectedShirtSize === size ? event.gradient[0] : colors.text + '10',
                      backgroundColor: selectedShirtSize === size ? event.gradient[0] : colors.surface,
                    }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: selectedShirtSize === size ? '#FFF' : colors.textSecondary }}>{size}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* ── STEP 2: Kit pickup ── */}
            {step === 'kit' && (
              <View style={{ gap: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 }}>Local de retirada do kit</Text>
                {event.kitLocations.map((loc) => (
                  <Pressable key={loc.id} onPress={() => { setSelectedLocation(loc.id); setSelectedDate(''); setSelectedTime(''); }} style={{
                    borderRadius: 16, padding: 16, borderWidth: 2,
                    borderColor: selectedLocation === loc.id ? event.gradient[0] : colors.text + '10',
                    backgroundColor: selectedLocation === loc.id ? event.gradient[0] + '08' : colors.surface,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: selectedLocation === loc.id ? event.gradient[0] + '20' : colors.text + '08', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="location-outline" size={18} color={selectedLocation === loc.id ? event.gradient[0] : colors.textTertiary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: selectedLocation === loc.id ? event.gradient[0] : colors.text }}>{loc.name}</Text>
                        <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2, lineHeight: 16 }}>{loc.address}</Text>
                      </View>
                      {selectedLocation === loc.id && <Ionicons name="checkmark-circle" size={20} color={event.gradient[0]} />}
                    </View>
                  </Pressable>
                ))}

                {locObj && (
                  <>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary }}>Data</Text>
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      {locObj.dates.map((d) => (
                        <Pressable key={d} onPress={() => { setSelectedDate(d); setSelectedTime(''); }} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: selectedDate === d ? event.gradient[0] : colors.text + '10', backgroundColor: selectedDate === d ? event.gradient[0] : colors.surface }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: selectedDate === d ? '#FFF' : colors.textSecondary }}>{d}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {selectedDate && (
                      <>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary }}>Horário</Text>
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                          {locObj.times.map((t) => (
                            <Pressable key={t} onPress={() => setSelectedTime(t)} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: selectedTime === t ? event.gradient[0] : colors.text + '10', backgroundColor: selectedTime === t ? event.gradient[0] : colors.surface }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: selectedTime === t ? '#FFF' : colors.textSecondary }}>{t}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </>
                    )}
                  </>
                )}
              </View>
            )}

            {/* ── STEP 3: Payment ── */}
            {step === 'payment' && (
              <View style={{ gap: 16 }}>
                {/* Summary */}
                <View style={{ borderRadius: 16, padding: 16, backgroundColor: colors.text + '04', borderWidth: 1, borderColor: colors.text + '08' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 12 }}>RESUMO DA INSCRIÇÃO</Text>
                  {[
                    { label: 'Evento', value: event.name },
                    { label: 'Modalidade', value: distObj?.label || '' },
                    { label: 'Camiseta kit', value: `Tamanho ${selectedShirtSize}` },
                    { label: 'Retirada do kit', value: locObj ? locObj.name : '' },
                    { label: 'Data / Hora', value: `${selectedDate} às ${selectedTime}` },
                  ].map((item) => (
                    <View key={item.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.text + '07' }}>
                      <Text style={{ fontSize: 12, color: colors.textTertiary }}>{item.label}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>{item.value}</Text>
                    </View>
                  ))}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>Total</Text>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: event.gradient[0] }}>R$ {distObj?.price.toFixed(2)}</Text>
                  </View>
                </View>

                {/* Payment method */}
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary }}>Forma de pagamento</Text>
                {([
                  { id: 'pix' as const, label: 'PIX', icon: 'qr-code-outline' as const, desc: 'Aprovação instantânea' },
                  { id: 'card' as const, label: 'Cartão de crédito', icon: 'card-outline' as const, desc: 'Parcelamento disponível' },
                ] as const).map((pm) => (
                  <Pressable key={pm.id} onPress={() => setPaymentMethod(pm.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, borderWidth: 2, borderColor: paymentMethod === pm.id ? event.gradient[0] : colors.text + '10', backgroundColor: paymentMethod === pm.id ? event.gradient[0] + '08' : colors.surface }}>
                    <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: paymentMethod === pm.id ? event.gradient[0] + '15' : colors.text + '07', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={pm.icon} size={20} color={paymentMethod === pm.id ? event.gradient[0] : colors.textSecondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: paymentMethod === pm.id ? event.gradient[0] : colors.text }}>{pm.label}</Text>
                      <Text style={{ fontSize: 11, color: colors.textTertiary }}>{pm.desc}</Text>
                    </View>
                    {paymentMethod === pm.id && <Ionicons name="checkmark-circle" size={20} color={event.gradient[0]} />}
                  </Pressable>
                ))}
              </View>
            )}

            {/* ── STEP 4: Confirmation ── */}
            {step === 'confirmation' && (
              <View style={{ gap: 0 }}>
                {/* Bib number hero */}
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <View style={{ width: 80, height: 80, borderRadius: 22, backgroundColor: event.gradient[0] + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                    <Text style={{ fontSize: 36 }}>🎉</Text>
                  </View>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.5, marginBottom: 4 }}>Inscrição confirmada!</Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center' }}>Seu número de participante foi reservado</Text>
                </View>

                {/* Bib card */}
                <View style={{ borderRadius: 24, overflow: 'hidden', marginBottom: 20 }}>
                  <LinearGradient colors={event.gradient} style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.7)', letterSpacing: 2, marginBottom: 8 }}>NÚMERO DO PARTICIPANTE</Text>
                    <Text style={{ fontSize: 72, fontWeight: '900', color: '#FFF', letterSpacing: -2, lineHeight: 76 }}>#{bibNumber}</Text>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.9)', marginTop: 4 }}>{distObj?.label} · {event.name}</Text>
                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{event.date} · {event.time}</Text>
                  </LinearGradient>
                </View>

                {/* Kit pickup info */}
                <View style={{ borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#10B981' + '30', padding: 18, marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#10B981' + '12', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="bag-check-outline" size={20} color="#10B981" />
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>Retirada do Kit</Text>
                  </View>
                  {[
                    { icon: 'location-outline' as const, label: locObj?.name || '', color: '#8B5CF6' },
                    { icon: 'map-outline' as const, label: locObj?.address || '', color: '#3B82F6' },
                    { icon: 'calendar-outline' as const, label: selectedDate, color: '#F59E0B' },
                    { icon: 'time-outline' as const, label: `${selectedTime}h`, color: '#EF4444' },
                    { icon: 'shirt-outline' as const, label: `Camiseta tamanho ${selectedShirtSize}`, color: event.gradient[0] },
                  ].map((item) => (
                    <View key={item.label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 }}>
                      <Ionicons name={item.icon} size={15} color={item.color} style={{ marginTop: 1 }} />
                      <Text style={{ fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 19 }}>{item.label}</Text>
                    </View>
                  ))}
                </View>

                <View style={{ borderRadius: 14, padding: 14, backgroundColor: '#F59E0B' + '10', borderWidth: 1, borderColor: '#F59E0B' + '25', flexDirection: 'row', gap: 10 }}>
                  <Ionicons name="notifications-outline" size={18} color="#F59E0B" style={{ marginTop: 1 }} />
                  <Text style={{ fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 19 }}>
                    Você receberá uma mensagem com todos os detalhes da sua inscrição, número, local e horário de retirada do kit.
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* CTA */}
          <View style={{ paddingHorizontal: 24, paddingBottom: 32, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: colors.text + '08' }}>
            {step === 'confirmation' ? (
              <Pressable onPress={reset} style={{ borderRadius: 16, paddingVertical: 15, backgroundColor: event.gradient[0], alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFF' }}>Perfeito! Até lá 🏃</Text>
              </Pressable>
            ) : (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {step !== 'distance' && (
                  <Pressable onPress={() => setStep(STEPS[stepIdx - 1] as RegStep)} style={{ paddingHorizontal: 20, paddingVertical: 15, borderRadius: 16, backgroundColor: colors.text + '08' }}>
                    <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
                  </Pressable>
                )}
                <Pressable
                  onPress={() => {
                    if (step === 'distance' && canProceedDistance) setStep('kit');
                    else if (step === 'kit' && canProceedKit) setStep('payment');
                    else if (step === 'payment') setStep('confirmation');
                  }}
                  style={{
                    flex: 1, borderRadius: 16, paddingVertical: 15,
                    backgroundColor: (step === 'distance' ? canProceedDistance : step === 'kit' ? canProceedKit : true)
                      ? event.gradient[0] : colors.text + '20',
                    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFF' }}>
                    {step === 'payment' ? 'Confirmar e pagar' : 'Continuar'}
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFF" />
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function EventsScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<MainTab>('eventos');
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});
  const [regEvent, setRegEvent] = useState<typeof SAO_GARRAFA_EVENTS[0] | null>(null);
  const [apiEvents, setApiEvents] = useState<any[]>([]);
  const [myApiRegistrations, setMyApiRegistrations] = useState<string[]>([]);

  useEffect(() => {
    api.get('/events').then(({ data }) => {
      if (data?.data?.length > 0) setApiEvents(data.data);
    }).catch(() => {});
    api.get('/events/registrations/my').then(({ data }) => {
      setMyApiRegistrations(data?.map((r: any) => r.eventId) || []);
    }).catch(() => {});
  }, []);

  const shadow = Platform.OS === 'web'
    ? { boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.25)' : '0 2px 16px rgba(0,0,0,0.06)' } as any
    : {};

  const myRaces = EXTERNAL_RACES.filter((r) => r.myStatus === 'registered');

  // Static fallback registrations (shown when no API data)
  const myRegistrations: Record<string, { bib: string; distance: string; pickup: string }> = {
    'sg2025': { bib: '0342', distance: '10K', pickup: 'Assessoria RR — 07 Dez às 10:00' },
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <RegistrationModal event={regEvent} visible={!!regEvent} onClose={() => setRegEvent(null)} />

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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 100 }}>
        {activeTab === 'eventos' ? (
          <>
            {/* My registrations banner */}
            {(myRaces.length > 0 || Object.keys(myRegistrations).length > 0) && (
              <View style={{ borderRadius: 16, padding: 14, marginBottom: 24, backgroundColor: '#10B981' + '12', borderWidth: 1, borderColor: '#10B981' + '25', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#10B981' }}>
                    Inscrito em {Object.keys(myRegistrations).length + myRaces.length} evento{Object.keys(myRegistrations).length + myRaces.length > 1 ? 's' : ''}!
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 1 }}>
                    São Garrafa 2025 • {myRaces.map((r) => r.name).join(' • ')}
                  </Text>
                </View>
              </View>
            )}

            {/* São Garrafa Events */}
            <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text, marginBottom: 16 }}>⭐ Eventos Rafinha Running</Text>

            {SAO_GARRAFA_EVENTS.map((event) => {
              const fillPct = Math.round(((event.totalSpots - event.spots) / event.totalSpots) * 100);
              const myReg = myRegistrations[event.id];

              return (
                <View key={event.id} style={{ borderRadius: 24, overflow: 'hidden', marginBottom: 20, ...shadow }}>
                  <LinearGradient colors={event.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 20 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                      <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)' }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFF', letterSpacing: 1 }}>{event.tag}</Text>
                      </View>
                      <Text style={{ fontSize: 32 }}>{event.emoji}</Text>
                    </View>
                    <Text style={{ fontSize: 24, fontWeight: '800', color: '#FFF', letterSpacing: -0.5, marginBottom: 4 }}>{event.name}</Text>
                    <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 14 }}>{event.subtitle}</Text>
                    <View style={{ flexDirection: 'row', gap: 14, marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="calendar-outline" size={12} color="rgba(255,255,255,0.8)" /><Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '600' }}>{event.date}</Text></View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.8)" /><Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '600' }}>{event.time}</Text></View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 }}><Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.7)" /><Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>{event.location}</Text></View>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      {event.distances.map((d) => (<View key={d.id} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}><Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>{d.label}</Text></View>))}
                    </View>
                  </LinearGradient>

                  <View style={{ backgroundColor: isDark ? '#160303' : '#FFFAFA', padding: 20 }}>
                    {/* My registration card */}
                    {myReg ? (
                      <View style={{ borderRadius: 16, padding: 16, backgroundColor: '#10B981' + '0C', borderWidth: 1.5, borderColor: '#10B981' + '30', marginBottom: 16 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                          <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#10B981' }}>Você está inscrito!</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                          <View style={{ flex: 1, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: event.gradient[0] + '12' }}>
                            <Text style={{ fontSize: 28, fontWeight: '900', color: event.gradient[0], letterSpacing: -1 }}>#{myReg.bib}</Text>
                            <Text style={{ fontSize: 10, color: colors.textTertiary, fontWeight: '600', marginTop: 2 }}>SEU NÚMERO</Text>
                          </View>
                          <View style={{ flex: 2, gap: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="flag-outline" size={13} color={event.gradient[0]} />
                              <Text style={{ fontSize: 12, color: colors.textSecondary }}>Modalidade: <Text style={{ fontWeight: '700', color: colors.text }}>{myReg.distance}</Text></Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                              <Ionicons name="bag-check-outline" size={13} color="#10B981" style={{ marginTop: 1 }} />
                              <Text style={{ fontSize: 12, color: colors.textSecondary, flex: 1 }}>{myReg.pickup}</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    ) : (
                      <>
                        <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginBottom: 14 }}>{event.description}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                          {event.highlights.map((h) => (
                            <View key={h} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.primary + '10' }}>
                              <Ionicons name="checkmark-circle" size={11} color={colors.primary} />
                              <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>{h}</Text>
                            </View>
                          ))}
                        </View>
                      </>
                    )}

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: colors.text + '08' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="people-outline" size={14} color={event.gradient[0]} />
                        <Text style={{ fontSize: 12, color: colors.textSecondary }}><Text style={{ fontWeight: '700', color: event.gradient[0] }}>{event.teamRegistered}</Text> do grupo vão</Text>
                      </View>
                      {!myReg && <Text style={{ fontSize: 17, fontWeight: '800', color: colors.primary }}>A partir de R$ {Math.min(...event.distances.map((d) => d.price)).toFixed(2)}</Text>}
                    </View>

                    {!myReg && (
                      <>
                        <View style={{ marginBottom: 14 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                            <Text style={{ fontSize: 11, color: colors.textTertiary }}>{event.totalSpots - event.spots} de {event.totalSpots} vagas</Text>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: fillPct > 80 ? '#EF4444' : colors.textTertiary }}>{event.spots} restantes</Text>
                          </View>
                          <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.text + '10', overflow: 'hidden' }}>
                            <LinearGradient colors={event.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: '100%', width: `${fillPct}%` as any, borderRadius: 3 }} />
                          </View>
                        </View>
                        <Pressable
                          onPress={() => event.status === 'open' ? setRegEvent(event) : Alert.alert('Em breve', 'As inscrições ainda não estão abertas. Ative as notificações para ser avisado!')}
                          style={{ borderRadius: 14, overflow: 'hidden' }}
                        >
                          <LinearGradient colors={event.status === 'open' ? event.gradient : ['#9CA3AF', '#6B7280']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                            <Ionicons name={event.status === 'open' ? 'flag-outline' : 'time-outline'} size={16} color="#FFF" />
                            <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFF' }}>
                              {event.status === 'open' ? 'Inscrever-se agora' : 'Inscrições em breve'}
                            </Text>
                          </LinearGradient>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              );
            })}

            {/* API Events (when available) */}
            {apiEvents.length > 0 && (
              <>
                <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text, marginBottom: 16, marginTop: 8 }}>📅 Próximos Eventos</Text>
                {apiEvents.map((event) => {
                  const isRegistered = myApiRegistrations.includes(event.id);
                  return (
                    <View key={event.id} style={{ borderRadius: 18, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.text + '0A', padding: 16, marginBottom: 12, ...shadow }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, letterSpacing: -0.3 }}>{event.name}</Text>
                          {event.description ? <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 3 }}>{event.description}</Text> : null}
                        </View>
                        {isRegistered && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: '#10B981' + '15', marginLeft: 8 }}>
                            <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>Inscrito</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                        {event.date && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name="calendar-outline" size={12} color={colors.textTertiary} />
                            <Text style={{ fontSize: 12, color: colors.textSecondary }}>{new Date(event.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
                          </View>
                        )}
                        {event.location && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name="location-outline" size={12} color={colors.textTertiary} />
                            <Text style={{ fontSize: 12, color: colors.textSecondary }}>{event.location}</Text>
                          </View>
                        )}
                        {event.price != null && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name="pricetag-outline" size={12} color={colors.textTertiary} />
                            <Text style={{ fontSize: 12, color: colors.textSecondary }}>{event.price === 0 ? 'Gratuito' : `R$ ${(event.price / 100).toFixed(2)}`}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            {/* External races */}
            <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text, marginBottom: 8, marginTop: 4 }}>👥 Corridas em Equipe</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 16, lineHeight: 20 }}>Corridas externas onde o grupo RR participa junto.</Text>
            {EXTERNAL_RACES.map((race) => (
              <View key={race.id} style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.text + '08', marginBottom: 12, ...shadow }}>
                <View style={{ height: 3, backgroundColor: race.color }} />
                <View style={{ padding: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: race.color + '12', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22 }}>{race.logo}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{race.name}</Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, backgroundColor: race.color + '12' }}><Text style={{ fontSize: 11, fontWeight: '700', color: race.color }}>{race.distance}</Text></View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><Ionicons name="calendar-outline" size={11} color={colors.textTertiary} /><Text style={{ fontSize: 11, color: colors.textTertiary }}>{race.date}</Text></View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><Ionicons name="location-outline" size={11} color={colors.textTertiary} /><Text style={{ fontSize: 11, color: colors.textTertiary }}>{race.location}</Text></View>
                      </View>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="people-outline" size={14} color={race.color} /><Text style={{ fontSize: 12, color: colors.textSecondary }}><Text style={{ fontWeight: '700', color: race.color }}>{race.teamGoing}</Text> do grupo vão</Text></View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{race.price}</Text>
                      {race.myStatus === 'registered' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#10B981' + '15' }}><Ionicons name="checkmark-circle" size={13} color="#10B981" /><Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>Inscrito</Text></View>
                      ) : (
                        <Pressable style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, backgroundColor: race.color }}><Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>{race.status === 'open' ? 'Inscrever' : 'Avisar-me'}</Text></Pressable>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            ))}

            {/* ── PARTNERS ── */}
            <View style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#F59E0B' + '15', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="ribbon-outline" size={14} color="#F59E0B" /></View>
                <Text style={{ fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text }}>Nossos Parceiros</Text>
              </View>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 16, lineHeight: 20 }}>Marcas que acreditam no projeto Rafinha Running e estão presentes em todos os nossos eventos.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {PARTNERS.map((p) => (
                  <View key={p.id} style={{ width: '47.5%', borderRadius: 16, padding: 16, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.text + '08', ...shadow }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: p.color + '12', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 22 }}>{p.emoji}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }} numberOfLines={1}>{p.name}</Text>
                        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: p.color + '12', alignSelf: 'flex-start', marginTop: 3 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: p.color }}>{p.category.toUpperCase()}</Text>
                        </View>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: colors.textTertiary, lineHeight: 16 }}>{p.description}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : (
          <>
            {/* Store header */}
            <LinearGradient colors={isDark ? ['#1a0505', '#2d0808'] : ['#FEF2F2', '#FFE4E4']} style={{ borderRadius: 18, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 }}>
              <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="shirt-outline" size={26} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>Loja Oficial RR</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 3 }}>Camisas, casacos, viseiras e mais. Quando esgota, esgotou. 🔥</Text>
              </View>
            </LinearGradient>

            {/* Category pills */}
            {['Todos', 'Camiseta', 'Casaco', 'Viseira', 'Meias'].map((cat) => (
              <View key={cat} />
            ))}

            {STORE_ITEMS.map((item) => {
              const isSoldOut = item.status === 'sold-out';
              const fillPct = Math.round((item.sold / item.total) * 100);
              const selectedSize = selectedSizes[item.id];
              return (
                <View key={item.id} style={{ borderRadius: 22, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.text + '08', marginBottom: 16, ...shadow }}>
                  <View style={{ height: 100, backgroundColor: item.colorHex + (isDark ? '22' : '15'), alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 16 }}>
                    <Text style={{ fontSize: 44 }}>{item.emoji}</Text>
                    <View style={{ width: 60, height: 60, borderRadius: 12, backgroundColor: item.colorHex, alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? { boxShadow: `0 6px 20px ${item.colorHex}50` } as any : {}) }}>
                      <Text style={{ fontSize: 14, color: '#FFF', fontWeight: '900' }}>RR</Text>
                    </View>
                    {item.isNew && <View style={{ position: 'absolute', top: 10, right: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, backgroundColor: colors.primary }}><Text style={{ fontSize: 9, fontWeight: '800', color: '#FFF' }}>PRÉ-VENDA</Text></View>}
                    {isSoldOut && <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 14, fontWeight: '800', color: '#FFF' }}>ESGOTOU 🔥</Text></View>}
                  </View>
                  <View style={{ padding: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: item.colorHex + '15', alignSelf: 'flex-start', marginBottom: 4 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: item.colorHex }}>{item.category.toUpperCase()}</Text>
                        </View>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{item.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.colorHex }} />
                          <Text style={{ fontSize: 12, color: colors.textSecondary }}>{item.color}</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 18, fontWeight: '800', color: isSoldOut ? colors.textTertiary : colors.primary }}>R$ {item.price.toFixed(2)}</Text>
                    </View>
                    <View style={{ marginVertical: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 11, color: colors.textTertiary }}>{item.sold}/{item.total} unidades {isSoldOut ? '— Esgotado' : `— ${item.total - item.sold} restantes`}</Text>
                        {!isSoldOut && item.deadline && <Text style={{ fontSize: 11, color: '#F59E0B', fontWeight: '600' }}>até {item.deadline}</Text>}
                      </View>
                      <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.text + '10', overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${fillPct}%` as any, borderRadius: 3, backgroundColor: isSoldOut ? colors.textTertiary : item.colorHex }} />
                      </View>
                    </View>
                    {!isSoldOut && item.sizes.length > 0 && (
                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textTertiary, marginBottom: 8 }}>TAMANHO</Text>
                        <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>
                          {item.sizes.map((size) => (
                            <Pressable key={size} onPress={() => setSelectedSizes((prev) => ({ ...prev, [item.id]: prev[item.id] === size ? '' : size }))} style={{ paddingHorizontal: 14, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: selectedSize === size ? item.colorHex : colors.text + '08', borderWidth: 1.5, borderColor: selectedSize === size ? item.colorHex : colors.text + '10' }}>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: selectedSize === size ? '#FFF' : colors.textSecondary }}>{size}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    )}
                    {!isSoldOut && (
                      <Pressable style={{ borderRadius: 14, paddingVertical: 12, backgroundColor: item.colorHex, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, opacity: selectedSize ? 1 : 0.5 }}>
                        <Ionicons name="bag-outline" size={16} color="#FFF" />
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>
                          {selectedSize ? `Encomendar — R$ ${item.price.toFixed(2)}` : 'Selecione um tamanho'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}

            <View style={{ borderRadius: 18, padding: 18, backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.text + '07', ...shadow }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Ionicons name="notifications-outline" size={20} color={colors.primary} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>Seja o primeiro a saber</Text>
              </View>
              <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: 14 }}>Ative para receber notificação quando novos itens forem disponibilizados.</Text>
              <Pressable style={{ borderRadius: 12, paddingVertical: 12, backgroundColor: colors.primary, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                <Ionicons name="notifications-outline" size={16} color="#FFF" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>Ativar notificações da loja</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
