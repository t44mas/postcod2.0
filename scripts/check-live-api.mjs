import assert from 'node:assert/strict';
import { BusinessApi } from '../frontend/src/services/businessApi.ts';
import { getDashboard } from '../frontend/src/features/business/dashboard.ts';
import { getCompanyReport } from '../frontend/src/features/business/reports.ts';
import { calculateEconomics, economicsAssumptions } from '../frontend/src/features/business/economics.ts';

// Exercise the actual frontend adapter over HTTP with a separate demo persona.
// Never reset an existing company: only the one created by this invocation.
const base = process.argv[2] ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:5173/api/v1';
const api = new BusinessApi(base, 'demo_other_admin');
const economics = await (await fetch(base + '/economics/scenarios')).json();
assert.equal(economics.scenarios.length, 6);
for (const row of economics.scenarios) {
  const local = calculateEconomics(row.tariffId, economicsAssumptions[row.tariffId][row.scenarioId]);
  assert.deepEqual(row.assumptions, economicsAssumptions[row.tariffId][row.scenarioId]);
  for (const field of ['mrrKopecks', 'contributionKopecks', 'resultKopecks', 'cacKopecks', 'ltvKopecks', 'ltvCac', 'breakEvenCompanies']) assert.equal(row[field], local[field]);
}
let createdId = null;
try {
  assert.equal(await api.state(), null, 'Профиль demo_other_admin занят: существующие данные не изменены.');
  await api.connect('ООО Проверка HTTP', 'plus');
  let state = await api.state();
  createdId = state.company.id;
  await api.pay(state.invoice.id);
  await api.addEmployee('Анна HTTP Демо', 'company_employee');
  state = await api.state();
  const employeeId = state.employees[0].id;
  await api.grant({ employeeId, code: 'shipping', enabled: true, limitKopecks: 10000 });
  const input = { code: 'shipping', originalKopecks: 35025, requestKey: crypto.randomUUID() };
  const first = await api.activate(employeeId, input);
  const repeated = await api.activate(employeeId, input);
  assert.equal(first.id, repeated.id);
  state = await new BusinessApi(base, 'demo_other_admin').state();
  assert.equal(state.benefitUsages.length, 1);
  const dashboard = getDashboard(state);
  const report = getCompanyReport(state);
  assert.equal(dashboard.usedKopecks, 7000);
  assert.equal(report.subscription.netKopecks, -242000);
  await assert.rejects(api.activate(employeeId, { ...input, requestKey: crypto.randomUUID() }), /личного лимита/);
  await api.updateEmployee(employeeId, { status: 'disabled' });
  await assert.rejects(api.activate(employeeId, { ...input, requestKey: crypto.randomUUID() }), /отключён/);
  console.log('Live frontend adapter → HTTP proxy → FastAPI → PostgreSQL: PASS');
  console.log('Payment, employee, assignment, usage, idempotency, report, persistence and denials verified.');
} finally {
  if (createdId) {
    await api.reset(createdId);
    assert.equal(await api.state(), null);
    console.log('Only the smoke-test company was removed. Main demo profile was not changed.');
  }
}
