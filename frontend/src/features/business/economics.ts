import { tariffs, estimateSavings } from './tariffs.mjs';

export type EconomicsAssumptions = {
  activeCompanies: number; newCompanies: number; acquisitionBudget: number; churnBps: number;
  shipments: number; baselineShipments: number; packages: number;
  shippingCost: number; packagingCost: number; incrementalMargin: number; supportCost: number;
  courierUses: number; courierCost: number; slotUses: number; slotCost: number; fixedCosts: number;
};

export const scenarios = [
  { id: 'pessimistic', name: 'Пессимистичный' },
  { id: 'base', name: 'Базовый' },
  { id: 'optimistic', name: 'Оптимистичный' },
] as const;
export type ScenarioId = typeof scenarios[number]['id'];

// Только модельные гипотезы. Денежные исходные параметры — целые рубли,
// расчёты — в копейках. Активные компании уже включают новых клиентов.
const common = {
  pessimistic: { activeCompanies: 100, newCompanies: 20, acquisitionBudget: 80000, churnBps: 1000, fixedCosts: 150000 },
  base: { activeCompanies: 300, newCompanies: 50, acquisitionBudget: 100000, churnBps: 500, fixedCosts: 150000 },
  optimistic: { activeCompanies: 700, newCompanies: 100, acquisitionBudget: 100000, churnBps: 300, fixedCosts: 150000 },
};

export const economicsAssumptions: Record<string, Record<ScenarioId, EconomicsAssumptions>> = {
  start: {
    pessimistic: { ...common.pessimistic, shipments: 35, baselineShipments: 35, packages: 0, shippingCost: 45, packagingCost: 0, incrementalMargin: 50, supportCost: 180, courierUses: 0, courierCost: 0, slotUses: 0, slotCost: 0 },
    base: { ...common.base, shipments: 30, baselineShipments: 25, packages: 0, shippingCost: 30, packagingCost: 0, incrementalMargin: 90, supportCost: 100, courierUses: 0, courierCost: 0, slotUses: 0, slotCost: 0 },
    optimistic: { ...common.optimistic, shipments: 30, baselineShipments: 15, packages: 0, shippingCost: 20, packagingCost: 0, incrementalMargin: 120, supportCost: 70, courierUses: 0, courierCost: 0, slotUses: 0, slotCost: 0 },
  },
  plus: {
    pessimistic: { ...common.pessimistic, shipments: 50, baselineShipments: 48, packages: 10, shippingCost: 60, packagingCost: 35, incrementalMargin: 50, supportCost: 220, courierUses: 2, courierCost: 650, slotUses: 2, slotCost: 100 },
    base: { ...common.base, shipments: 40, baselineShipments: 30, packages: 10, shippingCost: 45, packagingCost: 25, incrementalMargin: 90, supportCost: 120, courierUses: 1, courierCost: 450, slotUses: 1, slotCost: 60 },
    optimistic: { ...common.optimistic, shipments: 40, baselineShipments: 20, packages: 10, shippingCost: 35, packagingCost: 20, incrementalMargin: 120, supportCost: 80, courierUses: 1, courierCost: 250, slotUses: 1, slotCost: 30 },
  },
};

export function calculateEconomics(tariffId: string, input: EconomicsAssumptions) {
  const tariff = tariffs.find(item => item.id === tariffId);
  if (!tariff) throw new Error('Тариф не найден.');
  if (Object.values(input).some(value => !Number.isSafeInteger(value) || value < 0)
    || input.activeCompanies > 100000 || input.newCompanies > input.activeCompanies
    || input.churnBps > 10000 || input.baselineShipments > input.shipments) throw new Error('Проверьте допущения сценария.');
  if (input.courierUses > 2 || input.slotUses > 2
    || (tariffId === 'start' && (input.courierUses || input.slotUses || input.packages))) throw new Error('Льготы не соответствуют тарифу.');
  const customer = estimateSavings(tariff, input.shipments, input.packages);
  if (customer.capped) throw new Error('Сценарий предполагает больше погашенных скидок, чем допускает лимит.');
  const feeKopecks = tariff.price * 100;
  const shippingCostsKopecks = input.shipments * input.shippingCost * 100;
  const packagingCostsKopecks = input.packages * input.packagingCost * 100;
  const courierCostsKopecks = input.courierUses * input.courierCost * 100;
  const slotCostsKopecks = input.slotUses * input.slotCost * 100;
  const benefitCostsKopecks = shippingCostsKopecks + packagingCostsKopecks + courierCostsKopecks + slotCostsKopecks;
  const supportKopecks = input.supportCost * 100;
  const extraShipments = input.shipments - input.baselineShipments;
  const extraMarginKopecks = extraShipments * input.incrementalMargin * 100;
  const subscriptionGrossKopecks = feeKopecks - benefitCostsKopecks - supportKopecks;
  const contributionKopecks = subscriptionGrossKopecks + extraMarginKopecks;
  const mrrKopecks = feeKopecks * input.activeCompanies;
  const totalContributionKopecks = contributionKopecks * input.activeCompanies;
  const fixedKopecks = input.fixedCosts * 100;
  const acquisitionKopecks = input.acquisitionBudget * 100;
  const resultKopecks = totalContributionKopecks - fixedKopecks - acquisitionKopecks;
  const cacKopecks = input.newCompanies > 0 ? Math.round(acquisitionKopecks / input.newCompanies) : null;
  const ltvKopecks = contributionKopecks > 0 && input.churnBps > 0 ? Math.round(contributionKopecks * 10000 / input.churnBps) : null;
  const ltvCac = ltvKopecks !== null && cacKopecks !== null && cacKopecks > 0 ? ltvKopecks / cacKopecks : null;
  const breakEvenCompanies = contributionKopecks > 0 ? Math.ceil((fixedKopecks + acquisitionKopecks) / contributionKopecks) : null;
  return {
    tariff, customer, feeKopecks, shippingCostsKopecks, packagingCostsKopecks, courierCostsKopecks, slotCostsKopecks,
    benefitCostsKopecks, supportKopecks, extraShipments, extraMarginKopecks, subscriptionGrossKopecks,
    contributionKopecks, mrrKopecks, totalContributionKopecks, fixedKopecks, acquisitionKopecks,
    resultKopecks, cacKopecks, ltvKopecks, ltvCac, breakEvenCompanies,
  };
}
