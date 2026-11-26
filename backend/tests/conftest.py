from pathlib import Path
from uuid import uuid4
import sys
import pytest
from sqlalchemy import create_engine, text
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import DATABASE_URL
from app.db import Base, session_factory
from app.main import create_app
from app.seed import seed

@pytest.fixture
def api():
    # A schema created exclusively for this test; public application data is
    # never truncated. Cleanup is limited to this generated schema.
    schema = 'test_' + uuid4().hex
    root = create_engine(DATABASE_URL)
    with root.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(DATABASE_URL, connect_args={'options': f'-csearch_path={schema}'}, pool_size=10)
    Base.metadata.create_all(engine)
    with session_factory(engine).begin() as db:
        seed(db)
    app = create_app(engine)
    with TestClient(app) as client:
        yield client, app
    engine.dispose()
    assert schema.startswith('test_') and len(schema) == 37
    with root.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    root.dispose()

def login(client, persona='demo_admin'):
    response = client.post('/api/v1/auth/demo/login', json={'persona': persona})
    assert response.status_code == 200
    return {'Authorization': 'Bearer ' + response.json()['accessToken']}

def connect(client, headers, tariff='plus'):
    response = client.post('/api/v1/business/connect', headers=headers, json={'name': 'ООО API Демо', 'tariffId': tariff})
    assert response.status_code == 201
    state = response.json()
    paid = client.post(f"/api/v1/invoices/{state['invoice']['id']}/pay-demo", headers=headers)
    assert paid.status_code == 200
    return paid.json()

def add_employee(client, headers, name='Анна Демо', role='company_employee'):
    response = client.post('/api/v1/companies/me/employees', headers=headers, json={'name': name, 'role': role})
    assert response.status_code == 201
    member = response.json()
    session = client.post(f"/api/v1/auth/demo/employees/{member['id']}", headers=headers)
    assert session.status_code == 200
    return member, {'Authorization': 'Bearer ' + session.json()['accessToken']}

def grant(client, headers, member, amount=400000, code='shipping'):
    response = client.patch('/api/v1/companies/me/limits', headers=headers, json={'employeeId': member['id'], 'code': code, 'enabled': True, 'limitKopecks': amount})
    assert response.status_code == 200

def use(client, headers, key='operation-1', price=35000, code='shipping'):
    return client.post('/api/v1/benefit-usages', headers=headers, json={'code': code, 'originalKopecks': price, 'requestKey': key})
