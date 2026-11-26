import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnection, payConnection, parseConnection } from '../src/features/business/connection.ts';

test('Выбранный тариф фиксирует сумму счёта в копейках', () => {
  const connection = createConnection('ООО Демо Маркет', 'start');
  assert.equal(connection.invoice.amountKopecks, 99000);
  assert.equal(connection.invoice.status, 'pending');
  assert.equal(connection.subscription.status, 'pending_payment');
  assert.deepEqual(parseConnection(JSON.stringify(connection)), connection);
});

test('Демо-оплата активирует подписку; повтор не продлевает её', () => {
  const connection = createConnection('ООО Демо Маркет', 'plus');
  const paid = payConnection(connection, new Date('2026-01-31T12:00:00Z'));
  assert.equal(paid.invoice.status, 'paid');
  assert.equal(paid.subscription.status, 'active');
  assert.equal(paid.subscription.expiresAt, '2026-02-28T12:00:00.000Z');
  assert.equal(payConnection(paid, new Date('2026-02-10T12:00:00Z')), paid);
  assert.deepEqual(parseConnection(JSON.stringify(paid)), paid);
});

test('Некорректные данные не создают компанию и не восстанавливаются как оплаченные', () => {
  assert.throws(() => createConnection(' ', 'plus'));
  assert.throws(() => createConnection('Демо', 'unknown'));
  assert.equal(parseConnection('invalid'), null);
  const connection = createConnection('Демо', 'plus');
  connection.invoice.status = 'paid';
  assert.equal(parseConnection(JSON.stringify(connection)), null);
});
