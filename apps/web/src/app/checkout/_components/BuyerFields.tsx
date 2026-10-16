'use client';

import { CheckoutBuyer, maskCpf, maskPhone } from '../_lib/checkout';

const input =
  'w-full border border-zinc-200 rounded-xl px-4 py-2.5 text-sm outline-none text-zinc-900 bg-white focus:border-red-400 focus:ring-2 focus:ring-red-100';

/** Campos do comprador. O CPF é usado só para emitir a cobrança (não fica salvo na plataforma). */
export default function BuyerFields({
  value,
  onChange,
  lockIdentity = false,
  hideCpf = false,
}: {
  value: CheckoutBuyer;
  onChange: (v: CheckoutBuyer) => void;
  lockIdentity?: boolean;
  /** Sem cobrança (total R$ 0): o CPF não é pedido */
  hideCpf?: boolean;
}) {
  const set = (k: keyof CheckoutBuyer, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      <input
        className={input}
        placeholder="Nome completo *"
        autoComplete="name"
        value={value.name}
        readOnly={lockIdentity}
        onChange={(e) => set('name', e.target.value)}
      />
      <input
        className={input}
        placeholder="E-mail *"
        type="email"
        autoComplete="email"
        value={value.email}
        readOnly={lockIdentity}
        onChange={(e) => set('email', e.target.value)}
      />
      <div className={hideCpf ? '' : 'grid grid-cols-2 gap-3'}>
        {!hideCpf && <input
          className={input}
          placeholder="CPF *"
          inputMode="numeric"
          value={value.cpf}
          onChange={(e) => set('cpf', maskCpf(e.target.value))}
        />}
        <input
          className={input}
          placeholder="WhatsApp"
          inputMode="tel"
          autoComplete="tel"
          value={value.phone ?? ''}
          onChange={(e) => set('phone', maskPhone(e.target.value))}
        />
      </div>
      {!hideCpf && <p className="text-[11px] text-zinc-500">
        🔒 O CPF é exigido pelo banco para emitir a cobrança e não fica armazenado na plataforma.
      </p>}
      <p className="text-[11px] text-zinc-500">
        Ao continuar, você concorda com os{' '}
        <a href="/termos" target="_blank" rel="noopener noreferrer" className="underline">Termos de Uso</a> e a{' '}
        <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline">Política de Privacidade</a>.
        Compras online podem ser canceladas em até 7 dias (CDC, art. 49).
      </p>
    </div>
  );
}
