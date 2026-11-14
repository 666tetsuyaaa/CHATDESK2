#!/usr/bin/env bash
# Deploys the latest code on the EC2 server: pulls the branch, installs
# packages, updates the database tables, collects the admin CSS/JS, and
# restarts the API. Run it on the server after every merge to main:
#   bash /srv/chatdesk/deploy/aws/update.sh
set -euo pipefail

# All of it is read before anything runs: the git pull below can change
# this very file, and bash would otherwise go on reading the new version
# from the middle.
main() {

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

echo "==> Server settings (service, compression, HTTP/2)"
# The service file: 4 threads per worker (see chatdesk.service).
if ! sudo cmp -s "$APP_DIR/deploy/aws/chatdesk.service" /etc/systemd/system/chatdesk.service; then
    sudo cp "$APP_DIR/deploy/aws/chatdesk.service" /etc/systemd/system/chatdesk.service
    sudo systemctl daemon-reload
    echo "    service file updated"
fi
# nginx: compressed JSON answers, and HTTP/2 on the HTTPS part certbot added
# (one connection for all of a page's requests instead of six). If nginx
# doesn't accept a change, the old settings are put back.
SITE=/etc/nginx/sites-available/chatdesk
NGINX_CHANGED=0
if ! sudo cmp -s "$APP_DIR/deploy/aws/nginx-speed.conf" /etc/nginx/conf.d/chatdesk-speed.conf; then
    sudo cp "$APP_DIR/deploy/aws/nginx-speed.conf" /etc/nginx/conf.d/chatdesk-speed.conf
    NGINX_CHANGED=1
fi
if sudo grep -qE 'listen (\[::\]:)?443 ssl' "$SITE" && ! sudo grep -q 'http2' "$SITE"; then
    sudo cp "$SITE" /tmp/chatdesk-site.backup
    sudo sed -i -E 's/listen (\[::\]:)?443 ssl/listen \1443 ssl http2/' "$SITE"
    NGINX_CHANGED=1
fi
if [ "$NGINX_CHANGED" = 1 ]; then
    if sudo nginx -t; then
        sudo systemctl reload nginx
        echo "    nginx settings updated"
    else
        echo "    nginx didn't accept the new settings - putting the old ones back"
        sudo rm -f /etc/nginx/conf.d/chatdesk-speed.conf
        if [ -f /tmp/chatdesk-site.backup ]; then sudo cp /tmp/chatdesk-site.backup "$SITE"; fi
        sudo nginx -t && sudo systemctl reload nginx
    fi
fi

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
}

main "$@"
exit
