import type { DemoConnection } from './connection';
import { tariffs } from './tariffs.mjs';

export type BenefitCode = 'shipping' | 'packaging';
export type BenefitGrant = { employeeId: string; code: BenefitCode; enabled: boolean; limitKopecks: number };
export type BenefitUsage = {
  id: string; requestKey: string; companyId: string; employeeId: string; code: BenefitCode;
  originalKopecks: number; discountKopecks: number; createdAt: string;
};
export const benefitCatalog = [
  { code: 'shipping' as const, title: 'Скидка на отправление', description: 'Одна скидка на одно тестовое отправление.' },
  { code: 'packaging' as const, title: 'Скидка на упаковку', description: 'Одна скидка на одну тестовую упаковку.' },
];

export function discountFor(connection: DemoConnection, code: BenefitCode) {
  const tariff = tariffs.find(item => item.id === connection.subscription.tariffId)!;
  return (code === 'shipping' ? tariff.shippingDiscount : code === 'packaging' ? tariff.packagingDiscount : 0) * 100;
}

export function usedBenefit(connection: DemoConnection, employeeId?: string, code?: BenefitCode) {
  return connection.benefitUsages.filter(usage => (!employeeId || usage.employeeId === employeeId) && (!code || usage.code === code))
    .reduce((total, usage) => total + usage.discountKopecks, 0);
}

export function setBenefitGrant(connection: DemoConnection, grant: BenefitGrant): DemoConnection {
  const employee = connection.employees.find(item => item.id === grant.employeeId && item.companyId === connection.company.id);
  if (!employee || employee.status !== 'active') throw new Error('Выберите активного сотрудника компании.');
  if (!benefitCatalog.some(item => item.code === grant.code) || discountFor(connection, grant.code) === 0) throw new Error('Преимущество не входит в тариф.');
  const cap = tariffs.find(item => item.id === connection.subscription.tariffId)!.cap * 100;
  if (!Number.isSafeInteger(grant.limitKopecks) || grant.limitKopecks < 0 || grant.limitKopecks > cap) throw new Error('Личный лимит должен быть от 0 до общего лимита компании.');
  if (typeof grant.enabled !== 'boolean') throw new Error('Укажите доступ к преимуществу.');
  if (grant.limitKopecks < usedBenefit(connection, grant.employeeId, grant.code)) throw new Error('Лимит нельзя уменьшить ниже уже использованной суммы.');
  return { ...connection, benefitGrants: [...connection.benefitGrants.filter(item => item.employeeId !== grant.employeeId || item.code !== grant.code), { ...grant }] };
}

export function activateBenefit(connection: DemoConnection, input: {
  employeeId: string; code: BenefitCode; originalKopecks: number; requestKey: string;
}, now = new Date()): { connection: DemoConnection; usage: BenefitUsage } {
  const { employeeId, code, originalKopecks, requestKey } = input;
  const employee = connection.employees.find(item => item.id === employeeId && item.companyId === connection.company.id);
  if (!employee || employee.status !== 'active') throw new Error('Сотрудник отключён или не принадлежит компании.');
  if (!requestKey.trim()) throw new Error('Не указан идентификатор операции.');
  const previous = connection.benefitUsages.find(item => item.requestKey === requestKey);
  if (previous) {
    if (previous.employeeId !== employeeId || previous.code !== code || previous.originalKopecks !== originalKopecks) throw new Error('Идентификатор уже занят другой операцией.');
    return { connection, usage: previous };
  }
  if (connection.subscription.status !== 'active' || connection.invoice.status !== 'paid') throw new Error('Сначала оплатите подписку.');
  if (now.getTime() < Date.parse(connection.subscription.startedAt!) || now.getTime() >= Date.parse(connection.subscription.expiresAt!)) throw new Error('Оплаченный период подписки не действует.');
  const discount = discountFor(connection, code);
  if (!benefitCatalog.some(item => item.code === code) || !discount) throw new Error('Преимущество не входит в тариф.');
  const grant = connection.benefitGrants.find(item => item.employeeId === employeeId && item.code === code && item.enabled);
  if (!grant) throw new Error('Администратор не назначил это преимущество сотруднику.');
  if (!Number.isSafeInteger(originalKopecks) || originalKopecks <= 0 || originalKopecks > 100000000) throw new Error('Укажите стоимость услуги больше 0 и не выше 1 000 000 ₽.');
  const applied = Math.min(discount, originalKopecks);
  if (usedBenefit(connection, employeeId, code) + applied > grant.limitKopecks) throw new Error('Недостаточно личного лимита сотрудника.');
  const cap = tariffs.find(item => item.id === connection.subscription.tariffId)!.cap * 100;
  if (usedBenefit(connection) + applied > cap) throw new Error('Недостаточно общего лимита компании.');
  const usage: BenefitUsage = { id: crypto.randomUUID(), requestKey, companyId: connection.company.id, employeeId, code, originalKopecks, discountKopecks: applied, createdAt: now.toISOString() };
  return { connection: { ...connection, benefitUsages: [...connection.benefitUsages, usage] }, usage };
}

export function validBenefits(connection: DemoConnection) {
  if (!Array.isArray(connection.benefitGrants) || !Array.isArray(connection.benefitUsages)) return false;
  const cap = tariffs.find(item => item.id === connection.subscription.tariffId)!.cap * 100;
  const employees = new Set(connection.employees.map(item => item.id));
  const grants = new Set<string>();
  for (const grant of connection.benefitGrants) {
    if (!grant || !employees.has(grant.employeeId) || !benefitCatalog.some(item => item.code === grant.code)
      || !discountFor(connection, grant.code) || typeof grant.enabled !== 'boolean'
      || !Number.isSafeInteger(grant.limitKopecks) || grant.limitKopecks < 0 || grant.limitKopecks > cap) return false;
    const key = `${grant.employeeId}:${grant.code}`;
    if (grants.has(key)) return false;
    grants.add(key);
  }
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const usage of connection.benefitUsages) {
    if (!usage || typeof usage.id !== 'string' || !usage.id || ids.has(usage.id)
      || typeof usage.requestKey !== 'string' || !usage.requestKey.trim() || keys.has(usage.requestKey)
      || usage.companyId !== connection.company.id || !employees.has(usage.employeeId)
      || !grants.has(`${usage.employeeId}:${usage.code}`) || !benefitCatalog.some(item => item.code === usage.code)
      || !discountFor(connection, usage.code) || !Number.isSafeInteger(usage.originalKopecks)
      || usage.originalKopecks <= 0 || usage.originalKopecks > 100000000
      || usage.discountKopecks !== Math.min(usage.originalKopecks, discountFor(connection, usage.code))
      || typeof usage.createdAt !== 'string' || !Number.isFinite(Date.parse(usage.createdAt))
      || connection.invoice.status !== 'paid' || Date.parse(usage.createdAt) < Date.parse(connection.subscription.startedAt!)
      || Date.parse(usage.createdAt) >= Date.parse(connection.subscription.expiresAt!)) return false;
    ids.add(usage.id); keys.add(usage.requestKey);
  }
  return usedBenefit(connection) <= cap && connection.benefitGrants.every(grant => usedBenefit(connection, grant.employeeId, grant.code) <= grant.limitKopecks);
}

export function rublesToKopecks(value: string) {
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error('Введите сумму в рублях, максимум два знака после запятой.');
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}
