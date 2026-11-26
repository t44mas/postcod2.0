import type { DemoConnection } from './connection';
import type { OperationFilters } from './operations';
import { getOperations } from './operations.ts';
import { getDashboard } from './dashboard.ts';

export function getCompanyReport(connection: DemoConnection, filters: OperationFilters = {}, role: 'admin' | 'employee' = 'admin', now = new Date()) {
  if (role !== 'admin') throw new Error('Отчёт компании доступен только администратору.');
  const subscription = getDashboard(connection, now)!;
  const operations = getOperations(connection, filters);
  const employees = new Map<string, { id: string; name: string; count: number; savingsKopecks: number }>();
  const categories = new Map<string, { code: string; title: string; count: number; savingsKopecks: number }>();
  let originalKopecks = 0;
  let savingsKopecks = 0;
  let finalKopecks = 0;
  for (const operation of operations) {
    const employee = employees.get(operation.employeeId) ?? { id: operation.employeeId, name: operation.employeeName, count: 0, savingsKopecks: 0 };
    employee.count++; employee.savingsKopecks += operation.discountKopecks;
    employees.set(employee.id, employee);
    const category = categories.get(operation.code) ?? { code: operation.code, title: operation.benefitTitle, count: 0, savingsKopecks: 0 };
    category.count++; category.savingsKopecks += operation.discountKopecks;
    categories.set(category.code, category);
    originalKopecks += operation.originalKopecks;
    savingsKopecks += operation.discountKopecks;
    finalKopecks += operation.finalKopecks;
  }
  return {
    // Стоимость месячной подписки не распределяется произвольно между сотрудниками
    // и датами. Общие итоги всегда совпадают с кабинетом; фильтры меняют детализацию.
    subscription,
    operations,
    employees: [...employees.values()].sort((a, b) => b.savingsKopecks - a.savingsKopecks || a.name.localeCompare(b.name)),
    categories: [...categories.values()].sort((a, b) => b.savingsKopecks - a.savingsKopecks || a.title.localeCompare(b.title)),
    selected: { count: operations.length, originalKopecks, savingsKopecks, finalKopecks },
  };
}
