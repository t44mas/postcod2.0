// Все цены и преимущества — модельные допущения архитектуры MVP.
export const tariffs = [
  { id: 'start', name: 'Business Start', price: 990, employees: 10, cap: 1500, shippingDiscount: 40, packagingDiscount: 0, description: 'Для небольших команд и первых отправлений', reporting: 'Базовая отчётность' },
  { id: 'plus', name: 'Business Plus', price: 2490, employees: 30, cap: 4000, shippingDiscount: 70, packagingDiscount: 40, description: 'Для растущего бизнеса с регулярной доставкой', reporting: 'Расширенная отчётность' },
];

/** @param {typeof tariffs[number]} tariff @param {number} shipments @param {number} packages */
export function estimateSavings(tariff, shipments, packages) {
  const quantity = (/** @type {number} */ value) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const gross = quantity(shipments) * tariff.shippingDiscount + quantity(packages) * tariff.packagingDiscount;
  const applied = Math.min(gross, tariff.cap);
  return { gross, applied, net: applied - tariff.price, capped: gross > tariff.cap };
}
