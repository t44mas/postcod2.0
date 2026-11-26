import { useBackend } from '../../app/BackendProvider';
import { useEffect, useState } from 'react';
import { SiteHeader } from '../../components/SiteHeader';
import { BusinessSidebar } from '../../components/BusinessSidebar';
import { connectionKey, parseConnection } from '../../features/business/connection';
import { getCompanyReport } from '../../features/business/reports';

const money = (value: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(value / 100);
const date = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
const dateTime = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

function readCompany() {
  try { return { connection: parseConnection(localStorage.getItem(connectionKey)), error: '' }; }
  catch { return { connection: null, error: 'Не удалось прочитать отчёт. Проверьте доступ к хранилищу браузера.' }; }
}

export function BusinessReportsPage() {
  const backend = useBackend();
  const [stored, setStored] = useState(() => backend ? { connection: null, error: '' } : readCompany());
  const [role, setRole] = useState<'admin' | 'employee'>('admin');
  const [employeeId, setEmployeeId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => { if (!backend) setStored(readCompany()); setNow(new Date()); };
    window.addEventListener('storage', refresh); window.addEventListener('focus', refresh);
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh); window.clearInterval(timer); };
  }, []);
  const connection = backend ? backend.connection : stored.connection;
  let report: ReturnType<typeof getCompanyReport> | null = null;
  let filterError = '';
  if (connection && role === 'admin') {
    try { report = getCompanyReport(connection, { employeeId, from, to }, role, now); }
    catch (reason) { filterError = reason instanceof Error ? reason.message : 'Проверьте фильтры.'; }
  }
  // Общие итоги сохраняются при ошибке фильтров, но ошибочная детализация не выводится.
  const totals = connection && role === 'admin' ? getCompanyReport(connection, {}, role, now).subscription : null;

  return <>
    <a className="skip-link" href="#main">Перейти к содержимому</a><SiteHeader audience="business"/>
    {!connection ? <main id="main" className="container section dashboard-empty"><h1>Отчёты</h1>{(!backend && stored.error) ? <p role="alert">{stored.error}</p> : <><p>Сначала подключите демо-компанию. Отчёт будет рассчитан по её подписке и операциям.</p><a className="button primary" href="/business/connect">Подключить компанию</a></>}</main>
      : <div className="container dashboard-layout"><BusinessSidebar current="reports"/><main id="main" className="dashboard-main reports-page">
        <p className="company-label">{connection.company.name}</p><h1>Отчёты</h1>
        <div className="operations-viewer"><label>Демо-роль<select value={role} onChange={event => setRole(event.target.value as 'admin' | 'employee')}><option value="admin">Администратор</option><option value="employee">Сотрудник</option></select></label></div>
        <p className="field-hint">Демонстрационный кабинет. Роли переключаются для проверки сценария.</p>
        {role === 'employee' ? <div className="dashboard-notice" role="status"><p>Отчёт компании доступен только администратору.</p></div> : totals && <>
          <section aria-labelledby="subscription-totals"><h2 id="subscription-totals" className="report-section-title">Итоги подписки компании</h2>
            <p className="field-hint">{totals.tariff.name} · {connection.subscription.startedAt ? `${date(connection.subscription.startedAt)} — ${date(connection.subscription.expiresAt!)}` : 'Подписка ещё не оплачена'}</p>
            <div className="dashboard-kpis report-kpis">
              <article className="dashboard-kpi"><h3>Применённые скидки</h3><strong>{money(totals.savingsKopecks)}</strong><p>Выгода от всех успешных операций</p></article>
              <article className="dashboard-kpi"><h3>Стоимость подписки</h3><strong>{money(totals.feeKopecks)}</strong><p>{totals.feeKopecks ? 'Оплачено за весь период' : 'Счёт пока не оплачен'}</p></article>
              <article className="dashboard-kpi"><h3>Чистая выгода</h3><strong className={totals.netKopecks < 0 ? 'negative-value' : ''}>{money(totals.netKopecks)}</strong><p>Скидки минус стоимость подписки</p></article>
              <article className="dashboard-kpi"><h3>Доступный остаток</h3><strong>{money(totals.availableKopecks)}</strong><p>{totals.status === 'active' ? 'Можно использовать до конца периода' : 'Доступен только при активной подписке'}</p></article>
            </div>
            <div className="report-limit"><div className="limit-heading"><span>Расход {money(totals.usedKopecks)}</span><span>Лимит {money(totals.tariff.cap * 100)}</span></div><progress className="limit-progress" value={totals.usedKopecks} max={totals.tariff.cap * 100} aria-label="Расход общего лимита подписки"/></div>
            <p className="field-hint">Это итоги всей компании за период подписки. Лимит ограничивает преимущества, а не денежный баланс. Фильтры ниже меняют только детализацию; стоимость подписки не распределяется между сотрудниками и днями.</p>
          </section>

          <section className="dashboard-panel operations-filter-panel" aria-labelledby="report-filters"><h2 id="report-filters">Фильтры детализации</h2><div className="operations-filters">
            <label>Сотрудник<select value={employeeId} onChange={event => setEmployeeId(event.target.value)}><option value="">Все сотрудники</option>{connection.employees.map(item => <option key={item.id} value={item.id}>{item.name}{item.status === 'disabled' ? ' (отключён)' : ''}</option>)}</select></label>
            <label>С даты<input type="date" value={from} onChange={event => setFrom(event.target.value)}/></label><label>По дату включительно<input type="date" value={to} onChange={event => setTo(event.target.value)}/></label>
            <button className="button secondary" disabled={!employeeId && !from && !to} onClick={() => { setEmployeeId(''); setFrom(''); setTo(''); }}>Сбросить</button>
          </div><p className="field-hint">Даты и время — по Москве.</p></section>

          {filterError ? <p className="form-error" role="alert">{filterError}</p> : report && <>
            <p className="operations-summary" role="status" aria-live="polite">В детализации: {report.selected.count} операций. Скидки: <strong>{money(report.selected.savingsKopecks)}</strong>.</p>
            {!report.operations.length ? <section className="dashboard-panel"><h2 className="report-section-title">Нет операций для детализации</h2><p className="field-hint">{connection.benefitUsages.length ? 'Измените фильтры или сбросьте их.' : 'Примените назначенное преимущество в демо-режиме сотрудника. Запись автоматически попадёт в отчёт.'}</p>{!connection.benefitUsages.length && <a href="/business/benefits" className="button secondary">Открыть бонусы и лимиты</a>}</section> : <>
              <div className="report-breakdowns"><section className="dashboard-panel"><h2>По сотрудникам</h2><ul className="report-groups">{report.employees.map(item => <li key={item.id}><div><strong>{item.name}</strong><span>Операций: {item.count}</span></div><b>{money(item.savingsKopecks)}</b></li>)}</ul></section>
                <section className="dashboard-panel"><h2>По преимуществам</h2><ul className="report-groups">{report.categories.map(item => <li key={item.code}><div><strong>{item.title}</strong><span>Операций: {item.count}</span></div><b>{money(item.savingsKopecks)}</b></li>)}</ul></section></div>
              <section className="dashboard-panel report-operations"><h2>Операции в детализации</h2><div className="report-table-wrap"><table className="report-table"><caption className="visually-hidden">Успешные применения преимуществ по выбранным фильтрам</caption><thead><tr><th scope="col">Когда, МСК</th><th scope="col">Сотрудник и преимущество</th><th scope="col">До скидки</th><th scope="col">Скидка</th><th scope="col">После скидки</th></tr></thead><tbody>{report.operations.map(operation => <tr key={operation.id}><td data-label="Когда, МСК"><time dateTime={operation.createdAt}>{dateTime(operation.createdAt)}</time></td><td data-label="Сотрудник и преимущество"><span>{operation.employeeName}</span><small>{operation.benefitTitle}</small></td><td data-label="До скидки">{money(operation.originalKopecks)}</td><td data-label="Скидка">{money(operation.discountKopecks)}</td><td data-label="После скидки">{money(operation.finalKopecks)}</td></tr>)}</tbody><tfoot><tr><th colSpan={2} scope="row">Итого в детализации</th><td data-label="До скидки">{money(report.selected.originalKopecks)}</td><td data-label="Скидка">{money(report.selected.savingsKopecks)}</td><td data-label="После скидки">{money(report.selected.finalKopecks)}</td></tr></tfoot></table></div><a className="inline-link report-journal-link" href="/business/operations">Открыть журнал и чеки выгоды</a></section>
            </>}
          </>}
        </>}
      </main></div>}
  </>;
}
