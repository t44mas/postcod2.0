import { useState } from 'react';
import { ArrowRight, Check, ChevronDown, Sparkles } from 'lucide-react';
import { SiteHeader } from '../../components/SiteHeader';
import { tariffs, estimateSavings } from '../../features/business/tariffs.mjs';

const money = (value: number) => new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
const faqs = [
  ['Что такое «Почта Премиум» для бизнеса?', 'Это концепция корпоративной подписки: компания выбирает тариф, назначает сотрудникам преимущества и контролирует их использование. Здесь представлен прототип для PostCode Challenge, а не действующая услуга Почты России.'],
  ['Как рассчитывается экономия?', 'Умножаем число отправлений и упаковок на модельную скидку тарифа, ограничиваем сумму месячным лимитом выгоды и вычитаем стоимость подписки. Персональные лимиты сотрудников могут дополнительно ограничивать фактическое использование.'],
  ['Что происходит, когда лимит закончился?', 'Преимущества сверх лимита не применяются. Базовые услуги остаются доступны по обычной стоимости. Модельный лимит обновляется каждый месяц, неиспользованный остаток не переносится.'],
  ['Можно ли подключить всю команду?', 'Business Start рассчитан на 10 сотрудников, Business Plus — на 30. В следующих страницах прототипа администратор сможет добавлять сотрудников, назначать персональные лимиты и управлять доступом.'],
  ['Нужно ли оплачивать подписку в прототипе?', 'Нет. При подключении создаётся тестовый счёт с кнопкой «Оплатить (демо)». Прототип не запрашивает банковские реквизиты и не списывает деньги.'],
];

export function BusinessPage() {
  const [selectedId, setSelectedId] = useState('plus');
  const [shipments, setShipments] = useState(40);
  const [packages, setPackages] = useState(10);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const tariff = tariffs.find(item => item.id === selectedId)!;
  const savings = estimateSavings(tariff, shipments, packages);

  return <>
    <a className="skip-link" href="#main">Перейти к содержимому</a>
    <SiteHeader audience="business"/>

    <main id="main">
      <section className="hero container">
        <div className="hero-content">
          <h1>Почта Премиум <span>для бизнеса</span></h1>
          <p>Корпоративная подписка на почтовые услуги. Общие преимущества для команды, персональные лимиты сотрудников и отчёт об экономии.</p>
          <a className="button primary" href="#plans">Выбрать тариф <ArrowRight size={18}/></a>
          <p className="model-note">Прототип. Цены и преимущества — модельные допущения, а не действующее предложение Почты России.</p>
        </div>
      </section>

      <section className="plans-section" id="plans"><div className="container section"><div className="section-heading"><div><h2>Тарифы</h2></div><span className="period-chip">Стоимость за месяц</span></div>
        <div className="plans-grid">{tariffs.map(plan => <article key={plan.id} className={`plan-card ${plan.id === 'plus' ? 'featured' : ''}`}>
          <h3>{plan.name}</h3><p className="plan-description">{plan.description}</p><div className="plan-price">{money(plan.price)}<span> / месяц</span></div>
          <a className={`button ${plan.id === 'plus' ? 'primary' : 'secondary'}`} href={`/business/connect?tariff=${plan.id}`}>Выбрать {plan.name} <ArrowRight size={17}/></a>
          <ul className="plan-features"><li><Check/>До {plan.employees} сотрудников</li><li><Check/>До {money(plan.cap)} выгоды в месяц</li><li><Check/>{money(plan.shippingDiscount)} скидки на отправление</li><li className={!plan.packagingDiscount ? 'muted' : ''}>{plan.packagingDiscount ? <Check/> : <span className="dash">—</span>}{plan.packagingDiscount ? `${money(plan.packagingDiscount)} скидки на упаковку` : 'Скидка на упаковку не включена'}</li><li><Check/>{plan.reporting}</li><li><Check/>Управление доступом и лимитами</li></ul>
        </article>)}</div>
        <p className="plans-footnote">Модельные тарифы для демонстрации. Лимит — максимальная сумма применённых преимуществ за месяц.<br/>Это не денежный баланс. Неиспользованные преимущества не переносятся на следующий период.</p>
      </div></section>

      <section className="container section" id="calculator"><div className="calculator-layout"><div className="calculator-intro"><h2>Расчёт выгоды</h2><p>Укажите количество услуг за месяц. Расчёт учитывает скидки, общий лимит компании и стоимость подписки.</p></div>
        <div className="calculator-card"><div className="calculator-title"><h3>Ваша выгода за месяц</h3><span>Демо-расчёт</span></div><div className="segmented" role="group" aria-label="Тариф для расчёта">{tariffs.map(plan => <button key={plan.id} aria-pressed={plan.id === selectedId} className={plan.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(plan.id)}>{plan.name}</button>)}</div>
          <div className="quantity-row"><label htmlFor="shipments">Отправлений в месяц</label><input id="shipments" type="number" min="0" max="1000" value={shipments} onChange={e => setShipments(Math.min(1000, Math.max(0, Math.floor(Number(e.target.value)) || 0)))}/></div><input className="range" aria-label="Количество отправлений" type="range" min="0" max="200" value={Math.min(200, shipments)} onChange={e => setShipments(Number(e.target.value))}/><div className="range-labels"><span>0</span><span>200</span></div>
          <div className="quantity-row packaging-row"><label htmlFor="packages">Упаковок в месяц</label><input id="packages" type="number" min="0" max="1000" value={packages} onChange={e => setPackages(Math.min(1000, Math.max(0, Math.floor(Number(e.target.value)) || 0)))}/></div>
          <div className="calculation-lines"><div><span>Выгода с учётом лимита</span><strong>{money(savings.applied)}</strong></div><div><span>Стоимость подписки</span><strong>− {money(tariff.price)}</strong></div></div>
          <div className={`savings-result ${savings.net < 0 ? 'negative' : ''}`} role="status" aria-live="polite"><div><span>{savings.net > 0 ? 'Ваша чистая экономия' : savings.net === 0 ? 'Подписка окупается' : 'При таком объёме не окупается'}</span><strong>{money(savings.net)}<small> / месяц</small></strong></div><Sparkles size={27}/></div>
          <p className="calculator-explanation">{savings.capped ? `Достигнут лимит ${money(tariff.cap)}: выгода сверх него не учитывается. ` : ''}{shipments} × {money(tariff.shippingDiscount)} + {packages} × {money(tariff.packagingDiscount)} − {money(tariff.price)}{savings.capped ? ' (с учётом лимита)' : ''}. Оценка для компании до распределения персональных лимитов.</p>
        </div></div></section>

      <section className="container section faq-section" id="faq"><div><h2>Вопросы и ответы</h2></div><div className="faq-list">{faqs.map(([question, answer], index) => <article className="faq-item" key={question}><h3><button id={`question-${index}`} aria-expanded={openFaq === index} aria-controls={`answer-${index}`} onClick={() => setOpenFaq(openFaq === index ? null : index)}>{question}<ChevronDown className={openFaq === index ? 'rotated' : ''} size={19}/></button></h3><div id={`answer-${index}`} role="region" aria-labelledby={`question-${index}`} hidden={openFaq !== index}><p>{answer}</p></div></article>)}</div></section>

    </main>
    <footer className="footer"><div className="container footer-bottom"><span>Почта Премиум · PostCode Challenge 2.0</span><p>Учебный прототип. Платежи и регистрация пока не подключены.</p></div></footer>

  </>;
}
