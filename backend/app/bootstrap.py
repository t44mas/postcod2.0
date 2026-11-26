from .config import DATABASE_URL
from .db import make_engine, session_factory
from .seed import seed

if __name__ == '__main__':
    engine = make_engine(DATABASE_URL)
    with session_factory(engine).begin() as db:
        seed(db)
    engine.dispose()
    print('Demo users and tariff v1 data ready. No sessions or credentials printed.')
