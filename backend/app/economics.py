"""Versioned hypothetical scenarios; never derived from private company data."""
import json
from pathlib import Path
from sqlalchemy import select
from .models import Tariff, TariffBenefit

def scenarios(db):
    assumptions = json.loads((Path(__file__).parent / 'data' / 'economics.json').read_text(encoding='utf-8'))
    rows = []
    for tariff_id, variants in assumptions.items():
        tariff = db.get(Tariff, tariff_id)
        rules = {rule.benefit_code: rule.discount for rule in db.scalars(select(TariffBenefit).where(TariffBenefit.tariff_id == tariff_id))}
        for scenario_id, data in variants.items():
            benefits = (data['shipments'] * data['shippingCost'] + data['packages'] * data['packagingCost'] + data['courierUses'] * data['courierCost'] + data['slotUses'] * data['slotCost']) * 100
            extra = data['shipments'] - data['baselineShipments']
            gross = tariff.price - benefits - data['supportCost'] * 100
            contribution = gross + extra * data['incrementalMargin'] * 100
            round_ratio = lambda numerator, denominator: (2 * numerator + denominator) // (2 * denominator)
            cac = round_ratio(data['acquisitionBudget'] * 100, data['newCompanies']) if data['newCompanies'] else None
            ltv = round_ratio(contribution * 10000, data['churnBps']) if contribution > 0 and data['churnBps'] > 0 else None
            client = min(data['shipments'] * rules.get('shipping', 0) + data['packages'] * rules.get('packaging', 0), tariff.benefit_cap)
            rows.append({'tariffId': tariff_id, 'scenarioId': scenario_id, 'assumptions': data,
                         'customerNetKopecks': client - tariff.price, 'benefitCostsKopecks': benefits,
                         'contributionKopecks': contribution, 'mrrKopecks': tariff.price * data['activeCompanies'],
                         'resultKopecks': contribution * data['activeCompanies'] - (data['fixedCosts'] + data['acquisitionBudget']) * 100,
                         'cacKopecks': cac, 'ltvKopecks': ltv,
                         'ltvCac': ltv / cac if ltv is not None and cac is not None and cac > 0 else None,
                         'breakEvenCompanies': ((data['fixedCosts'] + data['acquisitionBudget']) * 100 + contribution - 1) // contribution if contribution > 0 else None})
    return {'modelAssumptions': True, 'tariffVersion': 1, 'assumptionMoneyUnit': 'RUB', 'resultMoneyUnit': 'kopecks', 'churnUnit': 'basis_points', 'scenarios': rows}
