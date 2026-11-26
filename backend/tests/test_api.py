from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta, datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy import select, func
from unittest.mock import patch
from app.models import Subscription, BenefitLimit, BenefitUsage, AuthSession, utcnow
from app.auth import token_hash
from conftest import login, connect, add_employee, grant, use

def test_full_workflow_and_report(api):
    client, app = api
    admin = login(client)
    state = connect(client, admin)
    member, employee = add_employee(client, admin)
    grant(client, admin, member, code='shipping')
    grant(client, admin, member, code='packaging')
    for i in range(50):
        assert use(client, employee, f'full-{i}', code='shipping' if i < 40 else 'packaging').status_code == 200
    report = client.get('/api/v1/companies/me/reports', headers=admin)
    assert report.status_code == 200
    assert report.json()['subscription']['netKopecks'] == 71000
    assert report.json()['selected'] == {'count': 50, 'savingsKopecks': 320000, 'originalKopecks': 1750000, 'finalKopecks': 1430000}
    assert len(report.json()['employees']) == 1
    assert sum(row['savingsKopecks'] for row in report.json()['categories']) == 320000
    dashboard = client.get('/api/v1/companies/me/dashboard', headers=admin).json()
    assert dashboard['availableKopecks'] == 80000
    assert dashboard['usedKopecks'] == 320000
    refreshed = client.get('/api/v1/companies/me/state', headers=admin).json()
    assert len(refreshed['benefitUsages']) == 50
    repeated = client.post(f"/api/v1/invoices/{state['invoice']['id']}/pay-demo", headers=admin).json()
    assert repeated['subscription']['expiresAt'] == state['subscription']['expiresAt']
    assert len(repeated['benefitUsages']) == 50

def test_employee_cannot_read_or_mutate_admin_data(api):
    client, _ = api
    admin = login(client); connect(client, admin)
    member, employee = add_employee(client, admin)
    for path in ['state', 'employees', 'reports', 'dashboard', 'invoices']:
        assert client.get('/api/v1/companies/me/' + path, headers=employee).status_code == 403
    assert client.post('/api/v1/companies/me/employees', headers=employee, json={'name': 'Чужое изменение', 'role': 'company_admin'}).status_code == 403
    assert client.patch('/api/v1/companies/me/limits', headers=employee, json={'employeeId': member['id'], 'code': 'shipping', 'limitKopecks': 10000, 'enabled': True}).status_code == 403
    assert client.get('/api/v1/companies/me/dashboard', headers={}).status_code == 401
    assert use(client, employee).status_code == 403

def test_company_isolation_and_ignored_client_company_forbidden(api):
    client, _ = api
    first = login(client); connect(client, first)
    first_member, first_employee = add_employee(client, first)
    grant(client, first, first_member)
    second = login(client, 'demo_other_admin'); second_state = connect(client, second)
    second_member, second_employee = add_employee(client, second, 'Иван Демо')
    grant(client, second, second_member)
    assert use(client, first_employee, 'first-company').status_code == 200
    assert use(client, second_employee, 'second-company').status_code == 200
    assert client.patch(f"/api/v1/companies/me/employees/{first_member['id']}", headers=second, json={'status': 'disabled'}).status_code == 404
    assert client.post(f"/api/v1/invoices/{second_state['invoice']['id']}/pay-demo", headers=first).status_code == 404
    assert client.get('/api/v1/companies/me/operations', headers=first_employee, params={'employeeId': second_member['id']}).json() == []
    spoofed = client.post('/api/v1/benefit-usages', headers=first_employee, json={'code': 'shipping', 'originalKopecks': 35000, 'requestKey': 'spoof', 'companyId': second_state['company']['id']})
    assert spoofed.status_code == 422

def test_concurrent_same_request_only_charges_once(api):
    client, app = api
    admin = login(client); connect(client, admin)
    member, employee = add_employee(client, admin); grant(client, admin, member, 7000)
    def action(_):
        with TestClient(app) as worker:
            response = use(worker, employee, 'same-request')
            assert response.status_code == 200
            return response.json()['id']
    with ThreadPoolExecutor(max_workers=2) as pool:
        ids = list(pool.map(action, range(2)))
    assert ids[0] == ids[1]
    state = client.get('/api/v1/companies/me/dashboard', headers=admin).json()
    assert state['usedKopecks'] == 7000
    assert use(client, employee, 'same-request', price=36000).status_code == 409

