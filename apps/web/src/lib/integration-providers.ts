'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface IntegrationProviderInfo {
  provider: string;
  available: boolean;
  primary?: boolean;
  platforms: string[];
  reason?: string;
}

// Cache por carregamento de página — a disponibilidade só muda com deploy/configuração da API
let providersPromise: Promise<IntegrationProviderInfo[]> | null = null;

export function fetchIntegrationProviders(): Promise<IntegrationProviderInfo[]> {
  if (!providersPromise) {
    providersPromise = api
      .get<IntegrationProviderInfo[]>('/integrations/providers')
      .then((r) => (Array.isArray(r.data) ? r.data : []))
      .catch(() => {
        providersPromise = null; // permite nova tentativa depois
        return [];
      });
  }
  return providersPromise;
}

/**
 * true somente quando GET /integrations/providers informa o provedor como disponível.
 * Enquanto carrega ou em caso de erro, retorna false (ex.: esconde "Enviar para Garmin"
 * — a sincronização direta com o Garmin está desativada no lançamento; a Strava é a ponte).
 */
export function useProviderAvailable(provider: string, platform: string = 'web'): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    fetchIntegrationProviders().then((list) => {
      if (!active) return;
      const info = list.find((p) => p.provider === provider);
      setAvailable(!!info?.available && (!info.platforms || info.platforms.includes(platform)));
    });
    return () => {
      active = false;
    };
  }, [provider, platform]);
  return available;
}
