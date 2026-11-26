import type { DemoConnection } from './connection';
import { tariffs } from './tariffs.mjs';

export function getDashboard(connection: DemoConnection | null, now = new Date()) {
  if (!connection) return null;
  const tariff = tariffs.find(item => item.id === connection.subscription.tariffId)!;
  const paid = connection.invoice.status === 'paid';
  const expired = paid && Date.parse(connection.subscription.expiresAt!) <= now.getTime();
  const status = !paid ? 'pending_payment' : expired ? 'expired' : 'active';
  // Новая компания начинает с нулевой активности. Сотрудники и операции
  // будут подключены на своих этапах; показатели не подменяются демо-числами.
  const usedKopecks = 0;
  const savingsKopecks = 0;
  const feeKopecks = paid ? connection.invoice.amountKopecks : 0;
  return {
    tariff,
    status,
    employees: 0,
    usedKopecks,
    availableKopecks: status === 'active' ? tariff.cap * 100 - usedKopecks : 0,
    savingsKopecks,
    feeKopecks,
    netKopecks: savingsKopecks - feeKopecks,
  };
}
