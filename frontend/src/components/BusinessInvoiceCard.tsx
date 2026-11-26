import type { DemoConnection } from '../features/business/connection';
import { tariffs } from '../features/business/tariffs.mjs';

const money = (value: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(value / 100);
const date = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));

export function BusinessInvoiceCard({ connection, onPay, busy }: { connection: DemoConnection; onPay: () => void; busy?: boolean }) {
  const { invoice, subscription, company } = connection;
  const tariff = tariffs.find(item => item.id === subscription.tariffId)!;
  const paid = invoice.status === 'paid';
  const expired = paid && Date.parse(subscription.expiresAt!) <= Date.now();
  const inactive = paid && (expired || subscription.status !== 'active');

  return <article className="invoice-panel invoice-card" aria-labelledby="invoice-number">
    <div className="invoice-heading"><h2 id="invoice-number">Счёт ДЕМО-{invoice.id.slice(0, 8).toUpperCase()}</h2><span className={`invoice-status ${paid ? 'paid' : ''}`}>{paid ? 'Оплачен (демо)' : 'Ожидает демо-оплаты'}</span></div>
    <p className="invoice-card-description">{tariff.name} · {date(invoice.createdAt)}</p>
    <p className="invoice-amount"><span>{paid ? 'Оплачено' : 'К оплате'}</span><strong>{money(invoice.amountKopecks)}</strong></p>
    <details className="invoice-disclosure"><summary>Детали счёта</summary><dl className="invoice-details">
      <div><dt>Компания</dt><dd>{company.name}</dd></div>
      <div><dt>Тариф</dt><dd>{tariff.name}</dd></div>
      <div><dt>Дата счёта</dt><dd>{date(invoice.createdAt)}</dd></div>
      <div><dt>Валюта</dt><dd>Российский рубль (RUB)</dd></div>
      <div><dt>Период подписки</dt><dd>{paid ? <>{date(subscription.startedAt!)} — {date(subscription.expiresAt!)}</> : 'Один месяц с момента демо-оплаты'}</dd></div>
      {invoice.paidAt && <div><dt>Дата оплаты</dt><dd>{date(invoice.paidAt)}</dd></div>}
    </dl></details>
    {paid ? <div className={inactive ? 'dashboard-notice invoice-paid-result' : 'activation-result'} role="status">
      <h3>{expired ? 'Оплаченный период завершён' : inactive ? 'Подписка неактивна' : 'Подписка активна'}</h3>
      <p>{inactive ? 'Этот счёт остаётся оплаченным. Повторная оплата не меняет статус и не продлевает подписку.' : `Компания подключена к ${tariff.name}. Период действует до ${date(subscription.expiresAt!)} `}</p>
      <a className="button primary" href="/business/dashboard">Перейти в кабинет компании</a>
    </div> : <div className="invoice-pay-action"><p className="field-hint">Тестовый счёт. Демо-оплата активирует подписку на месяц. Реальные деньги не списываются, банковские данные не нужны.</p><button type="button" className="button primary" onClick={onPay} disabled={busy}>Оплатить (демо)</button></div>}
  </article>;
}
