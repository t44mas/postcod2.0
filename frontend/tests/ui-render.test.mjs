import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createConnection, payConnection, connectionKey } from '../src/features/business/connection.ts';
import { addEmployee } from '../src/features/business/employees.ts';
import { setBenefitGrant, activateBenefit } from '../src/features/business/benefits.ts';

// Проверка реальных React-компонентов в Node, без браузера и эмуляции кликов.
// Весь адаптер ограничен этим тестовым процессом; приложение не меняется.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      const candidate = new URL(specifier, context.parentURL);
      if (!extname(candidate.pathname)) {
        for (const extension of ['.ts', '.tsx', '.mjs']) {
          const url = new URL(candidate.href + extension);
          if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.tsx')) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
      }).outputText;
      return { format: 'module', source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const pages = [
  ['business', 'BusinessPage', 'Почта Премиум'],
  ['connect', 'BusinessConnectPage', 'Подключение компании'],
  ['dashboard', 'BusinessDashboardPage', 'Обзор компании'],
  ['employees', 'BusinessEmployeesPage', 'Сотрудники'],
  ['benefits', 'BusinessBenefitsPage', 'Бонусы и лимиты'],
  ['invoices', 'BusinessInvoicesPage', 'Счета'],
  ['operations', 'BusinessOperationsPage', 'Операции'],
  ['reports', 'BusinessReportsPage', 'Отчёты'],
  ['economics', 'BusinessEconomicsPage', 'Экономика тарифов'],
];
const components = new Map();
for (const [, name] of pages) components.set(name, (await import(`../src/pages/business/${name}.tsx`))[name]);
const { PersonalPlaceholder } = await import('../src/pages/personal/PersonalPlaceholder.tsx');

let raw = null;
globalThis.localStorage = {
  getItem(key) { assert.equal(key, connectionKey); return raw; },
  setItem() { throw new Error('Рендер не должен менять хранилище'); },
};
globalThis.window = { location: { search: '?tariff=plus', hash: '' } };

function fixture(paid = true) {
  const now = new Date();
  let data = createConnection('ООО Проверка Демо', 'plus', now);
  if (paid) data = payConnection(data, now);
  data = addEmployee(data, 'Анна Проверочная', 'company_employee', now);
  data = setBenefitGrant(data, { employeeId: data.employees[0].id, code: 'shipping', enabled: true, limitKopecks: 10000 });
  if (paid) data = activateBenefit(data, { employeeId: data.employees[0].id, code: 'shipping', originalKopecks: 35025, requestKey: 'ssr-fixture' }, now).connection;
  return data;
}
function render(name, data) {
  raw = data ? JSON.stringify(data) : null;
  return renderToStaticMarkup(React.createElement(components.get(name)));
}

test('Все девять B2B-страниц рендерятся с оплаченной компанией и операцией', () => {
  const data = fixture();
  for (const [, name, heading] of pages) {
    const html = render(name, data);
    assert.ok(html.includes(heading), `${name}: отсутствует заголовок`);
    assert.match(html, /id="main"/);
    assert.doesNotMatch(html, /(?:NaN|undefined|Invalid Date)/);
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) assert.ok(href.startsWith('/') || href.startsWith('#'), `${name}: внешняя ссылка ${href}`);
  }
});

test('Счёт и кабинет различают неоплаченный и оплаченный состояния', () => {
  const pending = fixture(false);
  assert.match(render('BusinessInvoicesPage', pending), /Оплатить \(демо\)/);
  assert.match(render('BusinessDashboardPage', pending), /Ожидает оплаты/);
  const paid = fixture();
  assert.doesNotMatch(render('BusinessInvoicesPage', paid), /Оплатить \(демо\)/);
  assert.match(render('BusinessDashboardPage', paid), /Подписка активна/);
});

test('Пустое хранилище и старые сохранения не обрушивают страницы кабинета', () => {
  const old = fixture();
  delete old.employees; delete old.benefitGrants; delete old.benefitUsages;
  for (const [, name] of pages.filter(([route]) => !['business', 'economics'].includes(route))) {
    assert.ok(/(?:подключите|Подключение компании|не подключена)/i.test(render(name, null)), `${name}: нет пустого состояния`);
    assert.doesNotThrow(() => render(name, old));
  }
  raw = null;
  const personal = renderToStaticMarkup(React.createElement(PersonalPlaceholder));
  assert.match(personal, /Раздел в разработке/);
  assert.match(personal, /href="\/business"/);
});

test('Кабинет не утверждает, что назначений нет, если назначение уже сохранено', () => {
  const html = render('BusinessDashboardPage', fixture());
  assert.ok(!html.includes('Администратор пока не назначал преимущества'), 'Сохранённое назначение должно отражаться в кабинете');
});

test('Повреждённое сохранение на подключении показывает восстановление, не пустой успешный сценарий', () => {
  raw = '{broken';
  const html = renderToStaticMarkup(React.createElement(components.get('BusinessConnectPage')));
  assert.ok(html.includes('Сбросить повреждённое демо'));
  assert.ok(html.includes('role="alert"'));
  assert.ok(/<button[^>]*disabled=""[^>]*>Создать тестовый счёт<\/button>/.test(html));
});

test('Выбор Start и Plus передаётся со страницы тарифов в форму подключения', () => {
  assert.ok(render('BusinessPage', null).includes('/business/connect?tariff=start'));
  assert.ok(render('BusinessPage', null).includes('/business/connect?tariff=plus'));
  for (const id of ['start', 'plus']) {
    window.location.search = `?tariff=${id}`;
    const html = render('BusinessConnectPage', null);
    const selected = [...html.matchAll(/<input\b[^>]*>/g)].map(match => match[0])
      .find(tag => tag.includes(`value="${id}"`) && tag.includes('name="tariff"'));
    assert.ok(selected?.includes('checked=""'), `Не выбран тариф ${id}`);
  }
  window.location.search = '?tariff=plus';
});
