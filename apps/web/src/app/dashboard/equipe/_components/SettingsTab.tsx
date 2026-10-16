'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { apiError, btnPrimary, inputCls, labelCls, type ActiveTeamDetails } from './shared';

interface Props {
  team: ActiveTeamDetails;
  isOwner: boolean;
  onSaved: () => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function SettingsTab({ team, isOwner, onSaved }: Props) {
  const [name, setName] = useState(team.name);
  const [logoUrl, setLogoUrl] = useState(team.logoUrl ?? '');
  const [primaryColor, setPrimaryColor] = useState(team.primaryColor ?? '#DC2626');
  const [city, setCity] = useState(team.city ?? '');
  const [graceDays, setGraceDays] = useState(String(team.graceDays ?? 5));
  const [walletId, setWalletId] = useState(team.asaasWalletId ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // B9: upload validado no servidor (conteúdo real da imagem) — grava o logo da equipe na hora
  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/teams/me/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setLogoUrl(data?.logoUrl ?? '');
      toast.success('Logo atualizado');
      onSaved();
    } catch (err) {
      toast.error(apiError(err, 'Não foi possível enviar o logo'));
    } finally {
      setUploading(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const grace = parseInt(graceDays, 10);
    const cleanName = name.trim().replace(/\s+/g, ' ');
    if (cleanName.length < 2 || cleanName.length > 80) { toast.error('O nome da equipe precisa ter entre 2 e 80 caracteres'); return; }
    if (!Number.isInteger(grace) || grace < 0 || grace > 30) { toast.error('Dias de tolerância: entre 0 e 30'); return; }
    if (logoUrl.trim() && !/^(https?:\/\/|\/)/i.test(logoUrl.trim())) { toast.error('URL do logo inválida'); return; }
    if (isOwner && walletId.trim() && !UUID_RE.test(walletId.trim())) {
      toast.error('ID da carteira Asaas inválido (formato UUID, ex.: 0b9f7a0e-2c4d-4e8b-9f61-1a2b3c4d5e6f)');
      return;
    }
    const payload: Record<string, any> = {
      name: cleanName,
      logoUrl: logoUrl.trim() || null,
      primaryColor: primaryColor || null,
      city: city.trim() || null,
      graceDays: grace,
    };
    if (isOwner && walletId.trim() !== (team.asaasWalletId ?? '')) payload.asaasWalletId = walletId.trim() || null;
    setSaving(true);
    try {
      await api.put('/teams/me', payload);
      toast.success('Configurações da equipe salvas');
      onSaved();
    } catch (err) {
      toast.error(apiError(err, 'Não foi possível salvar'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="glass-card p-6 space-y-5 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="s-name">Nome da equipe *</label>
          <input id="s-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={inputCls} />
          <p className="text-xs text-gray-400 mt-1">
            Endereços públicos:{' '}
            <a href={`/loja/${team.slug}`} target="_blank" rel="noopener noreferrer" className="underline">loja (/loja/{team.slug})</a>
            {' · '}
            <a href={`/onboarding/${team.slug}`} target="_blank" rel="noopener noreferrer" className="underline">cadastro de alunos (/onboarding/{team.slug})</a>
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="s-logo">Logo</label>
          <div className="flex items-center gap-3">
            {logoUrl && <img src={logoUrl} alt="Logo da equipe" className="w-12 h-12 rounded-xl object-contain bg-gray-50 border border-gray-100" />}
            <label className={`${btnPrimary} cursor-pointer whitespace-nowrap`}>
              {uploading ? 'Enviando…' : 'Enviar imagem'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ''; }} />
            </label>
            <input id="s-logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="ou cole a URL https://..." className={inputCls} />
          </div>
          <p className="text-xs text-gray-400 mt-1">PNG, JPG ou WebP até 5 MB. Aparece no painel e na loja da equipe.</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="s-color">Cor principal</label>
          <input id="s-color" type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-full h-9 px-1 py-1 border border-gray-200 rounded-xl cursor-pointer" />
        </div>
        <div>
          <label className={labelCls} htmlFor="s-city">Cidade</label>
          <input id="s-city" value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} placeholder="Ex.: Niterói - RJ" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="s-grace">Dias de tolerância da mensalidade</label>
          <input id="s-grace" type="number" min={0} max={30} value={graceDays} onChange={(e) => setGraceDays(e.target.value)} className={inputCls} />
          <p className="text-xs text-gray-400 mt-1">Dias após o vencimento até a mensalidade ficar “em atraso” (0 a 30).</p>
        </div>
      </div>

      {isOwner && (
        <div className="pt-4 border-t border-gray-100">
          <label className={labelCls} htmlFor="s-wallet">ID da carteira Asaas</label>
          <input
            id="s-wallet"
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            className={`${inputCls} font-mono`}
            autoComplete="off"
          />
          <p className="text-xs text-gray-500 mt-1">ID da carteira Asaas da equipe para receber as mensalidades e vendas</p>
          {typeof team.platformFeePercent === 'number' && (
            <p className="text-xs text-gray-400 mt-1">Taxa da plataforma: {team.platformFeePercent.toLocaleString('pt-BR')}% (definida pela plataforma)</p>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Salvando...' : 'Salvar configurações'}</button>
      </div>
    </form>
  );
}
