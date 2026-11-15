#!/usr/bin/env bash
# Keeps the Neon database from pausing, for testing and defense days.
#
# Neon's free plan pauses the database after 5 minutes without activity;
# the next request then waits for it to wake up (about 0.5-2 s). While this
# is on, the server pings it every 4 minutes. It uses more of Neon's free
# monthly compute hours, so turn it off again afterwards.
#
#   bash /srv/chatdesk/deploy/aws/keep_db_awake.sh on       # start
#   bash /srv/chatdesk/deploy/aws/keep_db_awake.sh off      # stop
#   bash /srv/chatdesk/deploy/aws/keep_db_awake.sh status   # is it on?
set -euo pipefail

MARK="chatdesk-keep-db-awake"
JOB="*/4 * * * * curl -fsS -o /dev/null -H 'Host: localhost' http://127.0.0.1:8000/api/v1/health/ # $MARK"

others() {
    crontab -l 2>/dev/null | grep -v "$MARK" || true
}

case "${1:-status}" in
    on)
        { others; echo "$JOB"; } | crontab -
        code="$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: localhost' http://127.0.0.1:8000/api/v1/health/)"
        echo "Keeping the database awake (pinged every 4 minutes). Health check now: HTTP $code"
        ;;
    off)
        others | crontab -
        echo "Stopped - the database may pause again after 5 idle minutes."
        ;;
    status)
        if crontab -l 2>/dev/null | grep -q "$MARK"; then echo "ON - the database is kept awake."; else echo "OFF"; fi
        ;;
    *)
        echo "Usage: bash $0 on|off|status"
        exit 1
        ;;
esac
