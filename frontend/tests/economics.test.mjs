import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEconomics, economicsAssumptions } from '../src/features/business/economics.ts';

test('Plus: базовый сценарий учитывает 710 ₽ выгоды клиента и все затраты оператора', () => {
  const result = calculateEconomics('plus', economicsAssumptions.plus.base);
  assert.equal(result.customer.net, 710);
  assert.equal(result.benefitCostsKopecks, 256000);
  assert.equal(result.contributionKopecks, 71000);
  assert.equal(result.mrrKopecks, 74700000);
  assert.equal(result.totalContributionKopecks, 21300000);
  assert.equal(result.resultKopecks, -3700000);
  assert.equal(result.cacKopecks, 200000);
  assert.equal(result.ltvKopecks, 1420000);
  assert.equal(result.ltvCac, 7.1);
  assert.equal(result.breakEvenCompanies, 353);
});

test('Пессимистичный Plus убыточен; положительные LTV и безубыточность не выдумываются', () => {
  const result = calculateEconomics('plus', economicsAssumptions.plus.pessimistic);
  assert.equal(result.customer.net, 1410);
  assert.equal(result.contributionKopecks, -248000);
  assert.equal(result.resultKopecks, -47800000);
  assert.equal(result.ltvKopecks, null);
  assert.equal(result.ltvCac, null);
  assert.equal(result.breakEvenCompanies, null);
});

test('Без прироста отправлений льготы продолжают создавать расходы, дополнительная маржа исчезает', () => {
  const input = economicsAssumptions.plus.base;
  const result = calculateEconomics('plus', { ...input, baselineShipments: input.shipments });
  assert.equal(result.extraShipments, 0);
  assert.equal(result.extraMarginKopecks, 0);
  assert.equal(result.shippingCostsKopecks, 180000);
  assert.equal(result.contributionKopecks, -19000);
});

test('Start не включает P1-пакеты; при масштабе портфеля фиксированные расходы не умножаются', () => {
  const result = calculateEconomics('start', economicsAssumptions.start.base);
  assert.equal(result.customer.net, 210);
  assert.equal(result.courierCostsKopecks, 0);
  assert.equal(result.slotCostsKopecks, 0);
  assert.equal(result.contributionKopecks, 44000);
  assert.equal(result.resultKopecks, -11800000);
  assert.equal(result.breakEvenCompanies, 569);
  const optimistic = calculateEconomics('plus', economicsAssumptions.plus.optimistic);
  assert.equal(optimistic.resultKopecks, 180100000);
});

test('При нулевом churn или отсутствии новых компаний показатели не делятся на ноль', () => {
  const result = calculateEconomics('plus', { ...economicsAssumptions.plus.base, churnBps: 0, newCompanies: 0, acquisitionBudget: 0 });
  assert.equal(result.ltvKopecks, null);
  assert.equal(result.cacKopecks, null);
  assert.equal(result.ltvCac, null);
});

test('Невозможные или превышающие тарифные ограничения допущения отклоняются', () => {
  assert.throws(() => calculateEconomics('plus', { ...economicsAssumptions.plus.base, baselineShipments: 100 }), /допущения/);
  assert.throws(() => calculateEconomics('plus', { ...economicsAssumptions.plus.base, courierUses: 3 }), /соответствуют/);
  assert.throws(() => calculateEconomics('start', { ...economicsAssumptions.start.base, packages: 1 }), /соответствуют/);
  assert.throws(() => calculateEconomics('plus', { ...economicsAssumptions.plus.base, shipments: 100 }), /больше погашенных/);
});
