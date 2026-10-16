'use client';

import { useEffect, useState } from 'react';
import { CheckoutMethods, PaymentChoice, loadCheckoutMethods } from '../_lib/checkout';

export default function PaymentMethodPicker({
  value,
  onChange,
}: {
  value: PaymentChoice;
  onChange: (v: PaymentChoice) => void;
}) {
  const [methods, setMethods] = useState<CheckoutMethods | null>(null);

  useEffect(() => {
    loadCheckoutMethods().then((m) => {
      setMethods(m);
      // escolhe automaticamente a primeira opção disponível
      if (!m.pix && !m.boletoOrCard && m.internationalCard) onChange('INTERNATIONAL_CARD');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!methods) return <div className="h-24 rounded-xl bg-zinc-100 animate-pulse" />;

  const options: Array<{ id: PaymentChoice; label: string; hint: string; show: boolean }> = [
    { id: 'PIX', label: 'Pix', hint: 'Aprovação na hora', show: methods.pix },
    { id: 'ASAAS_INVOICE', label: 'Cartão de crédito ou boleto', hint: 'Você escolhe na fatura segura', show: methods.boletoOrCard },
    { id: 'INTERNATIONAL_CARD', label: 'Cartão internacional', hint: 'Pagamento via Stripe', show: methods.internationalCard },
  ];
  const visible = options.filter((o) => o.show);

  if (!visible.length) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Pagamentos online indisponíveis no momento. Fale com a assessoria.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {visible.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`w-full flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition ${
            value === o.id ? 'border-red-600 bg-red-50' : 'border-zinc-200 bg-white hover:border-zinc-300'
          }`}
        >
          <span>
            <span className="block text-sm font-bold text-zinc-900">{o.label}</span>
            <span className="block text-xs text-zinc-500">{o.hint}</span>
          </span>
          <span className={`h-4 w-4 rounded-full border-2 ${value === o.id ? 'border-red-600 bg-red-600' : 'border-zinc-300'}`} />
        </button>
      ))}
      {methods.fake && (
        <p className="text-[11px] text-amber-700">Modo de testes: pagamento simulado (sem gateway configurado).</p>
      )}
    </div>
  );
}
