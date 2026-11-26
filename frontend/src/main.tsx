import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/500.css';
import '@fontsource/golos-text/600.css';
import '@fontsource/golos-text/700.css';
import { BusinessPage } from './pages/business/BusinessPage';
import { BusinessConnectPage } from './pages/business/BusinessConnectPage';
import { BusinessDashboardPage } from './pages/business/BusinessDashboardPage';
import { PersonalPlaceholder } from './pages/personal/PersonalPlaceholder';
import './styles.css';

const path = window.location.pathname.replace(/\/+$/, '');
const isPersonal = path === '/personal';
const isConnect = path === '/business/connect';
const isDashboard = path === '/business/dashboard';
document.title = isPersonal ? 'Почта Премиум — частным лицам' : isConnect ? 'Подключение компании — Почта Премиум' : isDashboard ? 'Кабинет компании — Почта Премиум' : 'Почта Премиум — для бизнеса';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isPersonal ? <PersonalPlaceholder/> : isConnect ? <BusinessConnectPage/> : isDashboard ? <BusinessDashboardPage/> : <BusinessPage/>}</React.StrictMode>,
);
