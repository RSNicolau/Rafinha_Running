'use client';

import { CONSENT_LABELS, LEGAL_ROUTES } from '@/lib/legal';

export interface ConsentState {
  terms: boolean;
  health: boolean;
  age: boolean;
  marketing: boolean;
}

export const EMPTY_CONSENT: ConsentState = { terms: false, health: false, age: false, marketing: false };

/** Todos os itens obrigatórios marcados? (saúde só é exigida para atletas) */
export function isConsentComplete(c: ConsentState, requireHealth: boolean): boolean {
  return c.terms && c.age && (!requireHealth || c.health);
}

interface Props {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  /** Exibe (e exige) o consentimento de dados de saúde — apenas atletas */
  showHealth: boolean;
  /** Exibe a pergunta de idade (18+ ou autorização do responsável) */
  showAge?: boolean;
  /** Cor de destaque do checkbox (hex) */
  accent?: string;
  /** Tema escuro (texto claro) */
  dark?: boolean;
  idPrefix?: string;
}

function Box({
  id, checked, onToggle, required, accent, dark, children, hint, highlight,
}: {
  id: string; checked: boolean; onToggle: (v: boolean) => void; required?: boolean; accent: string;
  dark?: boolean; children: React.ReactNode; hint?: string; highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl ${highlight ? 'p-3 border' : 'px-1 py-1'}`}
      style={highlight ? { borderColor: `${accent}55`, background: `${accent}0D` } : undefined}
    >
      <label htmlFor={id} className="flex items-start gap-3 cursor-pointer select-none">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          aria-required={required}
          className="mt-0.5 h-4 w-4 shrink-0 rounded cursor-pointer"
          style={{ accentColor: accent }}
        />
        <span className={`text-[13px] leading-snug ${dark ? 'text-gray-200' : 'text-gray-700'}`}>
          {children}
          {required ? (
            <span className="ml-1 font-semibold" style={{ color: accent }} aria-hidden>*</span>
          ) : null}
        </span>
      </label>
      {hint && (
        <p className={`mt-1.5 ml-7 text-[11px] leading-snug ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{hint}</p>
      )}
    </div>
  );
}

/**
 * Bloco de consentimentos LGPD — usado no cadastro (web), onboarding público e no modal de re-aceite.
 * Todos os itens começam DESMARCADOS (consentimento livre e inequívoco — art. 8º).
 */
export function ConsentCheckboxes({
  value, onChange, showHealth, showAge = true, accent = '#DC2626', dark, idPrefix = 'consent',
}: Props) {
  const set = (k: keyof ConsentState) => (v: boolean) => onChange({ ...value, [k]: v });
  const linkCls = 'underline font-medium hover:opacity-80';

  return (
    <fieldset className="space-y-2.5">
      <legend className="sr-only">Consentimentos</legend>

      <Box id={`${idPrefix}-terms`} checked={value.terms} onToggle={set('terms')} required accent={accent} dark={dark}>
        Li e aceito os{' '}
        <a href={LEGAL_ROUTES.terms} target="_blank" rel="noopener noreferrer" className={linkCls} style={{ color: accent }}>
          Termos de Uso
        </a>{' '}
        e a{' '}
        <a href={LEGAL_ROUTES.privacy} target="_blank" rel="noopener noreferrer" className={linkCls} style={{ color: accent }}>
          Política de Privacidade
        </a>
      </Box>

      {showHealth && (
        <Box
          id={`${idPrefix}-health`}
          checked={value.health}
          onToggle={set('health')}
          required
          accent={accent}
          dark={dark}
          highlight
          hint={CONSENT_LABELS.healthHint}
        >
          <strong className="font-semibold">Dados de saúde:</strong> {CONSENT_LABELS.health}
        </Box>
      )}

      {showAge && (
        <Box id={`${idPrefix}-age`} checked={value.age} onToggle={set('age')} required accent={accent} dark={dark}>
          {CONSENT_LABELS.age}
        </Box>
      )}

      <Box id={`${idPrefix}-marketing`} checked={value.marketing} onToggle={set('marketing')} accent={accent} dark={dark}>
        {CONSENT_LABELS.marketing}
      </Box>

      <p className={`text-[11px] ${dark ? 'text-gray-400' : 'text-gray-400'}`}>
        <span style={{ color: accent }}>*</span> obrigatório
      </p>
    </fieldset>
  );
}
