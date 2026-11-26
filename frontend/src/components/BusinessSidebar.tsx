export function BusinessSidebar({ current }: { current: 'dashboard' | 'employees' | 'benefits' }) {
  return <aside className="business-sidebar"><nav aria-label="Разделы кабинета">
    <a href="/business/dashboard" aria-current={current === 'dashboard' ? 'page' : undefined}>Обзор</a>
    <a href="/business/employees" aria-current={current === 'employees' ? 'page' : undefined}>Сотрудники</a>
    <a href="/business/benefits" aria-current={current === 'benefits' ? 'page' : undefined}>Бонусы и лимиты</a>
    <span aria-disabled="true">Операции<small>Скоро</small></span>
    <a href="/business/connect">Тестовый счёт</a>
    <span aria-disabled="true">Отчёты<small>Скоро</small></span>
  </nav></aside>;
}
