import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionKey, createConnection, parseConnection } from '../src/features/business/connection.ts';
import { addEmployee } from '../src/features/business/employees.ts';
import { setBenefitGrant } from '../src/features/business/benefits.ts';
import { payStoredInvoice } from '../src/features/business/invoices.ts';

const now = new Date('2026-11-26T12:00:00Z');
function memoryStorage(data) {
  let raw = JSON.stringify(data);
  let writes = 0;
  return {
    getItem(key) { assert.equal(key, connectionKey); return raw; },
    setItem(key, value) { assert.equal(key, connectionKey); raw = value; writes++; },
    snapshot() { return parseConnection(raw); },
    writes() { return writes; },
  };
}

test('Оплата использует свежие данные и сохраняет сотрудников и назначения', () => {
  const initial = createConnection('Демо', 'plus', now);
  let latest = addEmployee(initial, 'Анна Демо', 'company_employee', now);
  latest = setBenefitGrant(latest, { employeeId: latest.employees[0].id, code: 'shipping', limitKopecks: 10000, enabled: true });
  const storage = memoryStorage(latest);
  const paid = payStoredInvoice(initial.company.id, initial.invoice.id, storage, now);
  assert.equal(paid.invoice.status, 'paid');
  assert.equal(paid.subscription.status, 'active');
  assert.deepEqual(paid.employees, latest.employees);
  assert.deepEqual(paid.benefitGrants, latest.benefitGrants);
  assert.deepEqual(storage.snapshot(), paid);
});

test('Повторная оплата не записывает второй платёж и не продлевает период', () => {
  const data = createConnection('Демо', 'start', now);
  const storage = memoryStorage(data);
  const first = payStoredInvoice(data.company.id, data.invoice.id, storage, now);
  const repeated = payStoredInvoice(data.company.id, data.invoice.id, storage, new Date('2027-01-15T12:00:00Z'));
  assert.deepEqual(repeated, first);
  assert.equal(storage.writes(), 1);
});

test('Устаревший счёт или другая компания не оплачиваются', () => {
  const data = createConnection('Демо', 'plus', now);
  const storage = memoryStorage(data);
  assert.throws(() => payStoredInvoice(data.company.id, 'old-invoice', storage, now), /изменились/);
  assert.throws(() => payStoredInvoice('other-company', data.invoice.id, storage, now), /изменились/);
  assert.equal(storage.writes(), 0);
  assert.equal(storage.snapshot().invoice.status, 'pending');
});

test('Ошибка хранилища не выдаётся за успешную оплату', () => {
  const data = createConnection('Демо', 'start', now);
  const raw = JSON.stringify(data);
  assert.throws(() => payStoredInvoice(data.company.id, data.invoice.id, { getItem() { throw new Error('blocked'); }, setItem() {} }, now), /прочитать/);
  assert.throws(() => payStoredInvoice(data.company.id, data.invoice.id, { getItem() { return raw; }, setItem() { throw new Error('quota'); } }, now), /сохранить/);
  assert.equal(parseConnection(raw).invoice.status, 'pending');
});
