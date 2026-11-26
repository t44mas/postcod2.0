import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnection, payConnection } from '../src/features/business/connection.ts';
import { addEmployee, updateEmployee } from '../src/features/business/employees.ts';
import { activateBenefit, setBenefitGrant } from '../src/features/business/benefits.ts';
import { getDashboard } from '../src/features/business/dashboard.ts';
import { getOperations } from '../src/features/business/operations.ts';
import { getCompanyReport } from '../src/features/business/reports.ts';

const start = new Date('2026-11-25T12:00:00Z');
const now = new Date('2026-11-28T12:00:00Z');
function base() {
  let data = payConnection(createConnection('Демо', 'plus', start), start);
  data = addEmployee(data, 'Анна Демо', 'company_employee', start);
  data = addEmployee(data, 'Иван Демо', 'company_employee', start);
  for (const employee of data.employees) {
    for (const code of ['shipping', 'packaging']) data = setBenefitGrant(data, { employeeId: employee.id, code, enabled: true, limitKopecks: 400000 });
  }
  return data;
}
function fixture() {
  let data = base();
  const inputs = [
    [0, 'shipping', 35025, '2026-11-26T20:59:59.999Z'],
    [0, 'packaging', 10000, '2026-11-26T21:00:00.000Z'],
    [1, 'shipping', 2500, '2026-11-27T10:00:00.000Z'],
  ];
  for (const [index, code, originalKopecks, time] of inputs) data = activateBenefit(data, { employeeId: data.employees[index].id, code, originalKopecks, requestKey: time }, new Date(time)).connection;
  return updateEmployee(data, data.employees[1].id, { status: 'disabled' });
}

test('Отчёт, группы и журнал согласованы; отключённый сотрудник не теряет историю', () => {
  const data = fixture();
  const saved = structuredClone(data);
  const report = getCompanyReport(data, {}, 'admin', now);
  assert.deepEqual(report.operations, getOperations(data));
  assert.deepEqual(report.subscription, getDashboard(data, now));
  assert.equal(report.selected.count, 3);
  assert.equal(report.selected.savingsKopecks, 13500);
  assert.equal(report.selected.originalKopecks - report.selected.savingsKopecks, report.selected.finalKopecks);
  assert.equal(report.employees.reduce((sum, item) => sum + item.savingsKopecks, 0), 13500);
  assert.equal(report.categories.reduce((sum, item) => sum + item.savingsKopecks, 0), 13500);
  assert.equal(report.employees.find(item => item.name === 'Иван Демо').savingsKopecks, 2500);
  assert.deepEqual(data, saved);
});

test('Фильтры меняют детализацию, не подменяя плату и общую выгоду компании', () => {
  const data = fixture();
  const whole = getCompanyReport(data, {}, 'admin', now);
  const filtered = getCompanyReport(data, { employeeId: data.employees[0].id, from: '2026-11-27', to: '2026-11-27' }, 'admin', now);
  assert.equal(filtered.selected.count, 1);
  assert.equal(filtered.selected.savingsKopecks, 4000);
  assert.deepEqual(filtered.subscription, whole.subscription);
  assert.equal(filtered.subscription.feeKopecks, 249000);
  const empty = getCompanyReport(data, { from: '2027-01-01' }, 'admin', now);
  assert.equal(empty.selected.count, 0);
  assert.deepEqual(empty.employees, []);
  assert.deepEqual(empty.subscription, whole.subscription);
});

test('Неоплаченная, оплаченная без операций и истёкшая подписки считаются честно', () => {
  const pending = createConnection('Демо', 'plus', start);
  assert.equal(getCompanyReport(pending).subscription.netKopecks, 0);
  const paid = payConnection(pending, start);
  const report = getCompanyReport(paid, {}, 'admin', now);
  assert.equal(report.selected.count, 0);
  assert.equal(report.subscription.netKopecks, -249000);
  const expired = getCompanyReport(fixture(), {}, 'admin', new Date('2027-01-01T12:00:00Z'));
  assert.equal(expired.subscription.availableKopecks, 0);
  assert.equal(expired.subscription.feeKopecks, 249000);
  assert.equal(expired.selected.count, 3);
});

test('Сотрудник не получает корпоративный отчёт; неверные даты отклоняются', () => {
  const data = fixture();
  assert.throws(() => getCompanyReport(data, {}, 'employee', now), /только администратору/);
  assert.throws(() => getCompanyReport(data, { from: '2026-11-29', to: '2026-11-26' }), /не позже/);
  assert.throws(() => getCompanyReport(data, { from: '2026-02-30' }), /корректную дату/);
});

test('Контрольный пример архитектуры: отчёт показывает 3 200 ₽ скидок, 2 490 ₽ платы и 710 ₽ выгоды', () => {
  let data = base();
  for (let i = 0; i < 50; i++) data = activateBenefit(data, { employeeId: data.employees[0].id, code: i < 40 ? 'shipping' : 'packaging', originalKopecks: 35000, requestKey: `control-${i}` }, now).connection;
  const report = getCompanyReport(data, {}, 'admin', now);
  assert.equal(report.subscription.savingsKopecks, 320000);
  assert.equal(report.subscription.feeKopecks, 249000);
  assert.equal(report.subscription.netKopecks, 71000);
  assert.equal(report.selected.savingsKopecks, 320000);
  assert.equal(report.categories.length, 2);
});
