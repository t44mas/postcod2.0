import { useState } from 'react';
import { SiteHeader } from '../../components/SiteHeader';
import { BusinessSidebar } from '../../components/BusinessSidebar';
import { tariffs } from '../../features/business/tariffs.mjs';
import { calculateEconomics, economicsAssumptions, scenarios } from '../../features/business/economics';
import type { EconomicsAssumptions, ScenarioId } from '../../features/business/economics';

const money = (value: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(value / 100);
const number = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
const assumptionsRows: { key: keyof EconomicsAssumptions; label: string; unit: 'count' | 'money' | 'percent' }[] = [
  { key: 'activeCompanies', label: 'Активные оплаченные компании, включая новых', unit: 'count' },
  { key: 'newCompanies', label: 'Новые платящие компании за месяц', unit: 'count' },
  { key: 'acquisitionBudget', label: 'Расходы на привлечение за месяц', unit: 'money' },
  { key: 'churnBps', label: 'Месячный отток (churn)', unit: 'percent' },
  { key: 'shipments', label: 'Отправлений со скидкой на компанию / мес.', unit: 'count' },
  { key: 'baselineShipments', label: 'Из них состоялись бы без подписки', unit: 'count' },
  { key: 'packages', label: 'Упаковок со скидкой на компанию / мес.', unit: 'count' },
  { key: 'shippingCost', label: 'Себестоимость льготы на отправление', unit: 'money' },
  { key: 'packagingCost', label: 'Себестоимость льготы на упаковку', unit: 'money' },
  { key: 'incrementalMargin', label: 'Маржа дополнительного отправления до льгот', unit: 'money' },
  { key: 'supportCost', label: 'Обслуживание одной компании / мес.', unit: 'money' },
  { key: 'courierUses', label: 'Среднее число курьерских заборов / мес. (P1)', unit: 'count' },
  { key: 'courierCost', label: 'Себестоимость одного забора (P1)', unit: 'money' },
  { key: 'slotUses', label: 'Среднее число бронирований / мес. (P1)', unit: 'count' },
  { key: 'slotCost', label: 'Себестоимость одного бронирования (P1)', unit: 'money' },
  { key: 'fixedCosts', label: 'Постоянные расходы на портфель / мес.', unit: 'money' },
];

export function BusinessEconomicsPage() {
  const [tariffId, setTariffId] = useState('plus');
  const [scenarioId, setScenarioId] = useState<ScenarioId>('base');
  const assumption = economicsAssumptions[tariffId][scenarioId];
  const model = calculateEconomics(tariffId, assumption);
  const comparison = scenarios.map(scenario => ({ ...scenario, model: calculateEconomics(tariffId, economicsAssumptions[tariffId][scenario.id]) }));

  return <>
    <a className="skip-link" href="#main">Перейти к содержимому</a><SiteHeader audience="business"/>
    <div className="container dashboard-layout"><BusinessSidebar current="economics"/><main id="main" className="dashboard-main economics-page">
      <p className="company-label">Внутренняя демо-модель команды</p><h1>Экономика тарифов</h1>
      <p className="field-hint">Все объёмы, затраты, CAC и churn ниже — модельные допущения для пилота, а не показатели Почты России. Цены и лимиты взяты из архитектуры проекта.</p>
      <div className="economics-controls"><label>Тариф<select value={tariffId} onChange={event => setTariffId(event.target.value)}>{tariffs.map(tariff => <option value={tariff.id} key={tariff.id}>{tariff.name} · {money(tariff.price * 100)} / мес.</option>)}</select></label>
        <fieldset><legend>Сценарий</legend><div className="economics-scenarios">{scenarios.map(scenario => <label key={scenario.id}><input type="radio" name="economics-scenario" value={scenario.id} checked={scenarioId === scenario.id} onChange={() => setScenarioId(scenario.id)}/>{scenario.name}</label>)}</div></fieldset>
      </div>

      <div className="economics-dual">
        <section className="dashboard-panel"><h2>Выгода клиента</h2><p className="field-hint">Одна компания за месяц</p><dl className="economics-lines">
          <div><dt>Скидки на {assumption.shipments} отправлений</dt><dd>{money(assumption.shipments * model.tariff.shippingDiscount * 100)}</dd></div>
          <div><dt>Скидки на {assumption.packages} упаковок</dt><dd>{money(assumption.packages * model.tariff.packagingDiscount * 100)}</dd></div>
          <div><dt>Применённая выгода с лимитом</dt><dd>{money(model.customer.applied * 100)}</dd></div>
          <div><dt>Подписка</dt><dd>− {money(model.feeKopecks)}</dd></div>
          <div className="economics-total"><dt>Чистая выгода клиента</dt><dd className={model.customer.net < 0 ? 'negative-value' : ''}>{money(model.customer.net * 100)}</dd></div>
        </dl><p className="field-hint">Лимит скидок {money(model.tariff.cap * 100)} / мес. Экономия времени и условная стоимость новых P1-льгот в денежную выгоду клиента не включены.</p></section>
        <section className="dashboard-panel"><h2>Экономика Почты</h2><p className="field-hint">Вклад одной компании за месяц</p><dl className="economics-lines">
          <div><dt>Подписочная выручка</dt><dd>{money(model.feeKopecks)}</dd></div>
          <div><dt>Себестоимость всех погашенных льгот</dt><dd>− {money(model.benefitCostsKopecks)}</dd></div>
          <div><dt>Переменное обслуживание</dt><dd>− {money(model.supportKopecks)}</dd></div>
          <div><dt>Валовой результат подписки</dt><dd>{money(model.subscriptionGrossKopecks)}</dd></div>
          <div><dt>Маржа {model.extraShipments} дополнительных отправлений</dt><dd>+ {money(model.extraMarginKopecks)}</dd></div>
          <div className="economics-total"><dt>Месячный вклад</dt><dd className={model.contributionKopecks <= 0 ? 'negative-value' : ''}>{money(model.contributionKopecks)}</dd></div>
        </dl><p className="field-hint">Затраты учтены и по тем отправлениям, которые состоялись бы без подписки. Выгода клиента и себестоимость льготы — разные величины.</p></section>
      </div>

      <section className="dashboard-panel"><h2>Портфель: {number(assumption.activeCompanies)} компаний</h2><p className="field-hint">Отдельный расчёт для выбранного тарифа. Компании Start и Plus здесь не суммируются.</p><dl className="economics-lines portfolio-lines">
        <div><dt>MRR — подписочная выручка / мес.</dt><dd>{money(model.mrrKopecks)}</dd></div>
        <div><dt>Вклад всех компаний до общих расходов</dt><dd>{money(model.totalContributionKopecks)}</dd></div>
        <div><dt>Постоянные расходы / мес.</dt><dd>− {money(model.fixedKopecks)}</dd></div>
        <div><dt>Привлечение новых компаний за месяц</dt><dd>− {money(model.acquisitionKopecks)}</dd></div>
        <div className="economics-total"><dt>Результат модели за месяц</dt><dd className={model.resultKopecks < 0 ? 'negative-value' : ''}>{money(model.resultKopecks)}</dd></div>
      </dl><p className="field-hint">Выручка от доставки не добавляется в MRR. Дополнительные отправления учтены через маржу до льгот; их полная выручка повторно не прибавляется.</p>
        <dl className="economics-unit-metrics"><div><dt>CAC</dt><dd>{model.cacKopecks === null ? 'Нет новых клиентов' : money(model.cacKopecks)}</dd></div><div><dt>Churn / мес.</dt><dd>{number(assumption.churnBps / 100)}%</dd></div><div><dt>LTV по вкладу</dt><dd>{model.ltvKopecks === null ? 'Не рассчитывается' : money(model.ltvKopecks)}</dd></div><div><dt>LTV / CAC</dt><dd>{model.ltvCac === null ? 'Не рассчитывается' : number(model.ltvCac)}</dd></div></dl>
        <p className="economics-break-even">{model.breakEvenCompanies === null ? 'Безубыточность не достигается: вклад одной компании неположительный.' : `Для покрытия постоянных расходов и заданного бюджета привлечения нужно ${number(model.breakEvenCompanies)} компаний при неизменном вкладе.`}</p>
        {model.ltvKopecks === null && <p className="field-hint">При неположительном вкладе или нулевом churn положительная оценка LTV не выводится.</p>}
      </section>

      {tariffId === 'plus' && <section className="dashboard-panel"><h2>Затраты на новые льготы Plus (P1)</h2><p className="field-hint">В проектной версии тарифа — до двух заборов и двух записей на сдачу партии в месяц. Реальные заявки и бронирования в прототипе пока не подключены, но их ожидаемая себестоимость уже учтена в модели.</p><dl className="economics-lines"><div><dt>Курьерские заборы: {assumption.courierUses} × {money(assumption.courierCost * 100)}</dt><dd>{money(model.courierCostsKopecks)}</dd></div><div><dt>Запись на сдачу: {assumption.slotUses} × {money(assumption.slotCost * 100)}</dt><dd>{money(model.slotCostsKopecks)}</dd></div></dl><p className="field-hint">Это отдельные штучные пакеты. Они не увеличивают рублёвый лимит 4 000 ₽. Рост использования или себестоимости может сделать тариф убыточным.</p></section>}

      <section className="dashboard-panel"><h2>Три сценария: {model.tariff.name}</h2><div className="report-table-wrap"><table className="report-table economics-table"><caption className="visually-hidden">Модельные результаты трёх сценариев</caption><thead><tr><th scope="col">Сценарий</th><th scope="col">Выгода клиента / мес.</th><th scope="col">Вклад компании / мес.</th><th scope="col">Результат портфеля / мес.</th></tr></thead><tbody>{comparison.map(scenario => <tr key={scenario.id}><th scope="row">{scenario.name}</th><td data-label="Выгода клиента / мес.">{money(scenario.model.customer.net * 100)}</td><td data-label="Вклад компании / мес.">{money(scenario.model.contributionKopecks)}</td><td data-label="Результат портфеля / мес.">{money(scenario.model.resultKopecks)}</td></tr>)}</tbody></table></div></section>

      <details className="dashboard-panel economics-assumptions"><summary>Численные допущения всех сценариев</summary><p className="field-hint">Источник всех параметров ниже — гипотезы команды для демонстрации. Это не измеренные данные. В объёмах предполагается погашение скидки на каждую указанную услугу в пределах лимита тарифа.</p><div className="report-table-wrap"><table className="report-table economics-table"><caption className="visually-hidden">Таблица модельных допущений для выбранного тарифа</caption><thead><tr><th scope="col">Параметр</th>{scenarios.map(scenario => <th scope="col" key={scenario.id}>{scenario.name}</th>)}</tr></thead><tbody>{assumptionsRows.map(row => <tr key={row.key}><th scope="row">{row.label}</th>{scenarios.map(scenario => { const value = economicsAssumptions[tariffId][scenario.id][row.key]; return <td key={scenario.id} data-label={scenario.name}>{row.unit === 'money' ? money(value * 100) : row.unit === 'percent' ? `${number(value / 100)}%` : number(value)}</td>; })}</tr>)}</tbody></table></div></details>

      <details className="dashboard-panel economics-formulas"><summary>Формулы и ограничения модели</summary><ul>
        <li>MRR = активные оплаченные компании × месячная цена тарифа. Новые компании уже входят в активные.</li>
        <li>Дополнительные отправления = отправления с подпиской − ожидаемые отправления без неё.</li>
        <li>Вклад компании = подписка + маржа дополнительных отправлений − все погашенные льготы − переменное обслуживание.</li>
        <li>CAC = расходы на привлечение / новые платящие компании.</li>
        <li>Churn — доля компаний, не продливших подписку за месяц, от платящих на начало месяца. Пауза в этой модели приравнивается к непродлению.</li>
        <li>LTV ≈ положительный месячный вклад / месячный churn; предполагаются постоянные параметры без дисконтирования.</li>
        <li>Безубыточность = округление вверх (постоянные расходы + заданный бюджет привлечения) / положительный вклад компании.</li>
        <li>Модель не включает налоги, капитальные вложения и неподтверждённую партнёрскую выручку. Предположения о приросте отправлений и себестоимости нужно проверить пилотом.</li>
      </ul></details>
    </main></div>
  </>;
}
