import { useState } from 'react';
import { Menu, Package, X } from 'lucide-react';

export function SiteHeader({ audience }: { audience: 'business' | 'personal' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isBusiness = audience === 'business';

  return <header className="header">
    <div className="container header-top">
      <a className="brand" href="/business" aria-label="Почта Премиум — главная для бизнеса"><span className="brand-symbol"><Package size={28} strokeWidth={1.5}/></span><span className="brand-name">ПОЧТА РОССИИ<span>ПРЕМИУМ</span></span></a>
      <nav className="audience-nav" aria-label="Аудитория">
        <a href="/personal" className={!isBusiness ? 'active' : undefined} aria-current={!isBusiness ? 'page' : undefined}>Частным лицам</a>
        <a href="/business" className={isBusiness ? 'active' : undefined} aria-current={isBusiness ? 'page' : undefined}>Бизнесу</a>
      </nav>
      {isBusiness && <button className="mobile-menu icon-button" aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={menuOpen} aria-controls="section-nav" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X/> : <Menu/>}</button>}
    </div>
    {isBusiness && <div className={`nav-border ${menuOpen ? 'menu-open' : ''}`}><nav id="section-nav" className="container section-nav" aria-label="Разделы страницы">
      <a href="/business#plans" onClick={() => setMenuOpen(false)}>Тарифы</a>
      <a href="/business#calculator" onClick={() => setMenuOpen(false)}>Расчёт выгоды</a>
      <a href="/business#faq" onClick={() => setMenuOpen(false)}>Вопросы и ответы</a>
      <a href="/business/dashboard" onClick={() => setMenuOpen(false)}>Кабинет компании</a>
    </nav></div>}
  </header>;
}
