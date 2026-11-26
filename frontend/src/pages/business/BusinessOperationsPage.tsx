import { useEffect, useState } from 'react';
import { SiteHeader } from '../../components/SiteHeader';
import { BusinessSidebar } from '../../components/BusinessSidebar';
import { connectionKey, parseConnection } from '../../features/business/connection';
import { getOperations } from '../../features/business/operations';

const money = (value: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(value / 100);
const dateTime = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

function readCompany() {
  try { return { connection: parseConnection(localStorage.getItem(connectionKey)), error: '' }; }
  catch { return { connection: null, error: 'Не удалось прочитать операции. Проверьте доступ к хранилищу браузера.' }; }
}

export function BusinessOperationsPage() {
  const [stored, setStored] = useState(readCompany);
  const [mode, setMode] = useState('admin');
  const [employeeId, setEmployeeId] = useState('');
  const [personaId, setPersonaId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => {
    const refresh = () => setStored(readCompany());
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  const { connection } = stored;
  const persona = connection?.employees.find(item => item.id === personaId) ?? connection?.employees[0];
  let operations: ReturnType<typeof getOperations> = [];
  let filterError = '';
  if (connection) {
    try {
      if (mode === 'admin' || persona) operations = getOperations(connection, { employeeId: mode === 'admin' ? employeeId : undefined, from, to }, mode === 'admin' ? { role: 'admin' } : { role: 'employee', employeeId: persona!.id });
    } catch (reason) { filterError = reason instanceof Error ? reason.message : 'Проверьте фильтры.'; }
  }
  const total = operations.reduce((sum, item) => sum + item.discountKopecks, 0);
  const filtered = !!(from || to || (mode === 'admin' && employeeId));

  return <>
    <a className="skip-link" href="#main">Перейти к содержимому</a><SiteHeader audience="business"/>
    {!connection ? <main id="main" className="container section dashboard-empty"><h1>Операции</h1>{stored.error ? <p role="alert">{stored.error}</p> : <><p>Сначала подключите демо-компанию. Здесь появится история использования её преимуществ.</p><a className="button primary" href="/business/connect">Подключить компанию</a></>}</main>
      : <div className="container dashboard-layout"><BusinessSidebar current="operations"/><main id="main" className="dashboard-main operations-page">
        <p className="company-label">{connection.company.name}</p><h1>Операции</h1><p className="field-hint">История успешных применений преимуществ. Даты и фильтры — по московскому времени.</p>
        <div className="operations-viewer"><label>Демо-роль<select value={mode} onChange={event => setMode(event.target.value)}><option value="admin">Администратор</option><option value="employee">Сотрудник</option></select></label>
          {mode === 'employee' && !!connection.employees.length && <label>Демо-сотрудник<select value={persona?.id} onChange={event => setPersonaId(event.target.value)}>{connection.employees.map(item => <option key={item.id} value={item.id}>{item.name}{item.status === 'disabled' ? ' (отключён)' : ''}</option>)}</select></label>}
        </div>
        {mode === 'employee' && <p className="field-hint">{persona ? `Показана только история сотрудника ${persona.name}.` : 'Сотрудники ещё не добавлены.'} Выбор персоны — часть демо, без настоящей авторизации.</p>}
        <section className="dashboard-panel operations-filter-panel" aria-labelledby="filters-heading"><h2 id="filters-heading">Фильтры</h2><div className="operations-filters">
          {mode === 'admin' && <label>Сотрудник<select value={employeeId} onChange={event => setEmployeeId(event.target.value)}><option value="">Все сотрудники</option>{connection.employees.map(item => <option key={item.id} value={item.id}>{item.name}{item.status === 'disabled' ? ' (отключён)' : ''}</option>)}</select></label>}
          <label>С даты<input type="date" value={from} onChange={event => setFrom(event.target.value)}/></label><label>По дату включительно<input type="date" value={to} onChange={event => setTo(event.target.value)}/></label>
          <button className="button secondary" disabled={!filtered} onClick={() => { setEmployeeId(''); setFrom(''); setTo(''); }}>Сбросить</button>
        </div></section>
        {filterError ? <p className="form-error" role="alert">{filterError}</p> : <>
          <p className="operations-summary" role="status" aria-live="polite">Найдено операций: {operations.length}. Применённые скидки: <strong>{money(total)}</strong>.</p>
          {!operations.length ? <section className="dashboard-panel"><h2>{filtered ? 'Нет операций по выбранным фильтрам' : 'Операций пока нет'}</h2><p className="field-hint">{filtered ? 'Измените даты или сотрудника. Сброс фильтров не удаляет историю.' : 'Успешные применения преимуществ появятся здесь автоматически. Отклонённые попытки не расходуют лимит и не входят в этот журнал.'}</p>{!filtered && <a className="button secondary" href="/business/benefits">Открыть бонусы и лимиты</a>}</section>
            : <ol className="operations-list" aria-label="Журнал операций">{operations.map(operation => <li key={operation.id} className="dashboard-panel operation-card">
              <div className="operation-heading"><h2>{operation.benefitTitle}</h2><span className="invoice-status paid">Применено</span></div>
              <p className="operation-person">{operation.employeeName}</p><time dateTime={operation.createdAt}>{dateTime(operation.createdAt)} МСК</time>
              <p className="operation-saving">Выгода <strong>{money(operation.discountKopecks)}</strong></p>
              <details className="operation-receipt"><summary>Чек выгоды · {operation.id.slice(0, 8)}</summary><dl className="invoice-details">
                <div><dt>Исходная стоимость</dt><dd>{money(operation.originalKopecks)}</dd></div>
                <div><dt>Применённая скидка</dt><dd>{money(operation.discountKopecks)}</dd></div>
                <div><dt>Стоимость после скидки</dt><dd>{money(operation.finalKopecks)}</dd></div>
                <div><dt>Расход личного и общего лимита</dt><dd>{money(operation.discountKopecks)}</dd></div>
              </dl></details>
            </li>)}</ol>}
        </>}
      </main></div>}
  </>;
}
