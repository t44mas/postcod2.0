import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/500.css';
import '@fontsource/golos-text/600.css';
import '@fontsource/golos-text/700.css';
import { BusinessPage } from './pages/business/BusinessPage';
import { BusinessConnectPage } from './pages/business/BusinessConnectPage';
import { BusinessDashboardPage } from './pages/business/BusinessDashboardPage';
import { BusinessEmployeesPage } from './pages/business/BusinessEmployeesPage';
import { BusinessBenefitsPage } from './pages/business/BusinessBenefitsPage';
import { BusinessInvoicesPage } from './pages/business/BusinessInvoicesPage';
import { PersonalPlaceholder } from './pages/personal/PersonalPlaceholder';
import './styles.css';

const path = window.location.pathname.replace(/\/+$/, '');
const isPersonal = path === '/personal';
const isConnect = path === '/business/connect';
const isDashboard = path === '/business/dashboard';
const isEmployees = path === '/business/employees';
const isBenefits = path === '/business/benefits';
const isInvoices = path === '/business/invoices';
document.title = isPersonal ? 'Почта Премиум — частным лицам' : isConnect ? 'Подключение компании — Почта Премиум' : isEmployees ? 'Сотрудники — Почта Премиум' : isBenefits ? 'Бонусы и лимиты — Почта Премиум' : isInvoices ? 'Счета — Почта Премиум' : isDashboard ? 'Кабинет компании — Почта Премиум' : 'Почта Премиум — для бизнеса';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isPersonal ? <PersonalPlaceholder/> : isConnect ? <BusinessConnectPage/> : isEmployees ? <BusinessEmployeesPage/> : isBenefits ? <BusinessBenefitsPage/> : isInvoices ? <BusinessInvoicesPage/> : isDashboard ? <BusinessDashboardPage/> : <BusinessPage/>}</React.StrictMode>,
);
