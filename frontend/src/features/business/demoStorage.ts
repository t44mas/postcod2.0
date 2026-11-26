import { connectionKey, createConnection, parseConnection } from './connection.ts';

type DemoStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function createStoredConnection(name: string, tariffId: string, storage: Pick<DemoStorage, 'getItem' | 'setItem'> = localStorage, now = new Date()) {
  const raw = storage.getItem(connectionKey);
  if (raw !== null) {
    if (parseConnection(raw)) throw new Error('Компания уже создана в другой вкладке. Обновите страницу.');
    throw new Error('Сохранённые демо-данные повреждены. Сначала подтвердите их сброс.');
  }
  const connection = createConnection(name, tariffId, now);
  storage.setItem(connectionKey, JSON.stringify(connection));
  return connection;
}

export function resetStoredConnection(expectedCompanyId: string | null, storage: Pick<DemoStorage, 'getItem' | 'removeItem'> = localStorage) {
  const raw = storage.getItem(connectionKey);
  if (raw === null) return;
  const current = parseConnection(raw);
  if ((expectedCompanyId === null && current !== null)
    || (expectedCompanyId !== null && current?.company.id !== expectedCompanyId)) {
    throw new Error('Демо-компания изменилась. Обновите страницу перед сбросом.');
  }
  storage.removeItem(connectionKey);
}
