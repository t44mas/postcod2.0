import { useEffect, useState } from 'react';
import { SiteHeader } from '../../components/SiteHeader';
import { connectionKey, parseConnection } from '../../features/business/connection';
import { getDashboard } from '../../features/business/dashboard';

const money = (kopecks: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(kopecks / 100);
const date = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
const dateTime = (value: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

function readConnection() {
  try { return { connection: parseConnection(localStorage.getItem(connectionKey)), error: false }; }
  catch { return { connection: null, error: true }; }
}

export function BusinessDashboardPage() {
  const [stored, setStored] = useState(readConnection);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => { setStored(readConnection()); setNow(new Date()); };
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh); window.clearInterval(timer); };
  }, []);
  const { connection, error } = stored;
  const dashboard = getDashboard(connection, now);

  return <>
    <a className="skip-link" href="#main">Перейти к содержимому</a>
    <SiteHeader audience="business"/>
    {!connection || !dashboard ? <main id="main" className="container section dashboard-empty">
      <h1>Кабинет компании</h1>
      {error ? <p role="alert">Не удалось прочитать данные демо. Разрешите хранение данных в браузере и обновите страницу.</p>
        : <><p>Компания ещё не подключена. Выберите тариф и создайте тестовый счёт, чтобы открыть обзор подписки.</p><a className="button primary" href="/business#plans">Выбрать тариф</a></>}
    </main> : <div className="container dashboard-layout">
      <aside className="business-sidebar"><nav aria-label="Разделы кабинета">
        <a href="/business/dashboard" aria-current="page">Обзор</a>
        {['Сотрудники', 'Бонусы и лимиты', 'Операции'].map(label => <span key={label} aria-disabled="true">{label}<small>Скоро</small></span>)}
        <a href="/business/connect">Тестовый счёт</a>
        <span aria-disabled="true">Отчёты<small>Скоро</small></span>
      </nav></aside>
      <main id="main" className="dashboard-main">
        <div className="dashboard-heading"><div><p className="company-label">{connection.company.name}</p><h1>Обзор компании</h1></div><span className={`invoice-status ${dashboard.status === 'active' ? 'paid' : ''}`}>
          {dashboard.status === 'active' ? 'Подписка активна' : dashboard.status === 'expired' ? 'Срок подписки истёк' : 'Ожидает оплаты'}
        </span></div>
        <p className="field-hint">Демо-кабинет администратора. Цены и преимущества — модельные допущения.</p>
        {dashboard.status === 'pending_payment' && <div className="dashboard-notice"><p>Оплатите тестовый счёт, чтобы активировать преимущества компании.</p><a className="button primary" href="/business/connect">К демо-оплате</a></div>}
        {dashboard.status === 'expired' && <div className="dashboard-notice"><p>Оплаченный период завершён. Преимущества недоступны. В разделе подключения можно начать новый демо-сценарий.</p><a className="button secondary" href="/business/connect">Открыть подключение</a></div>}

        <section className="dashboard-kpis" aria-label="Показатели подписки">
          <article className="dashboard-kpi"><h2>Тариф</h2><strong className="tariff-kpi">{dashboard.tariff.name}</strong><p>{money(dashboard.tariff.price * 100)} / месяц</p><small>{connection.subscription.startedAt ? <>{date(connection.subscription.startedAt)} — {date(connection.subscription.expiresAt!)}</> : 'Месяц с момента демо-оплаты'}</small></article>
          <article className="dashboard-kpi"><h2>Сотрудники</h2><strong>{dashboard.employees} <small>из {dashboard.tariff.employees}</small></strong><p>Подключённых сотрудников</p><small>Администратор пока не назначал преимущества.</small></article>
          <article className="dashboard-kpi"><h2>Доступный лимит</h2><strong>{money(dashboard.availableKopecks)}</strong><p>Из {money(dashboard.tariff.cap * 100)} за период</p><small>{dashboard.status === 'active' ? 'Ограничение суммы преимуществ.' : 'Доступен только при активной подписке.'}</small></article>
          <article className="dashboard-kpi"><h2>Чистая выгода</h2><strong className={dashboard.netKopecks < 0 ? 'negative-value' : ''}>{money(dashboard.netKopecks)}</strong><p>Преимущества минус подписка</p><small>{dashboard.netKopecks < 0 ? 'Преимущества ещё не использовались, стоимость подписки учтена.' : 'Счёт пока не оплачен, расходов нет.'}</small></article>
        </section>

        <section className="dashboard-panel" aria-labelledby="limit-heading"><h2 id="limit-heading">Расход лимита</h2><div className="limit-heading"><span>Использовано {money(dashboard.usedKopecks)}</span><span>Лимит {money(dashboard.tariff.cap * 100)}</span></div><progress className="limit-progress" value={dashboard.usedKopecks} max={dashboard.tariff.cap * 100} aria-label="Использовано лимита преимуществ"/><p className="field-hint">Лимит — это доступная выгода от преимуществ, а не денежный баланс. Неиспользованный остаток не переносится.</p><dl className="dashboard-economy"><div><dt>Применённые преимущества</dt><dd>{money(dashboard.savingsKopecks)}</dd></div><div><dt>Оплаченная подписка</dt><dd>{money(dashboard.feeKopecks)}</dd></div><div><dt>Чистая выгода</dt><dd>{money(dashboard.netKopecks)}</dd></div></dl></section>

        <section className="dashboard-panel team-empty" aria-labelledby="team-heading"><h2 id="team-heading">Команда</h2><p>Сотрудники пока не добавлены.</p><button className="button secondary" disabled aria-describedby="employee-next-step">Добавить сотрудника</button><p id="employee-next-step" className="field-hint">Добавление сотрудников и назначение лимитов появятся на следующей странице.</p></section>

        <section className="dashboard-panel" aria-labelledby="events-heading"><h2 id="events-heading">Последние события</h2><ol className="dashboard-events">
          {connection.invoice.paidAt && <li><div><strong>Подписка {dashboard.tariff.name} активирована</strong><p>Тестовый счёт оплачен: {money(connection.invoice.amountKopecks)}.</p></div><time dateTime={connection.invoice.paidAt}>{dateTime(connection.invoice.paidAt)} МСК</time></li>}
          <li><div><strong>Тестовый счёт создан</strong><p>{dashboard.tariff.name} · {money(connection.invoice.amountKopecks)}</p></div><time dateTime={connection.invoice.createdAt}>{dateTime(connection.invoice.createdAt)} МСК</time></li>
        </ol><p className="field-hint">Операций с преимуществами пока нет.</p></section>
      </main>
    </div>}
  </>;
}