def test_concurrent_requests_do_not_exceed_personal_limit(api):
    client, app = api
    admin = login(client); connect(client, admin)
    member, employee = add_employee(client, admin); grant(client, admin, member, 7000)
    def action(i):
        with TestClient(app) as worker:
            return use(worker, employee, f'compete-{i}').status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(action, range(2)))
    assert sorted(statuses) == [200, 409]
    assert client.get('/api/v1/companies/me/dashboard', headers=admin).json()['usedKopecks'] == 7000

def test_shared_limit_between_employees_and_rollback(api):
    client, _ = api
    admin = login(client); connect(client, admin)
    first, first_session = add_employee(client, admin); grant(client, admin, first)
    second, second_session = add_employee(client, admin, 'Иван Демо'); grant(client, admin, second)
    for i in range(57): assert use(client, first_session, f'fill-{i}').status_code == 200
    assert use(client, first_session, 'last', price=1000).status_code == 200
    response = use(client, second_session, 'over-company')
    assert response.status_code == 409
    assert response.json()['code'] == 'company_limit'
    limits = client.get('/api/v1/companies/me/limits', headers=second_session).json()
    assert limits[0]['usedKopecks'] == 0

def test_disabled_expired_and_paused_subscriptions(api):
    client, app = api
    admin = login(client); connect(client, admin)
    member, employee = add_employee(client, admin); grant(client, admin, member)
    assert client.patch(f"/api/v1/companies/me/employees/{member['id']}", headers=admin, json={'status': 'disabled'}).status_code == 200
    assert use(client, employee).status_code == 403
    client.patch(f"/api/v1/companies/me/employees/{member['id']}", headers=admin, json={'status': 'active'})
    with app.state.sessions.begin() as db:
        sub = db.scalar(select(Subscription)); sub.status = 'paused'
    assert use(client, employee, 'paused').status_code == 409
    with app.state.sessions.begin() as db:
        sub = db.scalar(select(Subscription)); sub.status = 'active'; sub.expires_at = utcnow() - timedelta(seconds=1)
    assert use(client, employee, 'expired').status_code == 409
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(BenefitUsage)) == 0

def test_start_tariff_caps_and_validation(api):
    client, _ = api
    admin = login(client); connect(client, admin, 'start')
    member, employee = add_employee(client, admin)
    denied = client.patch('/api/v1/companies/me/limits', headers=admin, json={'employeeId': member['id'], 'code': 'packaging', 'enabled': True, 'limitKopecks': 10000})
    assert denied.status_code == 409
    grant(client, admin, member, 150000)
    assert use(client, employee, price=2500).json()['discountKopecks'] == 2500
    assert use(client, employee, 'bad', price=1.5).status_code == 422
    for i in range(9): add_employee(client, admin, f'Демо {i}')
    extra = client.post('/api/v1/companies/me/employees', headers=admin, json={'name': 'Лишний Демо', 'role': 'company_employee'})
    assert extra.status_code == 409

def test_reset_owner_scope_and_session_revocation(api):
    client, _ = api
    admin = login(client); state = connect(client, admin)
    member, employee = add_employee(client, admin)
    assert client.post('/api/v1/demo/reset', headers=employee, json={'companyId': state['company']['id']}).status_code == 403
    assert client.post('/api/v1/demo/reset', headers=admin, json={'companyId': 'wrong'}).status_code == 403
    assert client.post('/api/v1/demo/reset', headers=admin, json={'companyId': state['company']['id']}).status_code == 200
    assert client.get('/api/v1/companies/me/state', headers=admin).status_code == 404
    assert client.get('/api/v1/auth/me', headers=employee).status_code == 401

def test_api_docs_health_and_incomplete_onboarding(api):
    client, _ = api
    assert client.get('/api/v1/health').json() == {'status': 'ok', 'database': 'postgresql'}
    assert client.get('/openapi.json').status_code == 200
    admin = login(client)
    assert client.post('/api/v1/companies', headers=admin, json={'name': 'Демо отдельно'}).status_code == 201
    assert client.post('/api/v1/companies/me/subscriptions', headers=admin, json={'tariffId': 'plus'}).status_code == 201
    invoice = client.post('/api/v1/invoices', headers=admin).json()
    assert client.post('/api/v1/invoices', headers=admin).json()['id'] == invoice['id']

