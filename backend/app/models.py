from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import String, Integer, BigInteger, Boolean, DateTime, ForeignKey, UniqueConstraint, CheckConstraint, Index, text
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

def uuid() -> str:
    return str(uuid4())

def utcnow():
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = 'users'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid)
    name: Mapped[str] = mapped_column(String(100))
    demo_persona: Mapped[str | None] = mapped_column(String(40), unique=True)

class Company(Base):
    __tablename__ = 'companies'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid)
    owner_id: Mapped[str] = mapped_column(ForeignKey('users.id'), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class Membership(Base):
    __tablename__ = 'company_memberships'
    __table_args__ = (UniqueConstraint('company_id', 'user_id'), CheckConstraint("role IN ('company_admin','company_employee')"), CheckConstraint("status IN ('active','disabled')"))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid)
    company_id: Mapped[str] = mapped_column(ForeignKey('companies.id', ondelete='CASCADE'), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    role: Mapped[str] = mapped_column(String(30), default='company_employee')
    status: Mapped[str] = mapped_column(String(12), default='active')
    is_owner: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class AuthSession(Base):
    __tablename__ = 'auth_sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    scope: Mapped[str | None] = mapped_column(String(20))

class Tariff(Base):
    __tablename__ = 'tariffs'
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    price: Mapped[int] = mapped_column(BigInteger)
    employee_cap: Mapped[int] = mapped_column(Integer)
    benefit_cap: Mapped[int] = mapped_column(BigInteger)
    version: Mapped[int] = mapped_column(Integer, default=1)

class Benefit(Base):
    __tablename__ = 'benefits'
    code: Mapped[str] = mapped_column(String(30), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))

class TariffBenefit(Base):
    __tablename__ = 'tariff_benefits'
    tariff_id: Mapped[str] = mapped_column(ForeignKey('tariffs.id'), primary_key=True)
    benefit_code: Mapped[str] = mapped_column(ForeignKey('benefits.code'), primary_key=True)
    discount: Mapped[int] = mapped_column(BigInteger)

class Subscription(Base):
    __tablename__ = 'subscriptions'
    __table_args__ = (CheckConstraint("status IN ('pending_payment','active','paused','cancelled','expired')"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid)
    company_id: Mapped[str] = mapped_column(ForeignKey('companies.id', ondelete='CASCADE'), unique=True)
    tariff_id: Mapped[str] = mapped_column(ForeignKey('tariffs.id'))
    tariff_version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default='pending_payment')
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

class Invoice(Base):
    __tablename__ = 'invoices'
    __table_args__ = (CheckConstraint('amount > 0'), CheckConstraint("status IN ('pending','paid')"))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid)
    subscription_id: Mapped[str] = mapped_column(ForeignKey('subscriptions.id', ondelete='CASCADE'), unique=True)
    amount: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(12), default='pending')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

class BenefitLimit(Base):
    __tablename__ = 'benefit_limits'
    __table_args__ = (
        UniqueConstraint('subscription_id', 'membership_id', 'benefit_code'),
        CheckConstraint('limit_amount >= 0 AND used_amount >= 0 AND used_amount <= limit_amount'),
        CheckConstraint('(membership_id IS NULL) = (benefit_code IS NULL)'),
        Index('uq_company_shared_limit', 'subscription_id', unique=True, postgresql_where=text('membership_id IS NULL')),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid)
    subscription_id: Mapped[str] = mapped_column(ForeignKey('subscriptions.id', ondelete='CASCADE'), index=True)
    # NULL membership and NULL benefit describe the shared company cap.
    membership_id: Mapped[str | None] = mapped_column(ForeignKey('company_memberships.id', ondelete='CASCADE'), index=True)
    benefit_code: Mapped[str | None] = mapped_column(ForeignKey('benefits.code'))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    limit_amount: Mapped[int] = mapped_column(BigInteger)
    used_amount: Mapped[int] = mapped_column(BigInteger, default=0)

class BenefitUsage(Base):
    __tablename__ = 'benefit_usages'
    __table_args__ = (UniqueConstraint('subscription_id', 'request_key'), CheckConstraint('original_price > 0 AND discount > 0 AND discount <= original_price'))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid)
    request_key: Mapped[str] = mapped_column(String(100))
    subscription_id: Mapped[str] = mapped_column(ForeignKey('subscriptions.id', ondelete='CASCADE'), index=True)
    membership_id: Mapped[str] = mapped_column(ForeignKey('company_memberships.id', ondelete='CASCADE'), index=True)
    benefit_code: Mapped[str] = mapped_column(ForeignKey('benefits.code'))
    original_price: Mapped[int] = mapped_column(BigInteger)
    discount: Mapped[int] = mapped_column(BigInteger)
    tariff_version: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
