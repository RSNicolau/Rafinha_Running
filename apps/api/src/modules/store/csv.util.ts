/** CSV seguro para Excel/LibreOffice (separador ";", BOM UTF-8, proteção contra injeção de fórmula). */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

export function fmtBrl(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toFixed(2).replace('.', ',');
}
