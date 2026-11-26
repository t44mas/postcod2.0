import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BusinessApi } from '../services/businessApi';
import type { DemoConnection } from '../features/business/connection';
import type { Employee } from '../features/business/employees';
import type { BenefitGrant, BenefitUsage, BenefitCode } from '../features/business/benefits';

type Backend = {
  connection: DemoConnection | null; busy: boolean;
  connect(name: string, tariffId: string): Promise<void>;
  pay(invoiceId: string): Promise<void>;
  addEmployee(name: string, role: Employee['role']): Promise<void>;
  updateEmployee(id: string, change: Partial<Pick<Employee, 'role' | 'status'>>): Promise<void>;
  grant(value: BenefitGrant): Promise<void>;
  activate(employeeId: string, input: { code: BenefitCode; originalKopecks: number; requestKey: string }): Promise<BenefitUsage>;
  reset(companyId: string): Promise<void>;
};
const Context = createContext<Backend | null>(null);
export function useBackend() { return useContext(Context); }

export function BackendProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new BusinessApi());
  const [connection, setConnection] = useState<DemoConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mutation = useRef(false);
  const initialRequest = useRef<Promise<DemoConnection | null> | null>(null);
  async function refresh() { setConnection(await client.state()); }
  async function run<T>(action: () => Promise<T>): Promise<T> {
    if (mutation.current) throw new Error('Предыдущее действие ещё выполняется.');
    mutation.current = true; setBusy(true);
    try {
      const result = await action();
      await refresh();
      try { const channel = new BroadcastChannel('pochta-premium-api'); channel.postMessage('updated'); channel.close(); } catch { /* Optional cross-tab refresh. */ }
      return result;
    } finally { mutation.current = false; setBusy(false); }
  }
  useEffect(() => {
    let alive = true;
    initialRequest.current ??= client.state();
    initialRequest.current.then(value => { if (alive) { setConnection(value); setLoading(false); } }).catch(reason => { if (alive) { setError(reason instanceof Error ? reason.message : 'Не удалось загрузить API.'); setLoading(false); } });
    const update = () => { if (!mutation.current) client.state().then(value => { if (alive) setConnection(value); }).catch(() => { /* Explicit mutations display actionable errors. */ }); };
    window.addEventListener('focus', update);
    let channel: BroadcastChannel | undefined;
    try { channel = new BroadcastChannel('pochta-premium-api'); channel.onmessage = update; } catch { /* Not available in all browsers. */ }
    return () => { alive = false; window.removeEventListener('focus', update); channel?.close(); };
  }, [client]);

  const context: Backend = {
    connection, busy,
    connect: (name, id) => run(() => client.connect(name, id)),
    pay: id => run(() => client.pay(id)),
    addEmployee: (name, role) => run(() => client.addEmployee(name, role)),
    updateEmployee: (id, change) => run(() => client.updateEmployee(id, change)),
    grant: value => run(() => client.grant(value)),
    activate: (id, input) => run(() => client.activate(id, input)),
    reset: id => run(() => client.reset(id)),
  };
  if (loading) return <main className="container section"><p role="status">Загружаем кабинет из PostgreSQL…</p></main>;
  if (error) return <main className="container section"><h1>Не удалось подключиться к API</h1><p role="alert">{error}</p><button className="button primary" onClick={() => { setError(''); setLoading(true); client.state().then(value => setConnection(value)).catch(reason => setError(reason instanceof Error ? reason.message : 'Ошибка API')).finally(() => setLoading(false)); }}>Повторить</button></main>;
  return <Context.Provider value={context}><div aria-busy={busy}>{children}</div></Context.Provider>;
}
