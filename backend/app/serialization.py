from sqlalchemy import select
from .models import Membership, User, Subscription, Invoice, BenefitLimit, BenefitUsage, Tariff, utcnow
from .services import subscription
from .errors import ApiError

def iso(value):
    return value.isoformat().replace('+00:00', 'Z') if value else None

def member_json(db, member):
    return {'id': member.id, 'companyId': member.company_id, 'name': db.get(User, member.user_id).name,
            'role': member.role, 'status': member.status, 'createdAt': iso(member.created_at)}

def usage_json(usage, company_id):
    return {'id': usage.id, 'requestKey': usage.request_key, 'companyId': company_id,
            'employeeId': usage.membership_id, 'code': usage.benefit_code,
            'originalKopecks': usage.original_price, 'discountKopecks': usage.discount,
            'createdAt': iso(usage.created_at)}

def grant_json(grant):
    return {'employeeId': grant.membership_id, 'code': grant.benefit_code,
            'enabled': grant.enabled, 'limitKopecks': grant.limit_amount}

def snapshot(db, company):
    sub = subscription(db, company.id)
    invoice = db.scalar(select(Invoice).where(Invoice.subscription_id == sub.id))
    if invoice is None:
        raise ApiError('invoice_not_found', 'Создайте тестовый счёт.', 404)
    members = db.scalars(select(Membership).where(Membership.company_id == company.id, Membership.is_owner.is_(False)).order_by(Membership.created_at, Membership.id)).all()
    grants = db.scalars(select(BenefitLimit).where(BenefitLimit.subscription_id == sub.id, BenefitLimit.membership_id.is_not(None))).all()
    usages = db.scalars(select(BenefitUsage).where(BenefitUsage.subscription_id == sub.id).order_by(BenefitUsage.created_at, BenefitUsage.id)).all()
    return {
        'version': 1,
        'company': {'id': company.id, 'name': company.name, 'status': 'active'},
        'employees': [member_json(db, member) for member in members],
        'benefitGrants': [grant_json(grant) for grant in grants],
        'benefitUsages': [usage_json(usage, company.id) for usage in usages],
        'subscription': {'id': sub.id, 'tariffId': sub.tariff_id, 'status': sub.status,
                         'startedAt': iso(sub.started_at), 'expiresAt': iso(sub.expires_at)},
        'invoice': {'id': invoice.id, 'amountKopecks': invoice.amount, 'currency': 'RUB',
                    'status': invoice.status, 'createdAt': iso(invoice.created_at), 'paidAt': iso(invoice.paid_at)},
    }

def dashboard(db, company):
    state = snapshot(db, company)
    tariff = db.get(Tariff, state['subscription']['tariffId'])
    sub = subscription(db, company.id)
    used = sum(usage['discountKopecks'] for usage in state['benefitUsages'])
    fee = state['invoice']['amountKopecks'] if state['invoice']['status'] == 'paid' else 0
    active = sub.status == 'active' and sub.started_at <= utcnow() < sub.expires_at
    return {'tariffId': tariff.id, 'status': 'active' if active else 'expired' if sub.expires_at and sub.expires_at <= utcnow() else sub.status,
            'employees': sum(member['status'] == 'active' for member in state['employees']),
            'usedKopecks': used, 'savingsKopecks': used, 'feeKopecks': fee,
            'availableKopecks': tariff.benefit_cap - used if active else 0, 'netKopecks': used - fee}
