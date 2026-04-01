/**
 * Format amount in cents to BRL currency string
 */
export function formatBRL(amountInCents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amountInCents / 100);
}

/**
 * Format plain number in BRL
 */
export function formatBRLFromValue(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}
