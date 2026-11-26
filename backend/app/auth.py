import hashlib
import secrets
from datetime import timedelta
from dataclasses import dataclass
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from .errors import ApiError
from .models import AuthSession, Company, Membership, User, utcnow

bearer = HTTPBearer(auto_error=False)

def db_session(request: Request):
    with request.app.state.sessions() as db:
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise

def token_hash(value: str):
    return hashlib.sha256(value.encode()).hexdigest()

def issue_token(db, user_id, employee_scope=False):
    token = secrets.token_urlsafe(32)
    expiry = utcnow() + timedelta(hours=12)
    db.add(AuthSession(token_hash=token_hash(token), user_id=user_id, expires_at=expiry, scope='employee' if employee_scope else None))
    db.flush()
    return {'accessToken': token, 'tokenType': 'bearer', 'expiresAt': expiry}

@dataclass
class Identity:
    user: User
    company: Company | None
    membership: Membership | None
    role: str

def identity(db=Depends(db_session, scope='function'), credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not credentials:
        raise ApiError('unauthorized', 'Требуется демо-сессия.', 401)
    auth = db.get(AuthSession, token_hash(credentials.credentials))
    if auth is None or auth.expires_at <= utcnow():
        raise ApiError('unauthorized', 'Сессия недействительна или истекла.', 401)
    user = db.get(User, auth.user_id)
    if user is None:
        raise ApiError('unauthorized', 'Сессия отозвана.', 401)
    # Owner identity persists even before onboarding or after a scoped demo reset.
    company = db.scalar(select(Company).where(Company.owner_id == user.id))
    membership = None
    if company:
        membership = db.scalar(select(Membership).where(Membership.company_id == company.id, Membership.user_id == user.id))
    else:
        membership = db.scalar(select(Membership).where(Membership.user_id == user.id))
        if membership:
            company = db.get(Company, membership.company_id)
    if membership and membership.status != 'active':
        raise ApiError('access_disabled', 'Сотрудник отключён.', 403)
    role = 'company_employee' if auth.scope == 'employee' else membership.role if membership else 'company_admin'
    return Identity(user, company, membership, role)

def require_company(actor: Identity):
    if actor.company is None or actor.membership is None:
        raise ApiError('company_not_found', 'Демо-компания ещё не подключена.', 404)
    return actor.company

def require_admin(actor: Identity):
    require_company(actor)
    if actor.role != 'company_admin':
        raise ApiError('forbidden', 'Действие доступно только администратору компании.', 403)
