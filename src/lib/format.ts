/**
 * Format a number as Indonesian Rupiah
 * e.g. 6000 → "Rp 6.000"
 */
export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Short format for display in tables
 * e.g. 6000 → "Rp 6.000"
 */
export const idr = formatIDR
