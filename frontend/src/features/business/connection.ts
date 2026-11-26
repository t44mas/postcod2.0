import { tariffs } from './tariffs.mjs';
import { validEmployees } from './employees.ts';
import type { Employee } from './employees';

export type DemoConnection = {
  version: 1;
  company: { id: string; name: string; status: 'active' };
  employees: Employee[];
  subscription: {
    id: string;
    tariffId: string;
    status: 'pending_payment' | 'active';
    startedAt: string | null;
    expiresAt: string | null;
  };
  invoice: {
    id: string;
    amountKopecks: number;
    currency: 'RUB';
    status: 'pending' | 'paid';
    createdAt: string;
    paidAt: string | null;
  };
};

export const connectionKey = 'pochta-premium:demo-connection:v1';

export function createConnection(name: string, tariffId: string, now = new Date()): DemoConnection {
  const tariff = tariffs.find(item => item.id === tariffId);
  const companyName = name.trim();
  if (companyName.length < 2 || companyName.length > 100) throw new Error('Укажите название демо-компании: от 2 до 100 символов.');
  if (!tariff) throw new Error('Выберите доступный тариф.');
  return {
    version: 1,
    company: { id: crypto.randomUUID(), name: companyName, status: 'active' },
    employees: [],
    subscription: { id: crypto.randomUUID(), tariffId, status: 'pending_payment', startedAt: null, expiresAt: null },
    invoice: { id: crypto.randomUUID(), amountKopecks: tariff.price * 100, currency: 'RUB', status: 'pending', createdAt: now.toISOString(), paidAt: null },
  };
}

export function payConnection(connection: DemoConnection, now = new Date()): DemoConnection {
  if (connection.invoice.status === 'paid') return connection;
  // Месяц от момента оплаты, с ограничением последним днём следующего месяца.
  const end = new Date(now);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return {
    ...connection,
    subscription: { ...connection.subscription, status: 'active', startedAt: now.toISOString(), expiresAt: end.toISOString() },
    invoice: { ...connection.invoice, status: 'paid', paidAt: now.toISOString() },
  };
}

export function parseConnection(raw: string | null): DemoConnection | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as DemoConnection;
    const tariff = tariffs.find(item => item.id === data.subscription?.tariffId);
    const validDate = (date: unknown) => typeof date === 'string' && Number.isFinite(Date.parse(date));
    if (data.version !== 1 || !tariff || typeof data.company?.name !== 'string'
      || data.company.name.trim().length < 2 || data.company.name.length > 100 || data.company.status !== 'active'
      || typeof data.company.id !== 'string' || typeof data.subscription.id !== 'string' || typeof data.invoice?.id !== 'string'
      || data.invoice.amountKopecks !== tariff.price * 100 || data.invoice.currency !== 'RUB'
      || !validDate(data.invoice.createdAt)) return null;
    const pending = data.invoice.status === 'pending' && data.subscription.status === 'pending_payment'
      && data.invoice.paidAt === null && data.subscription.startedAt === null && data.subscription.expiresAt === null;
    const active = data.invoice.status === 'paid' && data.subscription.status === 'active'
      && validDate(data.invoice.paidAt) && validDate(data.subscription.startedAt) && validDate(data.subscription.expiresAt)
      && Date.parse(data.subscription.expiresAt!) > Date.parse(data.subscription.startedAt!);
    // Совместимость с демо-компаниями, сохранёнными до страницы сотрудников.
    const employees = data.employees === undefined ? [] : data.employees;
    if (!validEmployees(employees, data.company.id, tariff.employees)) return null;
    return pending || active ? { ...data, employees } : null;
  } catch { return null; }
}
