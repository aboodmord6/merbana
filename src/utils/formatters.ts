export function formatCurrency(amount: number): string {
  return amount.toLocaleString('ar-SY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ل.س';
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('ar-SY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('ar-SY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
