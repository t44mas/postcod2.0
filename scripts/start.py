"""One-command local startup; credentials never appear in process arguments."""
from pathlib import Path
import runpy
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
if shutil.which('docker') is None:
    raise SystemExit('Install Docker Desktop, start it and repeat this command.')
check = subprocess.run(['docker', 'info', '--format', '{{.ServerVersion}}'], capture_output=True)
if check.returncode:
    raise SystemExit('Start Docker Desktop and repeat: python scripts/start.py')
runpy.run_path(str(root / 'scripts' / 'setup-env.py'), run_name='__main__')
subprocess.run(['docker', 'compose', 'up', '--build', '--detach', '--wait'], cwd=root, check=True)
print('Website: http://127.0.0.1:8080/business')
print('API docs: http://127.0.0.1:8000/docs')
