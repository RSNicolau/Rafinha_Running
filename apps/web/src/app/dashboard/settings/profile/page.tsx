'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
}

type FeedbackState = { type: 'success' | 'error'; message: string } | null;

export default function ProfileUploadPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [bannerUrl, setBannerUrl] = useState<string>('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get<UserProfile>('/users/me')
      .then(({ data }) => {
        setProfile(data);
        if (data.avatarUrl) setAvatarUrl(data.avatarUrl);
        if (data.bannerUrl) setBannerUrl(data.bannerUrl);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setFeedback(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAvatarUrl(data.avatarUrl);
      setFeedback({ type: 'success', message: 'Foto de perfil atualizada com sucesso.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.response?.data?.message || 'Erro ao fazer upload da foto.' });
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBanner(true);
    setFeedback(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/users/me/banner', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setBannerUrl(data.bannerUrl);
      setFeedback({ type: 'success', message: 'Banner de perfil atualizado com sucesso.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.response?.data?.message || 'Erro ao fazer upload do banner.' });
    } finally {
      setUploadingBanner(false);
      e.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl animate-pulse space-y-4">
        <div className="h-48 bg-gray-100 rounded-2xl" />
        <div className="h-24 bg-gray-100 rounded-2xl" />
      </div>
    );
  }

  const displayInitial = (profile?.name || 'U').charAt(0).toUpperCase();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Foto e Banner de Perfil</h1>
        <p className="text-sm text-gray-500 mt-1">Personalize sua foto e imagem de capa</p>
      </div>

      {feedback && (
        <div
          className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-red-50 text-red-700 border border-red-100'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="max-w-2xl space-y-6">
        {/* Banner */}
        <div className="glass-card overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Banner de Perfil</h2>
            <p className="text-xs text-gray-400 mt-0.5">Imagem de capa exibida no seu perfil (proporção 4:1 recomendada)</p>
          </div>

          {/* Banner preview */}
          <div
            className="relative h-48 bg-gradient-to-br from-primary/20 via-red-50 to-orange-50 cursor-pointer group overflow-hidden"
            onClick={() => bannerInputRef.current?.click()}
          >
            {bannerUrl ? (
              <img src={bannerUrl} alt="Banner de perfil" className="w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <svg className="w-10 h-10 text-primary/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
                <p className="text-xs text-primary/40 font-medium">Clique para enviar banner</p>
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
              {uploadingBanner ? (
                <div className="w-8 h-8 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <div className="bg-black/50 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <span className="text-white text-sm font-medium">
                    {bannerUrl ? 'Alterar banner' : 'Enviar banner'}
                  </span>
                </div>
              )}
            </div>
            <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
          </div>

          <div className="p-4">
            <button
              onClick={() => bannerInputRef.current?.click()}
              disabled={uploadingBanner}
              className="px-4 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 disabled:opacity-60 rounded-xl transition cursor-pointer"
            >
              {uploadingBanner ? 'Enviando...' : bannerUrl ? 'Trocar banner' : 'Enviar banner'}
            </button>
            <p className="text-xs text-gray-400 mt-2">PNG, JPG ou WebP. Tamanho máximo: 10MB.</p>
          </div>
        </div>

        {/* Avatar */}
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Foto de Perfil</h2>
          <p className="text-xs text-gray-400 mb-5">Exibida em todos os lugares do app (quadrada, recomendado 400x400px)</p>

          <div className="flex items-center gap-6">
            {/* Avatar preview */}
            <div
              className="relative w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center cursor-pointer group overflow-hidden border-4 border-white shadow-lg shrink-0"
              onClick={() => avatarInputRef.current?.click()}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={profile?.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-primary">{displayInitial}</span>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100">
                {uploadingAvatar ? (
                  <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                  </svg>
                )}
              </div>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>

            <div className="space-y-2">
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="block px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl transition cursor-pointer"
              >
                {uploadingAvatar ? 'Enviando...' : avatarUrl ? 'Trocar foto' : 'Enviar foto'}
              </button>
              <p className="text-xs text-gray-400">PNG, JPG ou WebP. Máximo 5MB.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
