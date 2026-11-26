import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / '.env')
DATABASE_URL = os.environ.get('DATABASE_URL', '')
DEMO_AUTH_ENABLED = os.environ.get('DEMO_AUTH_ENABLED', 'true').lower() == 'true'
ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', 'http://127.0.0.1:5173,http://localhost:5173').split(',')
