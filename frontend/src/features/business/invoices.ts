import { connectionKey, parseConnection, payConnection } from './connection.ts';

export function payStoredInvoice(
  companyId: string,
  invoiceId: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
  now = new Date(),
) {
  let latest;
  try { latest = parseConnection(storage.getItem(connectionKey)); }
  catch { throw new Error('Не удалось прочитать счёт. Проверьте доступ к хранилищу браузера.'); }
  if (!latest || latest.company.id !== companyId || latest.invoice.id !== invoiceId) {
    throw new Error('Компания или счёт изменились. Обновите страницу.');
  }
  if (latest.invoice.status === 'paid') return latest;
  const paid = payConnection(latest, now);
  try { storage.setItem(connectionKey, JSON.stringify(paid)); }
  catch { throw new Error('Не удалось сохранить демо-оплату. Проверьте доступ к хранилищу браузера и повторите действие.'); }
  return paid;
}
