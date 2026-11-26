from logging.config import fileConfig
from alembic import context
from app.config import DATABASE_URL
from app.db import Base, make_engine
from app import models  # noqa: F401

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

if context.is_offline_mode():
    context.configure(url=DATABASE_URL, target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = make_engine(DATABASE_URL)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()
