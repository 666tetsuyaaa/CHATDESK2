#!/usr/bin/env bash
# Turns on HTTPS for the API with a free Let's Encrypt certificate for your
# DuckDNS name. Run it on the server once the DuckDNS name points at the
# server's Elastic IP (see docs/DEPLOYMENT.md):
#   bash /srv/chatdesk/deploy/aws/enable_https.sh chatdesk-yourname.duckdns.org you@example.com
# The email only receives Let's Encrypt expiry warnings. Certificates renew
# automatically (certbot's systemd timer). Safe to run again.
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "Usage: bash enable_https.sh <name>.duckdns.org <your email>"
    exit 1
fi

SITE=/etc/nginx/sites-available/chatdesk

echo "==> Checking that $DOMAIN points at this server"
SERVER_IP="$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')"
DNS_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}')"
echo "    this server: $SERVER_IP | $DOMAIN: ${DNS_IP:-(not found)}"
if [ "$SERVER_IP" != "$DNS_IP" ]; then
    echo "The DuckDNS name doesn't point at this server yet. Set its IP to $SERVER_IP on duckdns.org, wait a minute, and run this again."
    exit 1
fi

echo "==> Setting server_name to $DOMAIN"
sudo sed -i "s/server_name [^;]*;/server_name $DOMAIN;/" "$SITE"
sudo nginx -t
sudo systemctl reload nginx

echo "==> Getting the certificate and turning on HTTPS"
sudo certbot --nginx -d "$DOMAIN" --redirect --agree-tos -m "$EMAIL" --non-interactive

echo "==> Checking automatic renewal"
sudo certbot renew --dry-run

echo
echo "HTTPS is on: https://$DOMAIN"
echo "Make sure /srv/chatdesk/backend/.env has:"
echo "  ALLOWED_HOSTS=$DOMAIN,localhost,127.0.0.1"
echo "  CSRF_TRUSTED_ORIGINS=https://$DOMAIN"
echo "  PUBLIC_BASE_URL=https://$DOMAIN"
echo "then run: sudo systemctl restart chatdesk"
