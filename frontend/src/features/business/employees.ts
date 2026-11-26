import type { DemoConnection } from './connection';
import { tariffs } from './tariffs.mjs';

export type Employee = {
  id: string;
  companyId: string;
  name: string;
  role: 'company_admin' | 'company_employee';
  status: 'active' | 'disabled';
  createdAt: string;
};

export function validEmployees(value: unknown, companyId: string, maxActive: number): value is Employee[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  for (const employee of value) {
    if (!employee || typeof employee.id !== 'string' || !employee.id || ids.has(employee.id)
      || employee.companyId !== companyId || typeof employee.name !== 'string'
      || employee.name.trim().length < 2 || employee.name.length > 100
      || !['company_admin', 'company_employee'].includes(employee.role)
      || !['active', 'disabled'].includes(employee.status)
      || typeof employee.createdAt !== 'string' || !Number.isFinite(Date.parse(employee.createdAt))) return false;
    ids.add(employee.id);
  }
  return value.filter(employee => employee.status === 'active').length <= maxActive;
}

function assertCapacity(connection: DemoConnection) {
  const tariff = tariffs.find(item => item.id === connection.subscription.tariffId);
  if (!tariff) throw new Error('Тариф не найден.');
  if (connection.employees.filter(employee => employee.status === 'active').length >= tariff.employees) {
    throw new Error(`В тарифе ${tariff.name} доступно до ${tariff.employees} активных сотрудников. Сначала отключите одного из сотрудников.`);
  }
}

export function addEmployee(connection: DemoConnection, name: string, role: Employee['role'], now = new Date()): DemoConnection {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2 || trimmed.length > 100) throw new Error('Укажите имя от 2 до 100 символов.');
  if (!['company_admin', 'company_employee'].includes(role)) throw new Error('Выберите доступную роль.');
  assertCapacity(connection);
  return { ...connection, employees: [...connection.employees, {
    id: crypto.randomUUID(), companyId: connection.company.id, name: trimmed, role,
    status: 'active', createdAt: now.toISOString(),
  }] };
}

export function updateEmployee(connection: DemoConnection, id: string, change: Partial<Pick<Employee, 'role' | 'status'>>): DemoConnection {
  const current = connection.employees.find(employee => employee.id === id && employee.companyId === connection.company.id);
  if (!current) throw new Error('Сотрудник не найден в этой компании.');
  if (change.role !== undefined && !['company_admin', 'company_employee'].includes(change.role)) throw new Error('Выберите доступную роль.');
  if (change.status !== undefined && !['active', 'disabled'].includes(change.status)) throw new Error('Недопустимый статус.');
  if (change.status === 'active' && current.status === 'disabled') assertCapacity(connection);
  return { ...connection, employees: connection.employees.map(employee => employee.id === id ? { ...employee, ...change } : employee) };
}
