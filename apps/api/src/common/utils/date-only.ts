import { BadRequestException } from '@nestjs/common';
/**
 * Datas "de calendário" (início/fim de planilha, dia do treino, data da avaliação) são gravadas como
 * 12:00 UTC do dia escolhido. Assim, exibidas em America/Sao_Paulo (UTC-3) continuam no MESMO dia
 * (antes: 00:00 UTC virava 21:00 do dia anterior em BRT).
 */
export const APP_TIMEZONE = 'America/Sao_Paulo';

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Dia de calendário (YYYY-MM-DD) de um instante no fuso da aplicação. */
export function calendarDayInTz(date: Date, timeZone = APP_TIMEZONE): string {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/**
 * Converte 'YYYY-MM-DD' (ou ISO com hora / Date) em Date às 12:00 UTC do dia de calendário correspondente.
 * Para entradas com hora, o dia considerado é o do fuso America/Sao_Paulo.
 */
export function toCalendarDate(input: string | Date): Date {
  let ymd: string;
  if (typeof input === 'string' && DATE_ONLY_RE.test(input.trim())) {
    ymd = input.trim();
  } else {
    const d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) throw new BadRequestException('Data inválida');
    ymd = calendarDayInTz(d);
  }
  const [, y, m, d] = DATE_ONLY_RE.exec(ymd)!;
  return new Date(Date.UTC(+y, +m - 1, +d, 12, 0, 0));
}

/** Soma `days` dias a uma data de calendário (mantém 12:00 UTC). */
export function addCalendarDays(date: Date, days: number): Date {
  const out = new Date(date.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}
