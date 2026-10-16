import { api } from '@/lib/api';

export const fmtBRL = (c: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((c ?? 0) / 100);

export const errMsg = (e: any, fallback: string) => {
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(' · ') : m || fallback;
};

export const REG_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Aguardando pagamento', cls: 'bg-amber-50 text-amber-700' },
  CONFIRMED: { label: 'Confirmada', cls: 'bg-emerald-50 text-emerald-700' },
  CHECKED_IN: { label: 'Presente', cls: 'bg-blue-50 text-blue-700' },
  WAITLIST: { label: 'Lista de espera', cls: 'bg-gray-100 text-gray-600' },
  CANCELED: { label: 'Cancelada', cls: 'bg-red-50 text-red-500' },
  ABSENT: { label: 'Ausente', cls: 'bg-red-50 text-red-600' },
};

export const PAY_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Pendente', cls: 'text-amber-700' },
  SUCCEEDED: { label: 'Pago', cls: 'text-emerald-700' },
  FAILED: { label: 'Não pago', cls: 'text-red-600' },
  REFUNDED: { label: 'Estornado', cls: 'text-gray-500' },
};

export async function downloadCsv(url: string, filename: string) {
  const res = await api.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(blobUrl);
}

export const inputCls =
  'w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20';
export const labelCls = 'block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider';
