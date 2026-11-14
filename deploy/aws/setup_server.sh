#!/usr/bin/env bash
# First-time setup of the ChatDesk API on a fresh Ubuntu 24.04 EC2 server.
# Run it once on the server (EC2 Instance Connect terminal):
#   curl -fsSL https://raw.githubusercontent.com/666tetsuyaaa/CHATDESK2/main/deploy/aws/setup_server.sh | bash
# Then fill in /srv/chatdesk/backend/.env and run deploy/aws/update.sh.
# Safe to run again; it skips what's already done. See docs/DEPLOYMENT.md.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/666tetsuyaaa/CHATDESK2.git}"
BRANCH="${BRANCH:-main}"
APP_DIR=/srv/chatdesk

echo "==> Installing system packages"
sudo apt-get update -y
sudo apt-get install -y python3-venv python3-dev nginx git certbot python3-certbot-nginx

# A t3.micro has 1 GB of memory; swap keeps pip installs from running out.
if ! swapon --show | grep -q /swapfile; then
    echo "==> Adding 1 GB swap"
    sudo fallocate -l 1G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo "==> Getting the code ($BRANCH)"
sudo mkdir -p "$APP_DIR"
sudo chown ubuntu:www-data "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

echo "==> Python environment"
cd "$APP_DIR/backend"
python3 -m venv venv
venv/bin/pip install --upgrade pip
venv/bin/pip install -r requirements.txt
mkdir -p media staticfiles "$APP_DIR/logs"

if [ ! -f .env ]; then
    cp "$APP_DIR/deploy/aws/env.production.example" .env
    chmod 600 .env
    CREATED_ENV=1
fi

echo "==> Web server and service"
sudo cp "$APP_DIR/deploy/aws/chatdesk.service" /etc/systemd/system/chatdesk.service
# Keep the installed copy once HTTPS is on - certbot added its lines to it.
if ! sudo grep -q "managed by Certbot" /etc/nginx/sites-available/chatdesk 2>/dev/null; then
    sudo cp "$APP_DIR/deploy/aws/nginx-chatdesk.conf" /etc/nginx/sites-available/chatdesk
fi
sudo cp "$APP_DIR/deploy/aws/nginx-speed.conf" /etc/nginx/conf.d/chatdesk-speed.conf
sudo ln -sf /etc/nginx/sites-available/chatdesk /etc/nginx/sites-enabled/chatdesk
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl daemon-reload
sudo systemctl enable chatdesk

echo "==> Daily overdue-ticket reminder (00:00 UTC = 8:00 AM Manila)"
{
    crontab -l 2>/dev/null | grep -v send_overdue_reminders || true
    echo "0 0 * * * cd $APP_DIR/backend && venv/bin/python manage.py send_overdue_reminders >> $APP_DIR/logs/reminders.log 2>&1"
} | crontab -

echo
echo "Setup done."
if [ "${CREATED_ENV:-0}" = 1 ]; then
    echo "Next: fill in the settings, then start the API:"
    echo "  nano $APP_DIR/backend/.env"
    echo "  bash $APP_DIR/deploy/aws/update.sh"
fi
echo "HTTPS (after your DuckDNS name points here):"
echo "  bash $APP_DIR/deploy/aws/enable_https.sh <name>.duckdns.org <your email>"
