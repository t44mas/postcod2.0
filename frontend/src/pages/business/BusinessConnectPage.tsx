import { useState } from 'react';
import type { FormEvent } from 'react';
import { SiteHeader } from '../../components/SiteHeader';
import { BusinessInvoiceCard } from '../../components/BusinessInvoiceCard';
import { payStoredInvoice } from '../../features/business/invoices';
import { tariffs } from '../../features/business/tariffs.mjs';
import { connectionKey, createConnection, parseConnection } from '../../features/business/connection';
import type { DemoConnection } from '../../features/business/connection';

const money = (kopecks: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(kopecks / 100);

export function BusinessConnectPage() {
  const [connection, setConnection] = useState<DemoConnection | null>(() => {
    try { return parseConnection(localStorage.getItem(connectionKey)); } catch { return null; }
  });
  const [companyName, setCompanyName] = useState('ООО Демо Маркет');
  const [tariffId, setTariffId] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('tariff');
    return tariffs.some(item => item.id === requested) ? requested! : 'plus';
  });
  const [error, setError] = useState('');
  const [resetRequested, setResetRequested] = useState(false);
  const tariff = tariffs.find(item => item.id === (connection?.subscription.tariffId ?? tariffId))!;

  function persist(next: DemoConnection) {
    try {
      localStorage.setItem(connectionKey, JSON.stringify(next));
      setConnection(next);
      setError('');
    } catch {
      setError('Не удалось сохранить демо. Разрешите хранение данных в браузере и повторите действие.');
    }
  }

  function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (connection) return;
    try { persist(createConnection(companyName, tariffId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось создать тестовый счёт.'); }
  }

  function resetDemo() {
    try {
      localStorage.removeItem(connectionKey);
      setConnection(null);
      setResetRequested(false);
      setError('');
    } catch { setError('Не удалось сбросить демо. Проверьте доступ к хранилищу браузера.'); }
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
          <button className="button primary" type="submit">Создать тестовый счёт</button>
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
        <div className="reset-section">{resetRequested ? <div className="reset-confirm"><p>Удалить тестовый счёт и подписку этой демо-компании?</p><button className="button secondary" onClick={resetDemo}>Да, начать заново</button><button className="button" onClick={() => setResetRequested(false)}>Отмена</button></div> : <button className="plain-button" onClick={() => setResetRequested(true)}>Начать демо заново</button>}</div>
      </div>}
    </main>
  </>;
}
