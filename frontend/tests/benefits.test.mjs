import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnection, payConnection, parseConnection } from '../src/features/business/connection.ts';
import { addEmployee, updateEmployee } from '../src/features/business/employees.ts';
import { activateBenefit, setBenefitGrant, usedBenefit, rublesToKopecks } from '../src/features/business/benefits.ts';
import { getDashboard } from '../src/features/business/dashboard.ts';

const start = new Date('2026-11-26T12:00:00Z');
const now = new Date('2026-11-27T12:00:00Z');
function company(tariff = 'plus') {
  return addEmployee(payConnection(createConnection('Демо', tariff, start), start), 'Анна Демо', 'company_employee', start);
}
function assigned(tariff = 'plus', limitKopecks = 100000) {
  const data = company(tariff);
  return setBenefitGrant(data, { employeeId: data.employees[0].id, code: 'shipping', enabled: true, limitKopecks });
}
function use(data, key = 'request-1', price = 35000, code = 'shipping', employeeId = data.employees[0].id) {
  return activateBenefit(data, { employeeId, code, originalKopecks: price, requestKey: key }, now);
}

test('Операция меняет лимиты и экономию; повтор возвращает тот же результат без списания', () => {
  const result = use(assigned());
  assert.equal(result.usage.discountKopecks, 7000);
  assert.equal(usedBenefit(result.connection), 7000);
  const summary = getDashboard(result.connection, now);
  assert.equal(summary.availableKopecks, 393000);
  assert.equal(summary.netKopecks, -242000);
  assert.equal(use(result.connection).connection, result.connection);
  assert.equal(use(result.connection).usage.id, result.usage.id);
  assert.throws(() => use(result.connection, 'request-1', 36000), /другой операцией/);
  assert.deepEqual(parseConnection(JSON.stringify(result.connection)), result.connection);
});

test('Личный лимит запрещает списание; скидка не превосходит исходную стоимость', () => {
  assert.throws(() => use(assigned('plus', 6000)), /личного лимита/);
  const result = use(assigned('plus', 10000), 'small', 2500);
  assert.equal(result.usage.discountKopecks, 2500);
  assert.throws(() => setBenefitGrant(result.connection, { employeeId: result.usage.employeeId, code: 'shipping', enabled: true, limitKopecks: 2000 }), /уже использованной/);
});

test('Общий лимит защищает от перерасхода между сотрудниками', () => {
  let data = assigned('start', 150000);
  for (let i = 0; i < 37; i++) data = use(data, `bulk-${i}`).connection;
  data = use(data, 'last-small', 2000).connection;
  assert.equal(usedBenefit(data), 150000);
  data = addEmployee(data, 'Иван Демо', 'company_employee');
  const second = data.employees[1].id;
  data = setBenefitGrant(data, { employeeId: second, code: 'shipping', enabled: true, limitKopecks: 150000 });
  assert.throws(() => use(data, 'over-cap', 35000, 'shipping', second), /общего лимита/);
  assert.equal(data.benefitUsages.length, 38);
});

test('Без доступа, после отключения, до оплаты и после окончания подписки операция запрещена', () => {
  assert.throws(() => use(company()), /не назначил/);
  let data = assigned();
  data = updateEmployee(data, data.employees[0].id, { status: 'disabled' });
  assert.throws(() => use(data), /отключён/);
  data = assigned();
  const revoked = setBenefitGrant(data, { ...data.benefitGrants[0], enabled: false });
  assert.throws(() => use(revoked), /не назначил/);
  const pending = addEmployee(createConnection('Демо', 'plus'), 'Анна Демо', 'company_employee');
  assert.throws(() => use(pending), /оплатите/);
  assert.throws(() => activateBenefit(data, { employeeId: data.employees[0].id, code: 'shipping', originalKopecks: 35000, requestKey: 'expired' }, new Date(data.subscription.expiresAt)), /не действует/);
});

test('Start не даёт упаковку; чужие сотрудники и некорректные суммы отклоняются', () => {
  const data = assigned('start');
  assert.throws(() => setBenefitGrant(data, { employeeId: data.employees[0].id, code: 'packaging', enabled: true, limitKopecks: 10000 }), /не входит/);
  assert.throws(() => use(data, 'wrong-person', 35000, 'shipping', 'foreign'), /не принадлежит/);
  assert.throws(() => use(data, 'bad-price', 0), /стоимость/);
  assert.throws(() => use(data, 'bad-price', 1.2), /стоимость/);
  assert.equal(rublesToKopecks('350,25'), 35025);
  assert.throws(() => rublesToKopecks('-1'));
});

test('Старые сохранения мигрируют, а поддельные списания не восстанавливаются', () => {
  const old = company(); delete old.benefitGrants; delete old.benefitUsages;
  assert.deepEqual(parseConnection(JSON.stringify(old)).benefitUsages, []);
  const result = use(assigned()).connection;
  const duplicate = structuredClone(result); duplicate.benefitUsages.push(duplicate.benefitUsages[0]);
  assert.equal(parseConnection(JSON.stringify(duplicate)), null);
  const wrong = structuredClone(result); wrong.benefitUsages[0].discountKopecks = 100000;
  assert.equal(parseConnection(JSON.stringify(wrong)), null);
});

test('Контрольный сценарий архитектуры: 40 отправлений + 10 упаковок дают 710 ₽ чистой выгоды', () => {
  let data = assigned('plus', 400000);
  data = setBenefitGrant(data, { employeeId: data.employees[0].id, code: 'packaging', enabled: true, limitKopecks: 400000 });
  for (let i = 0; i < 40; i++) data = use(data, `shipping-${i}`).connection;
  for (let i = 0; i < 10; i++) data = use(data, `packaging-${i}`, 10000, 'packaging').connection;
  assert.equal(getDashboard(data, now).savingsKopecks, 320000);
  assert.equal(getDashboard(data, now).netKopecks, 71000);
  assert.deepEqual(parseConnection(JSON.stringify(data)), data);
});
