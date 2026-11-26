import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnection, payConnection } from '../src/features/business/connection.ts';
import { addEmployee, updateEmployee } from '../src/features/business/employees.ts';
import { activateBenefit, setBenefitGrant, usedBenefit } from '../src/features/business/benefits.ts';
import { getOperations } from '../src/features/business/operations.ts';

function fixture() {
  const start = new Date('2026-11-25T12:00:00Z');
  let data = payConnection(createConnection('Демо', 'plus', start), start);
  data = addEmployee(data, 'Анна Демо', 'company_employee', start);
  data = addEmployee(data, 'Иван Демо', 'company_employee', start);
  for (const employee of data.employees) data = setBenefitGrant(data, { employeeId: employee.id, code: 'shipping', enabled: true, limitKopecks: 100000 });
  const times = ['2026-11-26T20:59:59.999Z', '2026-11-26T21:00:00.000Z', '2026-11-27T20:59:59.999Z', '2026-11-27T21:00:00.000Z'];
  for (let i = 0; i < times.length; i++) {
    data = activateBenefit(data, { employeeId: data.employees[i < 2 ? 0 : 1].id, code: 'shipping', originalKopecks: 35025, requestKey: `operation-${i}` }, new Date(times[i])).connection;
  }
  return data;
}

test('Журнал согласован с расходом, сортируется от новых к старым и не меняет исходные данные', () => {
  const data = fixture();
  const original = structuredClone(data);
  const operations = getOperations(data);
  assert.equal(operations.length, 4);
  assert.equal(operations.reduce((sum, item) => sum + item.discountKopecks, 0), usedBenefit(data));
  assert.equal(operations[0].createdAt, '2026-11-27T21:00:00.000Z');
  assert.equal(operations[0].finalKopecks, 28025);
  assert.equal(operations[0].employeeName, 'Иван Демо');
  assert.deepEqual(data, original);
});

test('Диапазон дат включает оба московских дня, не соседние сутки UTC', () => {
  const data = fixture();
  const operations = getOperations(data, { from: '2026-11-27', to: '2026-11-27' });
  assert.equal(operations.length, 2);
  assert.deepEqual(operations.map(item => item.createdAt), ['2026-11-27T20:59:59.999Z', '2026-11-26T21:00:00.000Z']);
  assert.equal(getOperations(data, { to: '2026-11-26' }).length, 1);
  assert.equal(getOperations(data, { from: '2026-11-28' }).length, 1);
});

test('Фильтр сотрудника и демо-персона не открывают чужую историю', () => {
  let data = fixture();
  const [first, second] = data.employees;
  assert.equal(getOperations(data, { employeeId: first.id }).length, 2);
  assert.equal(getOperations(data, {}, { role: 'employee', employeeId: first.id }).length, 2);
  assert.deepEqual(getOperations(data, { employeeId: second.id }, { role: 'employee', employeeId: first.id }), []);
  assert.throws(() => getOperations(data, {}, { role: 'employee', employeeId: 'foreign-person' }), /этой компании/);
  data = updateEmployee(data, first.id, { status: 'disabled' });
  assert.equal(getOperations(data, { employeeId: first.id }).length, 2);
});

test('Некорректные периоды отклоняются; отсутствие результатов не меняет журнал', () => {
  const data = fixture();
  assert.throws(() => getOperations(data, { from: '2026-11-28', to: '2026-11-26' }), /не позже/);
  assert.throws(() => getOperations(data, { from: '2026-02-30' }), /корректную дату/);
  assert.deepEqual(getOperations(data, { to: '2026-11-24' }), []);
  assert.equal(data.benefitUsages.length, 4);
  const empty = createConnection('Новая демо-компания', 'plus');
  assert.deepEqual(getOperations(empty), []);
});
