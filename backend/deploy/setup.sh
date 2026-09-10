#!/usr/bin/env bash
# Первичная настройка backend'а на чистом Debian 13 VPS (1 CPU / 1 GB RAM).
# Запускать от root на самом сервере (см. ../deploy/DEPLOY.md для контекста —
# это НЕ выполняется автоматически из облачной сессии Claude, у неё нет
# исходящего SSH).
#
# Использование (репозиторий публичный — токен для клонирования не нужен):
#   GIT_URL="https://github.com/vladislavu74-glitch/Test1.git" \
#   GIT_BRANCH="claude/ios-job-monitoring-app-3j1ae5" \
#   API_AUTH_TOKEN="..." \
#   SMTP_HOST="..." SMTP_PORT="..." SMTP_SECURE="true|false" \
#   SMTP_USER="..." SMTP_PASS="..." MAIL_FROM="..." \
#   bash setup.sh
#
# Все SMTP_*/MAIL_FROM переменные необязательны — если не заданы, .env
# создаётся с пустыми значениями и их нужно будет дозаполнить вручную.
set -euo pipefail

APP_DIR="/opt/jobmonitor"
GIT_URL="${GIT_URL:?Set GIT_URL to the repo clone URL}"
GIT_BRANCH="${GIT_BRANCH:-claude/ios-job-monitoring-app-3j1ae5}"
API_AUTH_TOKEN="${API_AUTH_TOKEN:?Set API_AUTH_TOKEN to a long random string}"
CRON_TZ="${CRON_TZ:-Europe/Moscow}"
MAIL_TO="${MAIL_TO:-V_utkin@castleduck.com}"
SMTP_HOST="${SMTP_HOST:-}"
SMTP_PORT="${SMTP_PORT:-465}"
SMTP_SECURE="${SMTP_SECURE:-true}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASS="${SMTP_PASS:-}"
MAIL_FROM="${MAIL_FROM:-}"

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

# Минимальные образы Debian часто не имеют sudo — используем su, которое
# гарантированно есть всегда, вместо sudo -u.
run_as_app() {
  su -s /bin/bash jobmonitor -c "cd '$BACKEND_DIR' && $*"
}

echo "== .env =="
if [[ ! -f .env ]]; then
  cp .env.example .env
fi
sed -i \
  -e "s#^API_AUTH_TOKEN=.*#API_AUTH_TOKEN=\"${API_AUTH_TOKEN}\"#" \
  -e "s#^CRON_TZ=.*#CRON_TZ=\"${CRON_TZ}\"#" \
  -e "s#^MAIL_TO=.*#MAIL_TO=\"${MAIL_TO}\"#" \
  .env
if [[ -n "$SMTP_HOST" ]]; then
  sed -i \
    -e "s#^SMTP_HOST=.*#SMTP_HOST=\"${SMTP_HOST}\"#" \
    -e "s#^SMTP_PORT=.*#SMTP_PORT=\"${SMTP_PORT}\"#" \
    -e "s#^SMTP_SECURE=.*#SMTP_SECURE=\"${SMTP_SECURE}\"#" \
    -e "s#^SMTP_USER=.*#SMTP_USER=\"${SMTP_USER}\"#" \
    -e "s#^SMTP_PASS=.*#SMTP_PASS=\"${SMTP_PASS}\"#" \
    -e "s#^MAIL_FROM=.*#MAIL_FROM=\"${MAIL_FROM}\"#" \
    .env
  echo "SMTP настроен из переданных переменных."
else
  echo "SMTP_* не переданы — заполните backend/.env вручную (nano $BACKEND_DIR/.env) перед тем, как ждать писем."
fi
chown jobmonitor:jobmonitor .env
chmod 600 .env

echo "== Установка зависимостей и сборка =="
run_as_app "npm ci"
run_as_app "npx prisma migrate deploy"
run_as_app "npm run build"

echo "== Первичный seed источников (не перезаписывает существующие) =="
run_as_app "npm run seed"

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
echo "== Проверка health-эндпоинта =="
sleep 1
curl -sf http://localhost:4000/api/health && echo || echo "(не ответил — смотри journalctl -u jobmonitor -n 50)"

if [[ -n "$SMTP_HOST" ]]; then
  echo
  echo "== Тестовое письмо через настроенный SMTP =="
  cat > "$BACKEND_DIR/.deploy-smtp-test.js" <<'JSEOF'
require('dotenv').config();
const nodemailer = require('nodemailer');
const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: +process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});
t.sendMail({
  from: process.env.MAIL_FROM,
  to: process.env.MAIL_TO,
  subject: 'Job Monitor: сервер запущен',
  text: 'Backend развёрнут и SMTP настроен.',
})
  .then(() => console.log('SMTP OK — письмо отправлено на', process.env.MAIL_TO))
  .catch((e) => { console.error('SMTP FAIL:', e.message); process.exitCode = 1; });
JSEOF
  chmod 644 "$BACKEND_DIR/.deploy-smtp-test.js"
  run_as_app "node .deploy-smtp-test.js" || echo "Если тут ошибка — пришлите её текст, поправим порт/шифрование."
  rm -f "$BACKEND_DIR/.deploy-smtp-test.js"
fi

echo
echo "Готово. Проверка снаружи: curl http://178.217.98.225:4000/api/health"
echo "API_AUTH_TOKEN = ${API_AUTH_TOKEN}"
echo "Впишите этот адрес (http://178.217.98.225:4000) и токен в приложении (вкладка Настройки)."
echo
echo "Когда домен будет указывать на этот сервер — запустите deploy/setup-nginx-tls.sh."
