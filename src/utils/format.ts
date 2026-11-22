// Shared formatting helpers

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
};

export function formatPrice(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}

/**
 * Normalize a service name for exact-match dedup during scans.
 * Lowercases, trims, collapses whitespace, and strips trailing punctuation
 * so "Netflix ", "netflix" and "Netflix." merge, but "Paramount" and
 * "Paramount+" stay distinct.
 */
export function normalizeServiceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/, '')
    .trim();
}
