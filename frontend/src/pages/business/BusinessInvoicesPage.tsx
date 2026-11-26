import { useEffect, useState } from 'react';
import { SiteHeader } from '../../components/SiteHeader';
import { BusinessSidebar } from '../../components/BusinessSidebar';
import { BusinessInvoiceCard } from '../../components/BusinessInvoiceCard';
import { connectionKey, parseConnection } from '../../features/business/connection';
import { payStoredInvoice } from '../../features/business/invoices';

function readCompany() {
  try { return { connection: parseConnection(localStorage.getItem(connectionKey)), error: '' }; }
  catch { return { connection: null, error: 'Не удалось прочитать счета. Проверьте доступ к хранилищу браузера.' }; }
}

export function BusinessInvoicesPage() {
  const [stored, setStored] = useState(readCompany);
  const [error, setError] = useState('');
  useEffect(() => {
    const refresh = () => { setStored(readCompany()); setError(''); };
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  const { connection } = stored;

  function payDemo() {
    if (!connection) return;
    try {
      const paid = payStoredInvoice(connection.company.id, connection.invoice.id);
      setStored({ connection: paid, error: '' });
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось выполнить демо-оплату.'); }
  }

  return <>
    <a className="skip-link" href="#main">Перейти к содержимому</a><SiteHeader audience="business"/>
    {!connection ? <main id="main" className="container section dashboard-empty"><h1>Счета</h1>
      {stored.error ? <p role="alert">{stored.error}</p> : <><p>Счетов пока нет. Подключите демо-компанию и выберите тариф, чтобы создать тестовый счёт.</p><a className="button primary" href="/business/connect">Подключить компанию</a></>}
    </main> : <div className="container dashboard-layout"><BusinessSidebar current="invoices"/>
      <main id="main" className="dashboard-main invoices-page"><p className="company-label">{connection.company.name}</p><h1>Счета</h1>
        <p className="field-hint">В текущем демо один счёт на подключение компании. Статус и сумма совпадают с данными подписки.</p>
        {(error || stored.error) && <p className="form-error" role="alert">{error || stored.error}</p>}
        <section aria-label="Счета компании"><BusinessInvoiceCard connection={connection} onPay={payDemo}/></section>
      </main>
    </div>}
  </>;
}
