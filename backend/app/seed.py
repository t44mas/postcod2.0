from sqlalchemy import select
from .models import User, Tariff, Benefit, TariffBenefit

TARIFFS = [
    dict(id='start', name='Business Start', price=99000, employee_cap=10, benefit_cap=150000, version=1),
    dict(id='plus', name='Business Plus', price=249000, employee_cap=30, benefit_cap=400000, version=1),
]

def seed(db):
    for values in TARIFFS:
        if db.get(Tariff, values['id']) is None:
            db.add(Tariff(**values))
    for code, name in [('shipping', 'Скидка на отправление'), ('packaging', 'Скидка на упаковку')]:
        if db.get(Benefit, code) is None:
            db.add(Benefit(code=code, name=name))
    db.flush()
    for tariff, code, discount in [('start', 'shipping', 4000), ('plus', 'shipping', 7000), ('plus', 'packaging', 4000)]:
        if db.get(TariffBenefit, (tariff, code)) is None:
            db.add(TariffBenefit(tariff_id=tariff, benefit_code=code, discount=discount))
    for persona in ['demo_admin', 'demo_other_admin']:
        if db.scalar(select(User).where(User.demo_persona == persona)) is None:
            db.add(User(name='Демо-администратор' if persona == 'demo_admin' else 'Другой демо-администратор', demo_persona=persona))
    db.flush()
