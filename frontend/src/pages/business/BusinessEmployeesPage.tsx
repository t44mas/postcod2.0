import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { SiteHeader } from '../../components/SiteHeader';
import { BusinessSidebar } from '../../components/BusinessSidebar';
import { connectionKey, parseConnection } from '../../features/business/connection';
import type { DemoConnection } from '../../features/business/connection';
import { addEmployee, updateEmployee } from '../../features/business/employees';
import type { Employee } from '../../features/business/employees';
import { tariffs } from '../../features/business/tariffs.mjs';

function readCompany() {
  try { return { company: parseConnection(localStorage.getItem(connectionKey)), error: '' }; }
  catch { return { company: null, error: 'Не удалось прочитать данные демо. Разрешите хранение данных в браузере.' }; }
}

export function BusinessEmployeesPage() {
  const [stored, setStored] = useState(readCompany);
  const [name, setName] = useState('');
  const [role, setRole] = useState<Employee['role']>('company_employee');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [disableId, setDisableId] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const refresh = () => setStored(readCompany());
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    if (window.location.hash === '#add-employee') nameRef.current?.focus();
  }, []);
  const connection = stored.company;
  const tariff = tariffs.find(item => item.id === connection?.subscription.tariffId);
  const activeCount = connection?.employees.filter(employee => employee.status === 'active').length ?? 0;

  function mutate(action: (current: DemoConnection) => DemoConnection, success: string) {
    try {
      const current = parseConnection(localStorage.getItem(connectionKey));
      if (!current || current.company.id !== connection?.company.id) throw new Error('Демо-компания изменилась. Обновите страницу.');
      const next = action(current);
      localStorage.setItem(connectionKey, JSON.stringify(next));
      setStored({ company: next, error: '' });
      setError('');
      setMessage(success);
      setDisableId(null);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить изменения.');
      setMessage('');
      return false;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutate(current => addEmployee(current, name, role), 'Сотрудник добавлен.')) {
      setName('');
      setRole('company_employee');
      nameRef.current?.focus();
    }
  }

  return <>
    <a className="skip-link" href="#main">Перейти к содержимому</a>
    <SiteHeader audience="business"/>
    {!connection || !tariff ? <main id="main" className="container section dashboard-empty"><h1>Сотрудники</h1>
      {stored.error ? <p role="alert">{stored.error}</p> : <><p>Сначала подключите демо-компанию, чтобы управлять сотрудниками.</p><a className="button primary" href="/business#plans">Выбрать тариф</a></>}
    </main> : <div className="container dashboard-layout"><BusinessSidebar current="employees"/>
      <main id="main" className="dashboard-main employees-page">
        <p className="company-label">{connection.company.name}</p><h1>Сотрудники</h1>
        <p className="field-hint">Активных сотрудников: {activeCount} из {tariff.employees} · {tariff.name}</p>
        <p className="field-hint">Демо-режим администратора. Используйте вымышленные имена. Настоящие приглашения не отправляются.</p>
        {(error || stored.error) && <p className="form-error" role="alert">{error || stored.error}</p>}
        <p className="employee-feedback" role="status" aria-live="polite">{message}</p>

        <section className="dashboard-panel" aria-labelledby="add-heading"><h2 id="add-heading">Добавить сотрудника</h2>
          <form id="add-employee" className="employee-form" onSubmit={submit}>
            <div><label htmlFor="employee-name">Имя сотрудника</label><input ref={nameRef} id="employee-name" autoComplete="off" required minLength={2} maxLength={100} placeholder="Например, Анна Демо" value={name} onChange={event => setName(event.target.value)}/></div>
            <div><label htmlFor="employee-role">Роль</label><select id="employee-role" value={role} onChange={event => setRole(event.target.value as Employee['role'])}><option value="company_employee">Сотрудник</option><option value="company_admin">Администратор</option></select></div>
            <button type="submit" className="button primary" disabled={activeCount >= tariff.employees}>Добавить</button>
          </form>
          {activeCount >= tariff.employees && <p className="field-hint">Достигнут лимит тарифа. Отключите одного из сотрудников, чтобы добавить другого.</p>}
          <p className="field-hint">Администратор управляет компанией; сотрудник использует назначенные преимущества. Настройка преимуществ и лимитов — на следующей странице.</p>
        </section>

        <section className="dashboard-panel employee-list" aria-labelledby="list-heading"><h2 id="list-heading">Команда компании</h2>
          {!connection.employees.length ? <p className="field-hint">Сотрудников пока нет. Добавьте первого через форму выше.</p> : <ul className="employee-cards">{connection.employees.map(employee => <li key={employee.id} className="employee-card">
            <div className="employee-card-heading"><h3>{employee.name}</h3><span className={`invoice-status ${employee.status === 'active' ? 'paid' : ''}`}>{employee.status === 'active' ? 'Активен' : 'Отключён'}</span></div>
            <div className="employee-controls"><label>Роль <select aria-label={`Роль: ${employee.name}`} value={employee.role} onChange={event => mutate(current => updateEmployee(current, employee.id, { role: event.target.value as Employee['role'] }), `Роль сотрудника «${employee.name}» обновлена.`)}><option value="company_employee">Сотрудник</option><option value="company_admin">Администратор</option></select></label>
              {employee.status === 'active' ? <button className="button secondary" onClick={() => setDisableId(employee.id)}>Отключить {employee.name}</button>
                : <button className="button secondary" onClick={() => mutate(current => updateEmployee(current, employee.id, { status: 'active' }), `Сотрудник «${employee.name}» включён.`)}>Включить {employee.name}</button>}
            </div>
            {disableId === employee.id && <div className="employee-confirm"><p>Отключить сотрудника «{employee.name}»? Он потеряет доступ к преимуществам. Запись сохранится.</p><button className="button secondary" onClick={() => mutate(current => updateEmployee(current, employee.id, { status: 'disabled' }), `Сотрудник «${employee.name}» отключён.`)}>Подтвердить отключение</button><button className="button" onClick={() => setDisableId(null)}>Отмена</button></div>}
          </li>)}</ul>}
        </section>
      </main>
    </div>}
  </>;
}
