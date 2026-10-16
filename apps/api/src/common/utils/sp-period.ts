/**
 * Limites de período no fuso de São Paulo (America/Sao_Paulo), devolvidos como instantes UTC.
 * As colunas DateTime do Prisma guardam UTC; usar estes instantes para filtrar "esta semana",
 * "este mês" etc. como o atleta brasileiro enxerga (semana começa na SEGUNDA-feira).
 */
export const SP_TZ = 'America/Sao_Paulo';

/** Diferença (ms) entre o relógio local do fuso e o UTC no instante dado (SP: -3h). */
export function tzOffsetMs(date: Date, timeZone = SP_TZ): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Data local (ano, mês 1-12, dia, dia da semana 0=domingo) no fuso. */
export function localDateParts(date: Date, timeZone = SP_TZ) {
  const local = new Date(date.getTime() + tzOffsetMs(date, timeZone));
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    weekday: local.getUTCDay(),
  };
}

/** Instante UTC correspondente à meia-noite local (y-m-d) no fuso. */
export function localMidnight(year: number, month: number, day: number, timeZone = SP_TZ): Date {
  const guess = new Date(Date.UTC(year, month - 1, day));
  const offset = tzOffsetMs(guess, timeZone);
  const result = new Date(guess.getTime() - offset);
  // Corrige caso o offset mude entre o palpite e o resultado (horário de verão)
  const offset2 = tzOffsetMs(result, timeZone);
  return offset2 === offset ? result : new Date(guess.getTime() - offset2);
}

export type PeriodUnit = 'day' | 'week' | 'month' | 'year';

/** Início do período corrente (semana = segunda-feira 00:00) no fuso de SP. */
export function startOfPeriod(unit: PeriodUnit, now: Date = new Date(), timeZone = SP_TZ): Date {
  const { year, month, day, weekday } = localDateParts(now, timeZone);
  switch (unit) {
    case 'day':
      return localMidnight(year, month, day, timeZone);
    case 'week': {
      const diff = (weekday + 6) % 7; // dias desde segunda
      const monday = new Date(Date.UTC(year, month - 1, day - diff));
      return localMidnight(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), timeZone);
    }
    case 'month':
      return localMidnight(year, month, 1, timeZone);
    case 'year':
      return localMidnight(year, 1, 1, timeZone);
  }
}

/** Fim (exclusivo) do período corrente. */
export function endOfPeriod(unit: PeriodUnit, now: Date = new Date(), timeZone = SP_TZ): Date {
  const start = startOfPeriod(unit, now, timeZone);
  const { year, month, day } = localDateParts(start, timeZone);
  switch (unit) {
    case 'day':
      return localMidnight(year, month, day + 1, timeZone);
    case 'week': {
      const d = new Date(Date.UTC(year, month - 1, day + 7));
      return localMidnight(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), timeZone);
    }
    case 'month': {
      const d = new Date(Date.UTC(year, month, 1));
      return localMidnight(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, timeZone);
    }
    case 'year':
      return localMidnight(year + 1, 1, 1, timeZone);
  }
}
