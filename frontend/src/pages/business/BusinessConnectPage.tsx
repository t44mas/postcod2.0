import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { SiteHeader } from '../../components/SiteHeader';
import { BusinessInvoiceCard } from '../../components/BusinessInvoiceCard';
import { payStoredInvoice } from '../../features/business/invoices';
import { tariffs } from '../../features/business/tariffs.mjs';
import { connectionKey, parseConnection } from '../../features/business/connection';
import { createStoredConnection, resetStoredConnection } from '../../features/business/demoStorage';
import type { DemoConnection } from '../../features/business/connection';

const money = (kopecks: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(kopecks / 100);

function readDemo() {
  try {
    const raw = localStorage.getItem(connectionKey);
    const connection = parseConnection(raw);
    const corrupted = raw !== null && connection === null;
    return { connection, corrupted, error: corrupted ? 'Сохранённые демо-данные повреждены. Для нового подключения подтвердите их сброс.' : '' };
  } catch { return { connection: null, corrupted: false, error: 'Не удалось прочитать демо. Проверьте доступ к хранилищу браузера.' }; }
}

export function BusinessConnectPage() {
  const [initial] = useState(readDemo);
  const [connection, setConnection] = useState<DemoConnection | null>(initial.connection);
  const [corrupted, setCorrupted] = useState(initial.corrupted);
  const [companyName, setCompanyName] = useState('ООО Демо Маркет');
  const [tariffId, setTariffId] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('tariff');
    return tariffs.some(item => item.id === requested) ? requested! : 'plus';
  });
  const [error, setError] = useState(initial.error);
  const [resetRequested, setResetRequested] = useState(false);
  const tariff = tariffs.find(item => item.id === (connection?.subscription.tariffId ?? tariffId))!;

  useEffect(() => {
    const refresh = () => {
      const latest = readDemo();
      setConnection(latest.connection); setCorrupted(latest.corrupted); setError(latest.error); setResetRequested(false);
    };
    window.addEventListener('storage', refresh); window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh); };
  }, []);

  function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (connection) return;
    try { setConnection(createStoredConnection(companyName, tariffId)); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось создать тестовый счёт.'); }
  }

  function resetDemo() {
    try {
      resetStoredConnection(connection?.company.id ?? null);
      setConnection(null);
      setCorrupted(false);
      setResetRequested(false);
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сбросить демо. Проверьте хранилище браузера.'); }
  }

  function payDemo() {
    if (!connection) return;
    try {
      const paid = payStoredInvoice(connection.company.id, connection.invoice.id);
      setConnection(paid);
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось выполнить демо-оплату.'); }
  }

  return <>
    <a className="skip-link" href="#main">Перейти к содержимому</a>
    <SiteHeader audience="business"/>
    <main id="main" className="container section connect-page">
      <a className="back-link" href="/business#plans">← К тарифам</a>
      <h1>Подключение компании</h1>
      <p className="connect-note">Демонстрационный сценарий: используйте вымышленные данные. Деньги не списываются.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {corrupted && <div className="reset-section">{resetRequested ? <div className="reset-confirm"><p>Удалить повреждённые демо-данные этой компании?</p><button className="button secondary" onClick={resetDemo}>Подтвердить сброс</button><button className="button" onClick={() => setResetRequested(false)}>Отмена</button></div> : <button className="plain-button" onClick={() => setResetRequested(true)}>Сбросить повреждённое демо</button>}</div>}
      {!connection ? <form className="connect-form" onSubmit={createInvoice}>
        <div className="connect-fields">
          <label htmlFor="company-name">Название демо-компании</label>
          <input id="company-name" value={companyName} onChange={event => setCompanyName(event.target.value)} required minLength={2} maxLength={100} autoComplete="off" aria-describedby="company-hint"/>
          <p id="company-hint" className="field-hint">Например, ООО Демо Маркет. ИНН и контакты не нужны.</p>
          <fieldset className="tariff-choice"><legend>Тариф</legend>{tariffs.map(plan => <label key={plan.id} className="tariff-option">
            <input type="radio" name="tariff" value={plan.id} checked={tariffId === plan.id} onChange={() => setTariffId(plan.id)}/>
            <span><strong>{plan.name}</strong><small>До {plan.employees} сотрудников · до {money(plan.cap * 100)} выгоды / мес.</small></span>
            <strong>{money(plan.price * 100)}<small> / мес.</small></strong>
          </label>)}</fieldset>
          <p className="field-hint">Лимит ограничивает сумму преимуществ за месяц. Неиспользованный остаток не переносится. Все цены и преимущества — модельные допущения.</p>
          <button className="button primary" type="submit" disabled={corrupted}>Создать тестовый счёт</button>
        </div>
        <aside className="connect-summary" aria-label="Условия выбранного тарифа"><h2>{tariff.name}</h2><dl>
          <div><dt>Подписка на месяц</dt><dd>{money(tariff.price * 100)}</dd></div>
          <div><dt>Сотрудники</dt><dd>до {tariff.employees}</dd></div>
          <div><dt>Лимит выгоды</dt><dd>{money(tariff.cap * 100)}</dd></div>
          <div><dt>Скидка на отправление</dt><dd>{money(tariff.shippingDiscount * 100)}</dd></div>
          <div><dt>Скидка на упаковку</dt><dd>{tariff.packagingDiscount ? money(tariff.packagingDiscount * 100) : 'Не включена'}</dd></div>
        </dl></aside>
      </form> : <div className="connection-invoice"><BusinessInvoiceCard connection={connection} onPay={payDemo}/>
        <a className="inline-link invoice-list-link" href="/business/invoices">Все счета компании</a>
        <div className="reset-section">{resetRequested ? <div className="reset-confirm"><p>Удалить демо-компанию, сотрудников, назначения, операции и счёт?</p><button className="button secondary" onClick={resetDemo}>Да, начать заново</button><button className="button" onClick={() => setResetRequested(false)}>Отмена</button></div> : <button className="plain-button" onClick={() => setResetRequested(true)}>Начать демо заново</button>}</div>
      </div>}
    </main>
  </>;
}
