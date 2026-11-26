import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionKey, parseConnection } from '../src/features/business/connection.ts';
import { createStoredConnection, resetStoredConnection } from '../src/features/business/demoStorage.ts';
import { payStoredInvoice } from '../src/features/business/invoices.ts';
import { addEmployee, updateEmployee } from '../src/features/business/employees.ts';
import { setBenefitGrant, activateBenefit } from '../src/features/business/benefits.ts';
import { getDashboard } from '../src/features/business/dashboard.ts';
import { getOperations } from '../src/features/business/operations.ts';
import { getCompanyReport } from '../src/features/business/reports.ts';

const now = new Date('2026-11-26T12:00:00Z');
function storageFixture() {
  const values = new Map([['unrelated-demo-setting', 'keep']]);
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
  const read = () => parseConnection(storage.getItem(connectionKey));
  const save = action => {
    const next = action(read());
    storage.setItem(connectionKey, JSON.stringify(next));
    const restored = read();
    assert.ok(restored, 'Результат должен восстанавливаться после каждого сохранения');
    return restored;
  };
  return { storage, read, save };
}

for (const tariffId of ['start', 'plus']) {
  test(`Сквозной сценарий ${tariffId}: счёт → оплата → сотрудники → бонус → журнал → отчёт → сброс`, () => {
    const { storage, read, save } = storageFixture();
    const initial = createStoredConnection('ООО Сквозной Тест', tariffId, storage, now);
    assert.equal(read().invoice.status, 'pending');
    assert.equal(getDashboard(read(), now).availableKopecks, 0);
    payStoredInvoice(initial.company.id, initial.invoice.id, storage, now);
    assert.equal(read().subscription.status, 'active');
    save(data => addEmployee(data, 'Анна Демо', 'company_employee', now));
    save(data => addEmployee(data, 'Иван Демо', 'company_admin', now));
    const [first, second] = read().employees;
    const unitDiscount = tariffId === 'plus' ? 7000 : 4000;
    save(data => setBenefitGrant(data, { employeeId: first.id, code: 'shipping', enabled: true, limitKopecks: unitDiscount * 2 }));
    const use = (data, key, code = 'shipping') => activateBenefit(data, { employeeId: first.id, code, originalKopecks: 35025, requestKey: key }, now);
    save(data => use(data, 'first').connection);
    save(data => use(data, 'second').connection);
    const before = storage.getItem(connectionKey);
    assert.throws(() => use(read(), 'over-personal'), /личного лимита/);
    assert.equal(storage.getItem(connectionKey), before);
    save(data => use(data, 'first').connection);
    assert.equal(read().benefitUsages.length, 2);
    save(data => updateEmployee(data, first.id, { status: 'disabled' }));
    assert.throws(() => use(read(), 'disabled'), /отключён/);
    save(data => updateEmployee(data, first.id, { status: 'active' }));

    if (tariffId === 'plus') {
      save(data => setBenefitGrant(data, { employeeId: first.id, code: 'shipping', enabled: true, limitKopecks: 400000 }));
      save(data => setBenefitGrant(data, { employeeId: first.id, code: 'packaging', enabled: true, limitKopecks: 400000 }));
      for (let i = 2; i < 40; i++) save(data => use(data, `shipping-${i}`).connection);
      for (let i = 0; i < 10; i++) save(data => use(data, `packaging-${i}`, 'packaging').connection);
    }
    const final = read();
    const report = getCompanyReport(final, {}, 'admin', now);
    const dashboard = getDashboard(final, now);
    const journal = getOperations(final);
    assert.deepEqual(report.subscription, dashboard);
    assert.equal(report.selected.count, tariffId === 'plus' ? 50 : 2);
    assert.equal(journal.reduce((sum, item) => sum + item.discountKopecks, 0), dashboard.usedKopecks);
    assert.equal(report.subscription.netKopecks, tariffId === 'plus' ? 71000 : -91000);
    assert.equal(getOperations(final, {}, { role: 'employee', employeeId: second.id }).length, 0);
    assert.throws(() => getCompanyReport(final, {}, 'employee', now), /только администратору/);
    const expires = final.subscription.expiresAt;
    payStoredInvoice(final.company.id, final.invoice.id, storage, new Date(expires));
    assert.equal(read().subscription.expiresAt, expires);
    assert.equal(read().benefitUsages.length, journal.length);
    assert.throws(() => activateBenefit(read(), { employeeId: first.id, code: 'shipping', originalKopecks: 35025, requestKey: 'expired' }, new Date(expires)), /не действует/);

    resetStoredConnection(final.company.id, storage);
    assert.equal(read(), null);
    assert.equal(storage.getItem('unrelated-demo-setting'), 'keep');
    const fresh = createStoredConnection('Новое демо', tariffId, storage, now);
    assert.notEqual(fresh.company.id, final.company.id);
    assert.deepEqual(fresh.employees, []);
    assert.deepEqual(fresh.benefitGrants, []);
    assert.deepEqual(fresh.benefitUsages, []);
  });
}

test('Устаревшие создание и сброс не затирают новую компанию другой вкладки', () => {
  const { storage, read } = storageFixture();
  const first = createStoredConnection('Первое демо', 'start', storage, now);
  assert.throws(() => createStoredConnection('Другое демо', 'plus', storage, now), /другой вкладке/);
  assert.equal(read().company.id, first.company.id);
  resetStoredConnection(first.company.id, storage);
  const second = createStoredConnection('Второе демо', 'plus', storage, now);
  assert.throws(() => resetStoredConnection(first.company.id, storage), /изменилась/);
  assert.throws(() => resetStoredConnection(null, storage), /изменилась/);
  assert.equal(read().company.id, second.company.id);
});

test('Повреждённые данные не перезаписываются созданием и сбрасываются отдельно', () => {
  const { storage, read } = storageFixture();
  storage.setItem(connectionKey, '{broken');
  assert.throws(() => createStoredConnection('Новое демо', 'plus', storage, now), /повреждены/);
  assert.equal(storage.getItem(connectionKey), '{broken');
  resetStoredConnection(null, storage);
  createStoredConnection('Восстановленное демо', 'plus', storage, now);
  assert.equal(read().company.name, 'Восстановленное демо');
  assert.equal(storage.getItem('unrelated-demo-setting'), 'keep');
});
