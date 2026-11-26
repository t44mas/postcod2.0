import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnection, parseConnection } from '../src/features/business/connection.ts';
import { addEmployee, updateEmployee } from '../src/features/business/employees.ts';
import { getDashboard } from '../src/features/business/dashboard.ts';

test('Старые компании мигрируют без потери счёта; сотрудники сохраняются в компании', () => {
  const old = createConnection('Демо', 'plus');
  delete old.employees;
  const migrated = parseConnection(JSON.stringify(old));
  assert.deepEqual(migrated.employees, []);
  assert.equal(migrated.invoice.id, old.invoice.id);
  const updated = addEmployee(migrated, '  Анна   Демо ', 'company_employee');
  assert.equal(updated.employees[0].name, 'Анна Демо');
  assert.equal(updated.employees[0].companyId, updated.company.id);
  assert.deepEqual(parseConnection(JSON.stringify(updated)), updated);
  assert.equal(getDashboard(updated).employees, 1);
});

test('Роли и отключение сохраняются, отключённые не занимают активные места', () => {
  const company = addEmployee(createConnection('Демо', 'start'), 'Иван Демо', 'company_employee');
  const id = company.employees[0].id;
  const admin = updateEmployee(company, id, { role: 'company_admin' });
  assert.equal(admin.employees[0].role, 'company_admin');
  const disabled = updateEmployee(admin, id, { status: 'disabled' });
  assert.equal(getDashboard(disabled).employees, 0);
  assert.equal(disabled.employees.length, 1);
  assert.equal(getDashboard(updateEmployee(disabled, id, { status: 'active' })).employees, 1);
});

test('Предел активных мест действует при добавлении и повторном включении', () => {
  let company = createConnection('Демо', 'start');
  for (let i = 0; i < 10; i++) company = addEmployee(company, `Демо ${i}`, 'company_employee');
  assert.throws(() => addEmployee(company, 'Лишний Демо', 'company_employee'), /до 10/);
  const first = company.employees[0].id;
  company = updateEmployee(company, first, { status: 'disabled' });
  company = addEmployee(company, 'Новый Демо', 'company_employee');
  assert.throws(() => updateEmployee(company, first, { status: 'active' }), /до 10/);
  assert.equal(company.employees[0].status, 'disabled');
  assert.equal(getDashboard(company).employees, 10);
});

test('Чужие сотрудники, неправильные роли и повреждённые записи отклоняются', () => {
  const company = addEmployee(createConnection('Демо', 'plus'), 'Анна Демо', 'company_admin');
  assert.throws(() => updateEmployee(company, 'foreign-id', { role: 'company_admin' }), /не найден/);
  assert.throws(() => addEmployee(company, '  ', 'company_employee'));
  assert.throws(() => addEmployee(company, 'Демо', 'owner'));
  const damaged = structuredClone(company);
  damaged.employees[0].companyId = 'other-company';
  assert.equal(parseConnection(JSON.stringify(damaged)), null);
  const duplicate = structuredClone(company);
  duplicate.employees.push(duplicate.employees[0]);
  assert.equal(parseConnection(JSON.stringify(duplicate)), null);
});
