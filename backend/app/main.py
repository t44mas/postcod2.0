from contextlib import asynccontextmanager
from typing import Annotated
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, Depends, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import select, text, delete
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session
from .config import DATABASE_URL, DEMO_AUTH_ENABLED, ALLOWED_ORIGINS
from .db import make_engine, session_factory
from .models import User, Company, Membership, AuthSession, Tariff, Benefit, TariffBenefit, BenefitLimit, BenefitUsage
from .auth import db_session, identity, Identity, issue_token, require_admin, require_company, token_hash
from .errors import ApiError
from .schemas import DemoLogin, CompanyInput, ConnectInput, SubscriptionInput, EmployeeInput, EmployeePatch, LimitInput, UsageInput, ResetInput
from . import services as svc
from .serialization import snapshot, member_json, usage_json, grant_json, dashboard
from .economics import scenarios as economic_scenarios

Db = Annotated[Session, Depends(db_session, scope='function')]
Actor = Annotated[Identity, Depends(identity)]

def create_app(engine=None, demo_auth=DEMO_AUTH_ENABLED):
    @asynccontextmanager
    async def lifespan(app):
        yield
        if engine is None:
            app.state.engine.dispose()

    app = FastAPI(title='Почта Премиум B2B API', version='0.1.0', lifespan=lifespan,
                  description='Локальный прототип. Демо-авторизация и оплата, только синтетические данные.')
    app.state.engine = engine if engine is not None else make_engine(DATABASE_URL)
    app.state.sessions = session_factory(app.state.engine)
    app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=['GET', 'POST', 'PATCH', 'DELETE'], allow_headers=['Authorization', 'Content-Type'])

    @app.exception_handler(ApiError)
    async def domain_error(request, error):
        return JSONResponse(status_code=error.status, content={'code': error.code, 'message': error.message, 'details': error.details})

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        return JSONResponse(status_code=422, content={'code': 'validation_error', 'message': 'Проверьте поля запроса.', 'details': [{'field': '.'.join(map(str, item['loc'])), 'message': item['msg']} for item in error.errors()]})

    @app.exception_handler(IntegrityError)
    async def conflict(request, error):
        return JSONResponse(status_code=409, content={'code': 'conflict', 'message': 'Данные изменились или нарушено ограничение БД. Повторите запрос.', 'details': None})

    @app.exception_handler(OperationalError)
    async def database_error(request, error):
        return JSONResponse(status_code=503, content={'code': 'database_unavailable', 'message': 'База данных временно недоступна.', 'details': None})

    @app.get('/api/v1/health', tags=['Health'])
    def health(db: Db):
        db.execute(text('SELECT 1'))
        return {'status': 'ok', 'database': 'postgresql'}

    @app.post('/api/v1/auth/demo/login', tags=['Demo auth'])
    def login(data: DemoLogin, db: Db):
        if not demo_auth:
            raise ApiError('demo_disabled', 'Демо-вход отключён.', 404)
        user = db.scalar(select(User).where(User.demo_persona == data.persona))
        if user is None:
            raise ApiError('seed_required', 'Выполните подготовку демо-данных.', 503)
        return issue_token(db, user.id)

    @app.get('/api/v1/auth/me', tags=['Demo auth'])
    def me(actor: Actor):
        return {'userId': actor.user.id, 'name': actor.user.name, 'companyId': actor.company.id if actor.company else None,
                'membershipId': actor.membership.id if actor.membership else None,
                'role': actor.role}

    @app.post('/api/v1/auth/demo/employees/{employee_id}', tags=['Demo auth'])
    def employee_session(employee_id: str, db: Db, actor: Actor):
        if not demo_auth:
            raise ApiError('demo_disabled', 'Демо-переключение отключено.', 404)
        svc.lock_company(db, actor, admin=True)
        member = svc.employee(db, actor.company.id, employee_id)
        if member.status != 'active':
            raise ApiError('access_disabled', 'Сотрудник отключён.', 403)
        # Simulated employee view has employee permissions even for a managed
        # administrator: use a session scope instead of trusting a client role.
        token = issue_token(db, member.user_id, employee_scope=True)
        return token

    @app.post('/api/v1/auth/logout', tags=['Demo auth'])
    def logout(request: Request, db: Db, actor: Actor):
        raw = request.headers.get('Authorization', '').split(' ', 1)[-1]
        db.execute(delete(AuthSession).where(AuthSession.token_hash == token_hash(raw)))
        return {'status': 'logged_out'}

    @app.get('/api/v1/tariffs', tags=['Catalog'])
    def tariffs(db: Db, audience: str = 'b2b'):
        if audience != 'b2b': return []
        return [{'id': tariff.id, 'name': tariff.name, 'monthlyPriceKopecks': tariff.price, 'employeeCap': tariff.employee_cap, 'benefitCapKopecks': tariff.benefit_cap, 'version': tariff.version} for tariff in db.scalars(select(Tariff).order_by(Tariff.price))]

    @app.get('/api/v1/benefits', tags=['Catalog'])
    def benefits(db: Db):
        return [{'code': item.code, 'title': item.name} for item in db.scalars(select(Benefit))]

    @app.get('/api/v1/economics/scenarios', tags=['Catalog'])
    def economics(db: Db):
        return economic_scenarios(db)

    @app.post('/api/v1/companies', status_code=201, tags=['Company'])
    def company_create(data: CompanyInput, db: Db, actor: Actor):
        company = svc.create_company(db, actor, data.name)
        return {'id': company.id, 'name': company.name}

    @app.post('/api/v1/business/connect', status_code=201, tags=['Company'])
    def connect(data: ConnectInput, db: Db, actor: Actor):
        company = svc.create_company(db, actor, data.name)
        svc.create_subscription(db, actor, data.tariffId)
        svc.create_invoice(db, actor)
        return snapshot(db, company)

    @app.get('/api/v1/companies/me/state', tags=['Company'])
    def company_state(db: Db, actor: Actor):
        svc.lock_company(db, actor, admin=True)
        return snapshot(db, actor.company)

    @app.post('/api/v1/companies/me/subscriptions', status_code=201, tags=['Subscription'])
    def subscribe(data: SubscriptionInput, db: Db, actor: Actor):
        sub = svc.create_subscription(db, actor, data.tariffId)
        return {'id': sub.id, 'status': sub.status, 'tariffId': sub.tariff_id}

    @app.post('/api/v1/invoices', tags=['Billing'])
    def invoice_create(db: Db, actor: Actor):
        svc.create_invoice(db, actor)
        return snapshot(db, actor.company)['invoice']

    @app.get('/api/v1/companies/me/invoices', tags=['Billing'])
    def invoices(db: Db, actor: Actor):
        svc.lock_company(db, actor, admin=True)
        return [snapshot(db, actor.company)['invoice']]

    @app.post('/api/v1/invoices/{invoice_id}/pay-demo', tags=['Billing'])
    def invoice_pay(invoice_id: str, db: Db, actor: Actor):
        svc.pay_invoice(db, actor, invoice_id)
        return snapshot(db, actor.company)

    @app.get('/api/v1/companies/me/employees', tags=['Employees'])
    def employees(db: Db, actor: Actor):
        svc.lock_company(db, actor, admin=True)
        return snapshot(db, actor.company)['employees']

    @app.post('/api/v1/companies/me/employees', status_code=201, tags=['Employees'])
    def employee_add(data: EmployeeInput, db: Db, actor: Actor):
        return member_json(db, svc.add_employee(db, actor, data))

    @app.patch('/api/v1/companies/me/employees/{employee_id}', tags=['Employees'])
    def employee_update(employee_id: str, data: EmployeePatch, db: Db, actor: Actor):
        return member_json(db, svc.patch_employee(db, actor, employee_id, data))

    @app.get('/api/v1/companies/me/limits', tags=['Benefits'])
    def limits(db: Db, actor: Actor):
        svc.lock_company(db, actor)
        sub = svc.subscription(db, actor.company.id)
        query = select(BenefitLimit).where(BenefitLimit.subscription_id == sub.id, BenefitLimit.membership_id.is_not(None))
        if actor.role != 'company_admin': query = query.where(BenefitLimit.membership_id == actor.membership.id)
        return [grant_json(item) | {'usedKopecks': item.used_amount} for item in db.scalars(query)]

    @app.patch('/api/v1/companies/me/limits', tags=['Benefits'])
    def limit_update(data: LimitInput, db: Db, actor: Actor):
        return grant_json(svc.assign_limit(db, actor, data))

    @app.post('/api/v1/benefit-usages', tags=['Benefits'])
    def benefit_use(data: UsageInput, db: Db, actor: Actor):
        return usage_json(svc.activate(db, actor, data), actor.company.id)

    def filtered_operations(db, actor, employee_id, start, end):
        svc.lock_company(db, actor)
        sub = svc.subscription(db, actor.company.id)
        query = select(BenefitUsage).where(BenefitUsage.subscription_id == sub.id)
        if actor.role != 'company_admin': query = query.where(BenefitUsage.membership_id == actor.membership.id)
        if employee_id: query = query.where(BenefitUsage.membership_id == employee_id)
        bounds = []
        for value in [start, end]:
            if not value: bounds.append(None); continue
            try:
                parsed = datetime.strptime(value, '%Y-%m-%d')
                if parsed.strftime('%Y-%m-%d') != value: raise ValueError()
                bounds.append(parsed.replace(tzinfo=timezone(timedelta(hours=3))))
            except ValueError:
                raise ApiError('invalid_date', 'Укажите корректную дату YYYY-MM-DD.', 422)
        if bounds[0] and bounds[1] and bounds[0] > bounds[1]:
            raise ApiError('invalid_period', 'Дата начала позже даты окончания.', 422)
        if bounds[0]: query = query.where(BenefitUsage.created_at >= bounds[0])
        if bounds[1]: query = query.where(BenefitUsage.created_at < bounds[1] + timedelta(days=1))
        return [usage_json(item, actor.company.id) | {'employeeName': db.get(User, db.get(Membership, item.membership_id).user_id).name} for item in db.scalars(query.order_by(BenefitUsage.created_at.desc(), BenefitUsage.id))]

    @app.get('/api/v1/companies/me/operations', tags=['Reports'])
    def operations(db: Db, actor: Actor, employee_id: str | None = Query(None, alias='employeeId'), start: str | None = Query(None, alias='from'), end: str | None = Query(None, alias='to')):
        return filtered_operations(db, actor, employee_id, start, end)

    @app.get('/api/v1/companies/me/dashboard', tags=['Reports'])
    def company_dashboard(db: Db, actor: Actor):
        svc.lock_company(db, actor, admin=True)
        return dashboard(db, actor.company)

    @app.get('/api/v1/companies/me/reports', tags=['Reports'])
    def reports(db: Db, actor: Actor, employee_id: str | None = Query(None, alias='employeeId'), start: str | None = Query(None, alias='from'), end: str | None = Query(None, alias='to')):
        svc.lock_company(db, actor, admin=True)
        rows = filtered_operations(db, actor, employee_id, start, end)
        by_employee, by_category = {}, {}
        for row in rows:
            item = by_employee.setdefault(row['employeeId'], {'id': row['employeeId'], 'name': row['employeeName'], 'count': 0, 'savingsKopecks': 0})
            item['count'] += 1; item['savingsKopecks'] += row['discountKopecks']
            category = by_category.setdefault(row['code'], {'code': row['code'], 'title': db.get(Benefit, row['code']).name, 'count': 0, 'savingsKopecks': 0})
            category['count'] += 1; category['savingsKopecks'] += row['discountKopecks']
        original = sum(row['originalKopecks'] for row in rows)
        savings = sum(row['discountKopecks'] for row in rows)
        return {'subscription': dashboard(db, actor.company), 'operations': rows,
                'employees': sorted(by_employee.values(), key=lambda item: (-item['savingsKopecks'], item['name'])),
                'categories': sorted(by_category.values(), key=lambda item: (-item['savingsKopecks'], item['title'])),
                'selected': {'count': len(rows), 'originalKopecks': original, 'savingsKopecks': savings, 'finalKopecks': original - savings}}

    @app.post('/api/v1/demo/reset', tags=['Company'])
    def reset(data: ResetInput, db: Db, actor: Actor):
        if not demo_auth: raise ApiError('demo_disabled', 'Сброс демо отключён.', 404)
        svc.lock_company(db, actor, admin=True)
        if not actor.membership.is_owner or data.companyId != actor.company.id:
            raise ApiError('forbidden', 'Сброс доступен владельцу текущей демо-компании.', 403)
        managed_users = list(db.scalars(select(Membership.user_id).where(Membership.company_id == actor.company.id, Membership.is_owner.is_(False))))
        db.delete(actor.company); db.flush()
        if managed_users: db.execute(delete(User).where(User.id.in_(managed_users)))
        return {'status': 'reset'}

    return app

app = create_app()
