import calendar
from sqlalchemy import select, func
from .errors import ApiError
from .models import Company, Membership, User, Subscription, Invoice, Tariff, TariffBenefit, BenefitLimit, BenefitUsage, utcnow
from .auth import require_company, require_admin

def lock_company(db, actor, admin=False):
    if admin:
        require_admin(actor)
    company = require_company(actor)
    db.scalar(select(Company).where(Company.id == company.id).with_for_update())
    # Re-read after acquiring the company lock: a different request may disable
    # this membership while the current transaction waits.
    member = db.get(Membership, actor.membership.id, populate_existing=True)
    if not member or member.status != 'active':
        raise ApiError('access_disabled', 'Сотрудник отключён.', 403)
    if admin and member.role != 'company_admin':
        raise ApiError('forbidden', 'Недостаточно прав.', 403)
    return company

def subscription(db, company_id):
    sub = db.scalar(select(Subscription).where(Subscription.company_id == company_id))
    if not sub:
        raise ApiError('subscription_not_found', 'Подписка ещё не создана.', 404)
    return sub

def create_company(db, actor, name):
    # Serialize onboarding for the same owner before company exists.
    db.scalar(select(User).where(User.id == actor.user.id).with_for_update())
    if db.scalar(select(Company).where(Company.owner_id == actor.user.id)) or actor.membership:
        raise ApiError('company_exists', 'Компания уже создана.', 409)
    company = Company(name=name, owner_id=actor.user.id)
    db.add(company); db.flush()
    member = Membership(company_id=company.id, user_id=actor.user.id, role='company_admin', is_owner=True)
    db.add(member); db.flush()
    actor.company, actor.membership = company, member
    return company

def create_subscription(db, actor, tariff_id):
    lock_company(db, actor, admin=True)
    if db.scalar(select(Subscription).where(Subscription.company_id == actor.company.id)):
        raise ApiError('subscription_exists', 'У компании уже есть подписка.', 409)
    tariff = db.get(Tariff, tariff_id)
    if not tariff:
        raise ApiError('tariff_not_found', 'Тариф не найден.', 404)
    sub = Subscription(company_id=actor.company.id, tariff_id=tariff.id, tariff_version=tariff.version)
    db.add(sub); db.flush()
    db.add(BenefitLimit(subscription_id=sub.id, limit_amount=tariff.benefit_cap))
    db.flush()
    return sub

def create_invoice(db, actor):
    lock_company(db, actor, admin=True)
    sub = subscription(db, actor.company.id)
    existing = db.scalar(select(Invoice).where(Invoice.subscription_id == sub.id))
    if existing:
        return existing
    invoice = Invoice(subscription_id=sub.id, amount=db.get(Tariff, sub.tariff_id).price)
    db.add(invoice); db.flush()
    return invoice

def pay_invoice(db, actor, invoice_id):
    lock_company(db, actor, admin=True)
    sub = subscription(db, actor.company.id)
    invoice = db.scalar(select(Invoice).where(Invoice.id == invoice_id, Invoice.subscription_id == sub.id).with_for_update())
    if not invoice:
        raise ApiError('invoice_not_found', 'Счёт не найден.', 404)
    if invoice.status == 'paid':
        return invoice
    now = utcnow()
    year, month = (now.year + 1, 1) if now.month == 12 else (now.year, now.month + 1)
    expiry = now.replace(year=year, month=month, day=min(now.day, calendar.monthrange(year, month)[1]))
    invoice.status, invoice.paid_at = 'paid', now
    sub.status, sub.started_at, sub.expires_at = 'active', now, expiry
    db.flush()
    return invoice

def employee(db, company_id, membership_id):
    member = db.scalar(select(Membership).where(Membership.id == membership_id, Membership.company_id == company_id, Membership.is_owner.is_(False)))
    if not member:
        raise ApiError('employee_not_found', 'Сотрудник не найден в компании.', 404)
    return member

def check_seats(db, company_id):
    sub = subscription(db, company_id)
    count = db.scalar(select(func.count()).select_from(Membership).where(Membership.company_id == company_id, Membership.is_owner.is_(False), Membership.status == 'active'))
    cap = db.get(Tariff, sub.tariff_id).employee_cap
    if count >= cap:
        raise ApiError('employee_cap', f'Достигнут лимит: {cap} активных сотрудников.', 409)

