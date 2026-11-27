export { normalizeDishText, readDishName } from '../../../shared/dishText.mjs';

export function formatK(amount) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return 'Số tiền';
  if (Number(amount) === 0) return '0đ';
  return `${(Number(amount) / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 3 })}k`;
}
