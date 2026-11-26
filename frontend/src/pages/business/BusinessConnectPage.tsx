import { useState } from 'react';
import type { FormEvent } from 'react';
import { SiteHeader } from '../../components/SiteHeader';
import { tariffs } from '../../features/business/tariffs.mjs';
import { connectionKey, createConnection, parseConnection, payConnection } from '../../features/business/connection';
import type { DemoConnection } from '../../features/business/connection';

const money = (kopecks: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(kopecks / 100);
const date = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));

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
  const isPaid = connection?.invoice.status === 'paid';

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
      </form> : <section className="invoice-panel" aria-labelledby="invoice-title">
        <div className="invoice-heading"><h2 id="invoice-title">Тестовый счёт</h2><span className={`invoice-status ${isPaid ? 'paid' : ''}`}>{isPaid ? 'Оплачен (демо)' : 'Ожидает демо-оплаты'}</span></div>
        <dl className="invoice-details">
          <div><dt>Номер</dt><dd>ДЕМО-{connection.invoice.id.slice(0, 8).toUpperCase()}</dd></div>
          <div><dt>Дата счёта</dt><dd>{date(connection.invoice.createdAt)}</dd></div>
          <div><dt>Компания</dt><dd>{connection.company.name}</dd></div>
          <div><dt>Тариф</dt><dd>{tariff.name}</dd></div>
          <div><dt>Период</dt><dd>Один месяц с момента демо-оплаты</dd></div>
          <div><dt>К оплате</dt><dd><strong>{money(connection.invoice.amountKopecks)}</strong></dd></div>
        </dl>
        {isPaid ? <div className="activation-result" role="status"><h3>Подписка активна</h3><p>{connection.company.name} подключена к {tariff.name}.</p><p>Период: {date(connection.subscription.startedAt!)} — {date(connection.subscription.expiresAt!)}</p><a className="button primary" href="/business/dashboard">Перейти в кабинет компании</a></div>
          : <><p className="field-hint">Это тестовый документ. Кнопка имитирует успешную оплату и активирует подписку на месяц. Банковские данные не требуются.</p><button className="button primary" onClick={() => persist(payConnection(connection))}>Оплатить (демо)</button></>}
        <div className="reset-section">{resetRequested ? <div className="reset-confirm"><p>Удалить тестовый счёт и подписку этой демо-компании?</p><button className="button secondary" onClick={resetDemo}>Да, начать заново</button><button className="button" onClick={() => setResetRequested(false)}>Отмена</button></div> : <button className="plain-button" onClick={() => setResetRequested(true)}>Начать демо заново</button>}</div>
      </section>}
    </main>
  </>;
}
