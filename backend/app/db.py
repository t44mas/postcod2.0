from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import DATABASE_URL

class Base(DeclarativeBase):
    pass

def make_engine(url: str):
    if not url.startswith('postgresql+psycopg://'):
        raise RuntimeError('Задайте DATABASE_URL для PostgreSQL в .env. Выполните scripts/setup-env.py.')
    return create_engine(url, pool_pre_ping=True, pool_size=10, max_overflow=20)

def session_factory(engine):
    return sessionmaker(engine, expire_on_commit=False)
