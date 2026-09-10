#!/usr/bin/env bash
# Первичная настройка backend'а на чистом Debian 13 VPS (1 CPU / 1 GB RAM).
# Запускать от root на самом сервере (см. ../deploy/DEPLOY.md для контекста —
# это НЕ выполняется автоматически из облачной сессии Claude, у неё нет
# исходящего SSH).
#
# Использование:
#   GIT_URL="https://<TOKEN>@github.com/vladislavu74-glitch/Test1.git" \
#   GIT_BRANCH="claude/ios-job-monitoring-app-3j1ae5" \
#   API_AUTH_TOKEN="..." \
#   bash setup.sh
set -euo pipefail

APP_DIR="/opt/jobmonitor"
GIT_URL="${GIT_URL:?Set GIT_URL to the repo clone URL (with a token if private)}"
GIT_BRANCH="${GIT_BRANCH:-claude/ios-job-monitoring-app-3j1ae5}"
API_AUTH_TOKEN="${API_AUTH_TOKEN:?Set API_AUTH_TOKEN to a long random string}"
CRON_TZ="${CRON_TZ:-Europe/Moscow}"
MAIL_TO="${MAIL_TO:-V_utkin@castleduck.com}"

echo "== Обновление системы и установка базовых пакетов =="
apt-get update
apt-get upgrade -y
apt-get install -y curl git ufw nginx

echo "== Установка Node.js 22 (NodeSource) =="
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "== Пользователь для запуска приложения =="
id -u jobmonitor &>/dev/null || useradd --system --create-home --shell /usr/sbin/nologin jobmonitor

echo "== Клонирование/обновление кода =="
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch origin "$GIT_BRANCH"
  git -C "$APP_DIR" checkout "$GIT_BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$GIT_BRANCH"
else
  git clone --branch "$GIT_BRANCH" "$GIT_URL" "$APP_DIR"
fi
chown -R jobmonitor:jobmonitor "$APP_DIR"

BACKEND_DIR="$APP_DIR/backend"
cd "$BACKEND_DIR"

echo "== .env =="
if [[ ! -f .env ]]; then
  cp .env.example .env
  sed -i \
    -e "s#^API_AUTH_TOKEN=.*#API_AUTH_TOKEN=\"${API_AUTH_TOKEN}\"#" \
    -e "s#^CRON_TZ=.*#CRON_TZ=\"${CRON_TZ}\"#" \
    -e "s#^MAIL_TO=.*#MAIL_TO=\"${MAIL_TO}\"#" \
    .env
  echo "Создан backend/.env — ЗАПОЛНИТЕ SMTP_USER/SMTP_PASS/MAIL_FROM и, если нужно, SUPERJOB_API_KEY:"
  echo "  nano $BACKEND_DIR/.env"
else
  echo ".env уже существует — не трогаю (проверьте вручную, что значения актуальны)."
fi
chown jobmonitor:jobmonitor .env
chmod 600 .env

echo "== Установка зависимостей и сборка =="
sudo -u jobmonitor npm ci
sudo -u jobmonitor npx prisma migrate deploy
sudo -u jobmonitor npm run build

echo "== Первичный seed источников (не перезаписывает существующие) =="
sudo -u jobmonitor npm run seed

echo "== systemd-сервис =="
cp deploy/jobmonitor.service /etc/systemd/system/jobmonitor.service
systemctl daemon-reload
systemctl enable --now jobmonitor
sleep 2
systemctl --no-pager status jobmonitor || true

echo "== Firewall =="
ufw allow OpenSSH
ufw allow 4000/tcp   # временно, для проверки по IP до настройки nginx+HTTPS
ufw --force enable

echo
echo "Готово. Проверка:"
echo "  curl http://178.217.98.225:4000/api/health"
echo
echo "ВАЖНО: сейчас API_AUTH_TOKEN = ${API_AUTH_TOKEN}"
echo "Впишите тот же токен в приложении (вкладка Настройки)."
echo
echo "Дальше: заполните SMTP в backend/.env и перезапустите (systemctl restart jobmonitor)."
echo "Когда домен будет указывать на этот сервер — запустите deploy/setup-nginx-tls.sh."
