import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { SiteHeader } from '../../components/SiteHeader';
import { BusinessSidebar } from '../../components/BusinessSidebar';
import { connectionKey, parseConnection } from '../../features/business/connection';
import type { DemoConnection } from '../../features/business/connection';
import { activateBenefit, benefitCatalog, discountFor, rublesToKopecks, setBenefitGrant, usedBenefit } from '../../features/business/benefits';
import type { BenefitCode, BenefitUsage } from '../../features/business/benefits';
import { getDashboard } from '../../features/business/dashboard';

const money = (value: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(value / 100);
function readCompany() {
  try { return { company: parseConnection(localStorage.getItem(connectionKey)), error: '' }; }
  catch { return { company: null, error: 'Не удалось прочитать демо. Проверьте доступ к хранилищу браузера.' }; }
}

export function BusinessBenefitsPage() {
  const [stored, setStored] = useState(readCompany);
  const [mode, setMode] = useState('admin');
  const [employeeId, setEmployeeId] = useState('');
  const [grantCode, setGrantCode] = useState<BenefitCode>('shipping');
  const [limit, setLimit] = useState('0');
  const [enabled, setEnabled] = useState(false);
  const [usageCode, setUsageCode] = useState<BenefitCode>('shipping');
  const [price, setPrice] = useState('350');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState<BenefitUsage | null>(null);
  const requestKey = useRef(crypto.randomUUID());
  const connection = stored.company;
  const activeEmployees = connection?.employees.filter(item => item.status === 'active') ?? [];
  const employee = activeEmployees.find(item => item.id === employeeId) ?? activeEmployees[0];
  const selectedId = employee?.id;
  const summary = getDashboard(connection);
  const grant = connection?.benefitGrants.find(item => item.employeeId === selectedId && item.code === grantCode);
  const allowedBenefits = benefitCatalog.filter(benefit => connection?.benefitGrants.some(item => item.employeeId === selectedId && item.code === benefit.code && item.enabled));
  const effectiveUsageCode = allowedBenefits.some(item => item.code === usageCode) ? usageCode : allowedBenefits[0]?.code ?? 'shipping';

  useEffect(() => {
    const refresh = () => setStored(readCompany());
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    setLimit(String((grant?.limitKopecks ?? 0) / 100));
    setEnabled(grant?.enabled ?? false);
  }, [grant, selectedId, grantCode]);
  useEffect(() => {
    setReceipt(null); setError(''); setMessage(''); requestKey.current = crypto.randomUUID();
  }, [selectedId, mode]);

  function currentCompany() {
    const latest = parseConnection(localStorage.getItem(connectionKey));
    if (!latest || latest.company.id !== connection?.company.id) throw new Error('Демо-компания изменилась. Обновите страницу.');
    return latest;
  }
  function saveGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!selectedId) throw new Error('Выберите сотрудника.');
      const next = setBenefitGrant(currentCompany(), { employeeId: selectedId, code: grantCode, limitKopecks: rublesToKopecks(limit), enabled });
      localStorage.setItem(connectionKey, JSON.stringify(next));
      setStored({ company: next, error: '' }); setMessage('Доступ и личный лимит сохранены.'); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить назначение.'); setMessage(''); }
  }
  function useBenefit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!selectedId) throw new Error('Выберите сотрудника.');
      const result = activateBenefit(currentCompany(), { employeeId: selectedId, code: effectiveUsageCode, originalKopecks: rublesToKopecks(price), requestKey: requestKey.current });
      localStorage.setItem(connectionKey, JSON.stringify(result.connection));
      setStored({ company: result.connection, error: '' }); setReceipt(result.usage); setError(''); setMessage('Преимущество применено. Лимиты обновлены.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось применить преимущество.'); setMessage(''); }
  }

  return <>
    <a className="skip-link" href="#main">Перейти к содержимому</a><SiteHeader audience="business"/>
    {!connection || !summary ? <main id="main" className="container section dashboard-empty"><h1>Бонусы и лимиты</h1>{stored.error ? <p role="alert">{stored.error}</p> : <><p>Сначала подключите демо-компанию.</p><a className="button primary" href="/business#plans">Выбрать тариф</a></>}</main>
      : <div className="container dashboard-layout"><BusinessSidebar current="benefits"/><main id="main" className="dashboard-main benefits-page">
        <p className="company-label">{connection.company.name} · {summary.tariff.name}</p><h1>Бонусы и лимиты</h1>
        <p className="field-hint">Демо-режим. Скидки — модельные допущения. Реальные услуги не оформляются.</p>
        <div className="benefits-mode"><label>Демо-роль<select value={mode} onChange={event => setMode(event.target.value)}><option value="admin">Администратор</option><option value="employee">Сотрудник</option></select></label>
          {!!activeEmployees.length && <label>Сотрудник<select value={selectedId} onChange={event => setEmployeeId(event.target.value)}>{activeEmployees.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
        </div>
        <p className="field-hint">{mode === 'admin' ? `Общий остаток компании: ${money(summary.availableKopecks)} из ${money(summary.tariff.cap * 100)}.` : 'Режим сотрудника показывает только его назначенные преимущества. Переключение — часть демо, без настоящей авторизации.'}</p>
        {summary.status !== 'active' && <div className="dashboard-notice"><p>{summary.status === 'expired' ? 'Срок подписки истёк. Использование преимуществ недоступно.' : 'Подписка не оплачена. Назначения можно подготовить, но использовать преимущества пока нельзя.'}</p><a href="/business/connect" className="button secondary">Открыть подписку</a></div>}
        {(error || stored.error) && <p className="form-error" role="alert">{error || stored.error}</p>}<p className="employee-feedback" role="status" aria-live="polite">{message}</p>

        <section className="dashboard-panel" aria-labelledby="catalog-heading"><h2 id="catalog-heading">{mode === 'admin' ? 'Преимущества тарифа' : 'Мои преимущества'}</h2>
          <ul className="benefits-catalog">{benefitCatalog.filter(benefit => mode === 'admin' || connection.benefitGrants.some(item => item.employeeId === selectedId && item.code === benefit.code && item.enabled)).map(benefit => {
            const discount = discountFor(connection, benefit.code);
            const assignment = connection.benefitGrants.find(item => item.employeeId === selectedId && item.code === benefit.code);
            const used = selectedId ? usedBenefit(connection, selectedId, benefit.code) : 0;
            return <li key={benefit.code}><h3>{benefit.title}</h3><p>{discount ? `${money(discount)} за услугу, но не больше её исходной стоимости.` : 'Не входит в текущий тариф.'}</p><p className="field-hint">{benefit.description} Учитывается в общем лимите скидок компании.</p>{employee && discount > 0 && <p className="field-hint">{assignment?.enabled ? `Назначено: остаток ${money(assignment.limitKopecks - used)} из ${money(assignment.limitKopecks)} для ${employee.name}.` : `Не назначено сотруднику ${employee.name}.`}</p>}</li>;
          })}</ul>
          {mode === 'employee' && !connection.benefitGrants.some(item => item.employeeId === selectedId && item.enabled) && <p className="field-hint">Пока нет назначенных преимуществ. Обратитесь к администратору.</p>}
        </section>

        {!employee ? <section className="dashboard-panel"><h2>Добавьте сотрудника</h2><p className="field-hint">Для назначения преимуществ нужен хотя бы один активный сотрудник.</p><a className="button secondary" href="/business/employees#add-employee">Добавить сотрудника</a></section>
          : mode === 'admin' ? <section className="dashboard-panel"><h2>Доступ и личный лимит</h2><p className="field-hint">Сотрудник: {employee.name}</p><form onSubmit={saveGrant} className="benefit-form">
            <label htmlFor="grant-benefit">Преимущество</label><select id="grant-benefit" value={grantCode} onChange={event => setGrantCode(event.target.value as BenefitCode)}>{benefitCatalog.filter(item => discountFor(connection, item.code) > 0).map(item => <option value={item.code} key={item.code}>{item.title}</option>)}</select>
            <label htmlFor="personal-limit">Личный лимит за период, ₽</label><input id="personal-limit" required inputMode="decimal" value={limit} onChange={event => setLimit(event.target.value)}/>
            <label className="checkbox-label"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)}/>Разрешить использование</label>
            <p className="field-hint">Лимиты сотрудников не резервируют средства. Все используют общий лимит {money(summary.tariff.cap * 100)}. Личный лимит нельзя уменьшить ниже уже использованной суммы. Снятие доступа не отменяет прошлые операции.</p>
            <button className="button primary" type="submit">Сохранить назначение</button>
          </form></section> : <section className="dashboard-panel"><h2>Использовать преимущество</h2><form className="benefit-form" onSubmit={useBenefit}>
            <label htmlFor="usage-benefit">Преимущество</label><select id="usage-benefit" value={allowedBenefits.length ? effectiveUsageCode : ''} disabled={!!receipt || !allowedBenefits.length} onChange={event => setUsageCode(event.target.value as BenefitCode)}>{!allowedBenefits.length && <option value="">Нет назначенных преимуществ</option>}{allowedBenefits.map(item => <option value={item.code} key={item.code}>{item.title}</option>)}</select>
            <label htmlFor="service-price">Исходная стоимость услуги, ₽</label><input id="service-price" required inputMode="decimal" value={price} disabled={!!receipt} onChange={event => setPrice(event.target.value)}/>
            <button type="submit" className="button primary" disabled={!!receipt || summary.status !== 'active' || !allowedBenefits.length}>Применить (демо)</button>
          </form><p className="field-hint">Одна операция — одна услуга. Перед применением проверяются доступ, срок подписки, личный и общий остаток.</p>
          {receipt && <div className="benefit-receipt"><h3>Чек выгоды</h3><dl><div><dt>Исходная стоимость</dt><dd>{money(receipt.originalKopecks)}</dd></div><div><dt>Скидка и расход лимита</dt><dd>{money(receipt.discountKopecks)}</dd></div><div><dt>После скидки</dt><dd>{money(receipt.originalKopecks - receipt.discountKopecks)}</dd></div></dl><p className="field-hint">Операция {receipt.id.slice(0, 8)} сохранена. Повторное списание по этому запросу исключено.</p><button className="button secondary" onClick={() => { setReceipt(null); setMessage(''); requestKey.current = crypto.randomUUID(); }}>Новая операция</button></div>}
        </section>}
      </main></div>}
  </>;
}
