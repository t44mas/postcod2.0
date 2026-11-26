import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnection, payConnection } from '../src/features/business/connection.ts';
import { getDashboard } from '../src/features/business/dashboard.ts';

test('До оплаты нет доступного лимита и не учитывается неоплаченная подписка', () => {
  const summary = getDashboard(createConnection('Демо', 'plus'));
  assert.equal(summary.status, 'pending_payment');
  assert.equal(summary.availableKopecks, 0);
  assert.equal(summary.feeKopecks, 0);
  assert.equal(summary.netKopecks, 0);
  assert.equal(getDashboard(null), null);
});

test('Оплаченная подписка даёт лимит; нулевая активность означает отрицательную выгоду', () => {
  const paid = payConnection(createConnection('Демо', 'plus'), new Date('2026-11-26T12:00:00Z'));
  const summary = getDashboard(paid, new Date('2026-11-27T12:00:00Z'));
  assert.equal(summary.status, 'active');
  assert.equal(summary.availableKopecks, 400000);
  assert.equal(summary.netKopecks, -249000);
  assert.equal(summary.employees, 0);
});

test('В момент окончания периода лимит становится недоступен, история оплаты сохраняется', () => {
  const paid = payConnection(createConnection('Демо', 'start'), new Date('2026-11-26T12:00:00Z'));
  const summary = getDashboard(paid, new Date(paid.subscription.expiresAt));
  assert.equal(summary.status, 'expired');
  assert.equal(summary.availableKopecks, 0);
  assert.equal(summary.feeKopecks, 99000);
  assert.equal(summary.netKopecks, -99000);
});
