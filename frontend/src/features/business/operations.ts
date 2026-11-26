import type { DemoConnection } from './connection';
import { benefitCatalog } from './benefits.ts';

export type OperationFilters = { employeeId?: string; from?: string; to?: string };
export type OperationViewer = { role: 'admin' } | { role: 'employee'; employeeId: string };

function moscowDayStart(value: string) {
  const utc = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== value) {
    throw new Error('Укажите корректную дату.');
  }
  return Date.parse(`${value}T00:00:00+03:00`);
}

export function getOperations(connection: DemoConnection, filters: OperationFilters = {}, viewer: OperationViewer = { role: 'admin' }) {
  const from = filters.from ? moscowDayStart(filters.from) : -Infinity;
  const to = filters.to ? moscowDayStart(filters.to) + 86_400_000 : Infinity;
  if (from >= to) throw new Error('Дата начала должна быть не позже даты окончания.');
  if (viewer.role === 'employee' && !connection.employees.some(item => item.id === viewer.employeeId && item.companyId === connection.company.id)) {
    throw new Error('Выберите сотрудника этой компании.');
  }
  return connection.benefitUsages.filter(usage => {
    const time = Date.parse(usage.createdAt);
    return usage.companyId === connection.company.id
      && (viewer.role !== 'employee' || usage.employeeId === viewer.employeeId)
      && (!filters.employeeId || usage.employeeId === filters.employeeId)
      && time >= from && time < to;
  }).map(usage => ({
    ...usage,
    employeeName: connection.employees.find(item => item.id === usage.employeeId)?.name ?? 'Сотрудник не найден',
    benefitTitle: benefitCatalog.find(item => item.code === usage.code)!.title,
    finalKopecks: usage.originalKopecks - usage.discountKopecks,
  })).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
}
