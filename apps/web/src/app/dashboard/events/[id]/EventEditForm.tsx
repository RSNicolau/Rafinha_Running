'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { centsToBRLInput, parseBRLToCents } from '../../../checkout/_lib/money';
import { errMsg, inputCls, labelCls } from './shared';

type Ev = {
  id: string; title: string; description?: string | null; eventDate: string; eventEndDate?: string | null; location?: string | null;
  city?: string | null; state?: string | null; modality?: string | null; maxParticipants?: number | null; price: number; rules?: string | null;
  kitDescription?: string | null; kitCompletePrice?: number | null; kitPremiumPrice?: number | null; kitPickupLocation?: string | null;
  kitPickupDate?: string | null; routeMapUrl?: string | null; meetingPoint?: string | null;
};

const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const reais = (c?: number | null) => centsToBRLInput(c);
/** "1.299,90" → 129990 (pt-BR); vazio → null; inválido → NaN (bloqueado no salvar). */
const cents = (v: string) => (v.trim() === '' ? null : parseBRLToCents(v) ?? NaN);

export default function EventEditForm({ event, onSaved }: { event: Ev; onSaved: () => void }) {
  const [f, setF] = useState({
    title: event.title,
    description: event.description ?? '',
    eventDate: toLocalInput(event.eventDate),
    eventEndDate: toLocalInput(event.eventEndDate),
    location: event.location ?? '',
    city: event.city ?? '',
    state: event.state ?? '',
    modality: event.modality ?? '',
    maxParticipants: event.maxParticipants ? String(event.maxParticipants) : '',
    price: reais(event.price),
    rules: event.rules ?? '',
    kitDescription: event.kitDescription ?? '',
    kitCompletePrice: reais(event.kitCompletePrice),
    kitPremiumPrice: reais(event.kitPremiumPrice),
    kitPickupLocation: event.kitPickupLocation ?? '',
    kitPickupDate: toLocalInput(event.kitPickupDate),
    routeMapUrl: event.routeMapUrl ?? '',
    meetingPoint: event.meetingPoint ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.title.trim() || !f.eventDate) return setMsg('Título e data são obrigatórios.');
    const price = cents(f.price) ?? 0;
    if (price < 0 || Number.isNaN(price)) return setMsg('Preço inválido. Use o formato 1.299,90.');
    const kc = cents(f.kitCompletePrice);
    const kp = cents(f.kitPremiumPrice);
    if ((kc !== null && Number.isNaN(kc)) || (kp !== null && Number.isNaN(kp))) return setMsg('Preço de kit inválido. Use o formato 30,00.');
    setSaving(true);
    setMsg('');
    try {
      await api.put(`/events/${event.id}`, {
        title: f.title.trim(),
        description: f.description,
        eventDate: new Date(f.eventDate).toISOString(),
        eventEndDate: f.eventEndDate ? new Date(f.eventEndDate).toISOString() : null,
        location: f.location,
        city: f.city,
        state: f.state,
        modality: f.modality,
        maxParticipants: f.maxParticipants ? Number(f.maxParticipants) : null,
        price,
        rules: f.rules,
        kitDescription: f.kitDescription,
        kitCompletePrice: kc,
        kitPremiumPrice: kp,
        kitPickupLocation: f.kitPickupLocation,
        kitPickupDate: f.kitPickupDate ? new Date(f.kitPickupDate).toISOString() : null,
        routeMapUrl: f.routeMapUrl,
        meetingPoint: f.meetingPoint,
      });
      setMsg('✓ Alterações salvas');
      onSaved();
    } catch (e) {
      setMsg(errMsg(e, 'Erro ao salvar'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card p-5 space-y-3">
      <div><label className={labelCls}>Título *</label><input className={inputCls} value={f.title} onChange={set('title')} /></div>
      <div><label className={labelCls}>Descrição</label><textarea rows={4} className={inputCls} value={f.description} onChange={set('description')} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Início *</label><input type="datetime-local" className={inputCls} value={f.eventDate} onChange={set('eventDate')} /></div>
        <div><label className={labelCls}>Término</label><input type="datetime-local" className={inputCls} value={f.eventEndDate} onChange={set('eventEndDate')} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-3 md:col-span-1"><label className={labelCls}>Local</label><input className={inputCls} value={f.location} onChange={set('location')} /></div>
        <div><label className={labelCls}>Cidade</label><input className={inputCls} value={f.city} onChange={set('city')} /></div>
        <div><label className={labelCls}>UF</label><input className={inputCls} maxLength={2} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value.toUpperCase() })} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={labelCls}>Modalidade</label><input className={inputCls} placeholder="5K, 10K, Trail…" value={f.modality} onChange={set('modality')} /></div>
        <div><label className={labelCls}>Vagas (total)</label><input className={inputCls} inputMode="numeric" placeholder="ilimitado" value={f.maxParticipants} onChange={(e) => setF({ ...f, maxParticipants: e.target.value.replace(/\D/g, '') })} /></div>
        <div><label className={labelCls}>Inscrição base (R$)</label><input className={inputCls} inputMode="decimal" placeholder="0 = gratuita" value={f.price} onChange={set('price')} /></div>
      </div>
      <p className="text-[11px] text-gray-400">Preço final = preço do percurso (se definido, senão a inscrição base) + adicional do kit escolhido − cupom.</p>

      <div className="rounded-xl border border-gray-200 p-3 space-y-3">
        <p className="text-xs font-semibold text-gray-700">Kit</p>
        <div><label className={labelCls}>Descrição do kit</label><textarea rows={2} className={inputCls} value={f.kitDescription} onChange={set('kitDescription')} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Adicional Kit Completo (R$)</label><input className={inputCls} inputMode="decimal" placeholder="vazio = sem opção de kit" value={f.kitCompletePrice} onChange={set('kitCompletePrice')} /></div>
          <div><label className={labelCls}>Adicional Kit Premium (R$)</label><input className={inputCls} inputMode="decimal" placeholder="vazio = sem premium" value={f.kitPremiumPrice} onChange={set('kitPremiumPrice')} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Local de retirada</label><input className={inputCls} value={f.kitPickupLocation} onChange={set('kitPickupLocation')} /></div>
          <div><label className={labelCls}>Data/hora da retirada</label><input type="datetime-local" className={inputCls} value={f.kitPickupDate} onChange={set('kitPickupDate')} /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Ponto de encontro</label><input className={inputCls} value={f.meetingPoint} onChange={set('meetingPoint')} /></div>
        <div><label className={labelCls}>Link do mapa do percurso</label><input className={inputCls} value={f.routeMapUrl} onChange={set('routeMapUrl')} /></div>
      </div>
      <div><label className={labelCls}>Regulamento</label><textarea rows={4} className={inputCls} value={f.rules} onChange={set('rules')} /></div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50">{saving ? 'Salvando…' : 'Salvar alterações'}</button>
        {msg && <span className={`text-sm ${msg.startsWith('✓') ? 'text-emerald-700' : 'text-red-600'}`}>{msg}</span>}
      </div>
    </div>
  );
}
