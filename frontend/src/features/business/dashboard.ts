import type { DemoConnection } from './connection';
import { tariffs } from './tariffs.mjs';
import { usedBenefit } from './benefits.ts';

export function getDashboard(connection: DemoConnection | null, now = new Date()) {
  if (!connection) return null;
  const tariff = tariffs.find(item => item.id === connection.subscription.tariffId)!;
  const paid = connection.invoice.status === 'paid';
  const expired = paid && Date.parse(connection.subscription.expiresAt!) <= now.getTime();
  const status = !paid ? 'pending_payment' : expired ? 'expired' : 'active';
  const usedKopecks = usedBenefit(connection);
  const savingsKopecks = usedKopecks;
  const feeKopecks = paid ? connection.invoice.amountKopecks : 0;
  return {
    tariff,
    status,
    employees: connection.employees.filter(employee => employee.status === 'active').length,
    usedKopecks,
    availableKopecks: status === 'active' ? tariff.cap * 100 - usedKopecks : 0,
    savingsKopecks,
    feeKopecks,
    netKopecks: savingsKopecks - feeKopecks,
  };
}
