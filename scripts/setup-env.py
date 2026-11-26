"""Create ignored local credentials without logging secrets or overwriting .env."""
from pathlib import Path
import secrets

target = Path(__file__).resolve().parents[1] / '.env'
if target.exists():
    print('Existing .env preserved.')
else:
    password = secrets.token_urlsafe(32)
    content = (
        f'POSTGRES_PASSWORD={password}\n'
        f'DATABASE_URL=postgresql+psycopg://pochta:{password}@127.0.0.1:54329/pochta_premium\n'
        'DEMO_AUTH_ENABLED=true\n'
        'ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8080,http://localhost:8080\n'
    )
    with target.open('x', encoding='utf-8') as file:
        file.write(content)
    print('Local .env created. Credentials are not printed.')
