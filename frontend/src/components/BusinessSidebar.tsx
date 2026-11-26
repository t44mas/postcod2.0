export function BusinessSidebar({ current }: { current: 'dashboard' | 'employees' }) {
  return <aside className="business-sidebar"><nav aria-label="Разделы кабинета">
    <a href="/business/dashboard" aria-current={current === 'dashboard' ? 'page' : undefined}>Обзор</a>
    <a href="/business/employees" aria-current={current === 'employees' ? 'page' : undefined}>Сотрудники</a>
    <span aria-disabled="true">Бонусы и лимиты<small>Скоро</small></span>
    <span aria-disabled="true">Операции<small>Скоро</small></span>
    <a href="/business/connect">Тестовый счёт</a>
    <span aria-disabled="true">Отчёты<small>Скоро</small></span>
  </nav></aside>;
}