def test_revoked_grant_lower_limit_and_employee_scope(api):
    client, _ = api
    admin = login(client); connect(client, admin)
    member, employee = add_employee(client, admin, role='company_admin')
    # The explicit "employee demo" session stays restricted even when the
    # managed membership also has an administrative role.
    assert client.get('/api/v1/companies/me/reports', headers=employee).status_code == 403
    grant(client, admin, member, 10000)
    assert use(client, employee).status_code == 200
    assert client.patch('/api/v1/companies/me/limits', headers=admin, json={'employeeId': member['id'], 'code': 'shipping', 'enabled': True, 'limitKopecks': 6000}).status_code == 409
    assert client.patch('/api/v1/companies/me/limits', headers=admin, json={'employeeId': member['id'], 'code': 'shipping', 'enabled': False, 'limitKopecks': 10000}).status_code == 200
    assert use(client, employee, 'revoked').status_code == 403
    assert len(client.get('/api/v1/companies/me/operations', headers=employee).json()) == 1

def test_expired_and_logged_out_sessions(api):
    client, app = api
    admin = login(client)
    digest = token_hash(admin['Authorization'].split(' ', 1)[1])
    with app.state.sessions.begin() as db:
        db.get(AuthSession, digest).expires_at = utcnow() - timedelta(seconds=1)
    assert client.get('/api/v1/auth/me', headers=admin).status_code == 401
    admin = login(client)
    assert client.post('/api/v1/auth/logout', headers=admin).status_code == 200
    assert client.get('/api/v1/auth/me', headers=admin).status_code == 401

def test_server_date_filters_use_moscow_boundaries(api):
    client, app = api
    admin = login(client); connect(client, admin)
    member, employee = add_employee(client, admin); grant(client, admin, member)
    for i in range(3): assert use(client, employee, f'date-{i}').status_code == 200
    with app.state.sessions.begin() as db:
        sub = db.scalar(select(Subscription))
        sub.started_at = datetime(2026, 11, 25, tzinfo=timezone.utc)
        sub.expires_at = datetime(2026, 12, 25, tzinfo=timezone.utc)
        times = ['2026-11-26T20:59:59+00:00', '2026-11-26T21:00:00+00:00', '2026-11-27T21:00:00+00:00']
        rows = list(db.scalars(select(BenefitUsage).order_by(BenefitUsage.request_key)))
        for row, value in zip(rows, times): row.created_at = datetime.fromisoformat(value)
    response = client.get('/api/v1/companies/me/reports', headers=admin, params={'from': '2026-11-27', 'to': '2026-11-27'})
    assert response.status_code == 200
    assert response.json()['selected']['count'] == 1
    assert response.json()['subscription']['usedKopecks'] == 21000
    assert client.get('/api/v1/companies/me/operations', headers=admin, params={'from': '2026-02-30'}).status_code == 422
    assert client.get('/api/v1/companies/me/operations', headers=admin, params={'from': '2026-11-28', 'to': '2026-11-26'}).status_code == 422

def test_economic_scenarios_include_costs_and_losses(api):
    client, _ = api
    data = client.get('/api/v1/economics/scenarios').json()
    assert data['modelAssumptions'] is True
    assert len(data['scenarios']) == 6
    base = next(row for row in data['scenarios'] if row['tariffId'] == 'plus' and row['scenarioId'] == 'base')
    assert base['customerNetKopecks'] == 71000
    assert base['contributionKopecks'] == 71000
    assert base['resultKopecks'] == -3700000
    assert base['breakEvenCompanies'] == 353

def test_usage_timestamp_is_the_same_instant_as_period_validation(api):
    client, app = api
    admin = login(client); state = connect(client, admin)
    member, employee = add_employee(client, admin); grant(client, admin, member)
    decision_time = datetime.fromisoformat(state['subscription']['expiresAt'].replace('Z', '+00:00')) - timedelta(microseconds=1)
    with patch('app.services.utcnow', return_value=decision_time):
        response = use(client, employee, 'period-boundary')
    assert response.status_code == 200
    actual = datetime.fromisoformat(response.json()['createdAt'].replace('Z', '+00:00'))
    assert actual == decision_time
