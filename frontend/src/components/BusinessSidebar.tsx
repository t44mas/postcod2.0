export function BusinessSidebar({ current }: { current: 'dashboard' | 'employees' | 'benefits' | 'invoices' | 'operations' | 'reports' | 'economics' }) {
  return <aside className="business-sidebar"><nav aria-label="Разделы кабинета">
    <a href="/business/dashboard" aria-current={current === 'dashboard' ? 'page' : undefined}>Обзор</a>
    <a href="/business/employees" aria-current={current === 'employees' ? 'page' : undefined}>Сотрудники</a>
    <a href="/business/benefits" aria-current={current === 'benefits' ? 'page' : undefined}>Бонусы и лимиты</a>
    <a href="/business/operations" aria-current={current === 'operations' ? 'page' : undefined}>Операции</a>
    <a href="/business/invoices" aria-current={current === 'invoices' ? 'page' : undefined}>Счета</a>
    <a href="/business/reports" aria-current={current === 'reports' ? 'page' : undefined}>Отчёты</a>
    <a href="/business/economics" aria-current={current === 'economics' ? 'page' : undefined}>Экономика (демо)</a>
  </nav></aside>;
}
