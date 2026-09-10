#!/usr/bin/env bash
# Запускать ПОСЛЕ setup.sh и после того, как A-запись домена уже указывает
# на этот сервер (проверить: dig +short <домен> должен вернуть 178.217.98.225).
#
# Использование:
#   DOMAIN="jobs.example.com" CERTBOT_EMAIL="you@example.com" bash setup-nginx-tls.sh
set -euo pipefail

DOMAIN="${DOMAIN:?Set DOMAIN to your hostname, e.g. jobs.example.com}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
APP_DIR="/opt/jobmonitor"

echo "== Firewall: открываем 80/443 (нужно ДО certbot — иначе Let's Encrypt не сможет пройти HTTP-challenge) =="
ufw allow 80/tcp
ufw allow 443/tcp

echo "== nginx reverse proxy для ${DOMAIN} =="
sed "s/__DOMAIN__/${DOMAIN}/g" "$APP_DIR/backend/deploy/nginx-jobmonitor.conf.template" \
  > /etc/nginx/sites-available/jobmonitor
ln -sf /etc/nginx/sites-available/jobmonitor /etc/nginx/sites-enabled/jobmonitor
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "== certbot (Let's Encrypt) =="
apt-get install -y certbot python3-certbot-nginx
if [[ -n "$CERTBOT_EMAIL" ]]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect
else
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect
fi

echo "== Firewall: закрываем прямой доступ к 4000 (снаружи остаются только 80/443) =="
ufw delete allow 4000/tcp || true

echo
echo "Готово: https://${DOMAIN} должен проксировать на backend с автопродлеваемым TLS."
echo "В приложении смените адрес backend'а в Настройках на https://${DOMAIN}."