def add_employee(db, actor, data):
    lock_company(db, actor, admin=True); check_seats(db, actor.company.id)
    user = User(name=data.name)
    db.add(user); db.flush()
    member = Membership(company_id=actor.company.id, user_id=user.id, role=data.role)
    db.add(member); db.flush()
    return member

def patch_employee(db, actor, membership_id, data):
    lock_company(db, actor, admin=True)
    member = employee(db, actor.company.id, membership_id)
    if data.status == 'active' and member.status != 'active':
        check_seats(db, actor.company.id)
    if data.role is not None: member.role = data.role
    if data.status is not None: member.status = data.status
    db.flush()
    return member

def assign_limit(db, actor, data):
    lock_company(db, actor, admin=True)
    sub = subscription(db, actor.company.id)
    member = employee(db, actor.company.id, data.employeeId)
    if member.status != 'active':
        raise ApiError('employee_disabled', 'Выберите активного сотрудника.', 409)
    rule = db.get(TariffBenefit, (sub.tariff_id, data.code))
    if not rule:
        raise ApiError('benefit_unavailable', 'Преимущество не входит в тариф.', 409)
    cap = db.get(Tariff, sub.tariff_id).benefit_cap
    if data.limitKopecks > cap:
        raise ApiError('invalid_limit', 'Личный лимит превышает лимит компании.', 422)
    grant = db.scalar(select(BenefitLimit).where(BenefitLimit.subscription_id == sub.id, BenefitLimit.membership_id == member.id, BenefitLimit.benefit_code == data.code).with_for_update())
    if grant is None:
        grant = BenefitLimit(subscription_id=sub.id, membership_id=member.id, benefit_code=data.code, limit_amount=data.limitKopecks, used_amount=0)
        db.add(grant)
    if data.limitKopecks < grant.used_amount:
        raise ApiError('limit_below_used', 'Лимит нельзя уменьшить ниже уже использованной суммы.', 409)
    grant.enabled, grant.limit_amount = data.enabled, data.limitKopecks
    db.flush()
    return grant

def activate(db, actor, data):
    lock_company(db, actor)
    sub = subscription(db, actor.company.id)
    member = actor.membership
    if member.is_owner:
        raise ApiError('employee_required', 'Переключитесь в демо-сессию сотрудника.', 403)
    previous = db.scalar(select(BenefitUsage).where(BenefitUsage.subscription_id == sub.id, BenefitUsage.request_key == data.requestKey))
    if previous:
        if previous.membership_id != member.id or previous.benefit_code != data.code or previous.original_price != data.originalKopecks:
            raise ApiError('idempotency_conflict', 'Идентификатор занят другой операцией.', 409)
        return previous
    now = utcnow()
    if sub.status != 'active' or sub.started_at is None or sub.expires_at is None or not sub.started_at <= now < sub.expires_at:
        raise ApiError('subscription_inactive', 'Подписка не активна или её срок истёк.', 409)
    rule = db.get(TariffBenefit, (sub.tariff_id, data.code))
    if not rule:
        raise ApiError('benefit_unavailable', 'Преимущество не входит в тариф.', 409)
    # Company lock serializes grants, disable/payment/reset and requests across
    # employees. Both counters are additionally locked and changed in this tx.
    shared = db.scalar(select(BenefitLimit).where(BenefitLimit.subscription_id == sub.id, BenefitLimit.membership_id.is_(None)).with_for_update())
    personal = db.scalar(select(BenefitLimit).where(BenefitLimit.subscription_id == sub.id, BenefitLimit.membership_id == member.id, BenefitLimit.benefit_code == data.code).with_for_update())
    if not personal or not personal.enabled:
        raise ApiError('benefit_not_assigned', 'Преимущество не назначено сотруднику.', 403)
    discount = min(rule.discount, data.originalKopecks)
    if personal.used_amount + discount > personal.limit_amount:
        raise ApiError('personal_limit', 'Недостаточно личного лимита.', 409)
    if shared.used_amount + discount > shared.limit_amount:
        raise ApiError('company_limit', 'Недостаточно общего лимита компании.', 409)
    usage = BenefitUsage(subscription_id=sub.id, membership_id=member.id, benefit_code=data.code, original_price=data.originalKopecks, discount=discount, request_key=data.requestKey, tariff_version=sub.tariff_version, created_at=now)
    db.add(usage)
    personal.used_amount += discount
    shared.used_amount += discount
    db.flush()
    return usage
