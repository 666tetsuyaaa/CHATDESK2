#!/usr/bin/env bash
# Deploys the latest code on the EC2 server: pulls the branch, installs
# packages, updates the database tables, collects the admin CSS/JS, and
# restarts the API. Run it on the server after every merge to main:
#   bash /srv/chatdesk/deploy/aws/update.sh
set -euo pipefail

APP_DIR=/srv/chatdesk
cd "$APP_DIR"

echo "==> Pulling the latest code"
git pull --ff-only

cd backend
echo "==> Installing packages"
venv/bin/pip install -r requirements.txt

echo "==> Updating database tables"
# Neon recommends its direct (unpooled) address for schema changes.
UNPOOLED="$(grep -E '^DATABASE_URL_UNPOOLED=' .env | cut -d= -f2- || true)"
if [ -n "$UNPOOLED" ]; then
    DATABASE_URL="$UNPOOLED" venv/bin/python manage.py migrate --noinput
else
    venv/bin/python manage.py migrate --noinput
fi

echo "==> Collecting static files"
venv/bin/python manage.py collectstatic --noinput

echo "==> Checking settings"
venv/bin/python manage.py check --deploy --fail-level ERROR

echo "==> Restarting the API"
sudo systemctl restart chatdesk
sleep 3
# 401 = running and asking for a login, which is what this endpoint does.
code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/api/v1/phases/current/ -H 'Host: localhost')"
if [ "$code" = 401 ] || [ "$code" = 200 ]; then
    echo "API is up."
else
    echo "API did not answer as expected (HTTP $code). Logs: sudo journalctl -u chatdesk -n 50"
    exit 1
fi
