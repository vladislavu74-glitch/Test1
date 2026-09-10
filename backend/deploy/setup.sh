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
#   RESEND_API_KEY="..." MAIL_FROM="..." \
#   bash setup.sh
#
# RESEND_API_KEY/MAIL_FROM необязательны — если не заданы, .env создаётся
# с пустыми значениями и их нужно будет дозаполнить вручную. Письма шлются
# через Resend (HTTPS-API, https://resend.com/api-keys), а не через прямой
# SMTP — многие VPS блокируют исходящие SMTP-порты (25/465/587) по
# умолчанию как антиспам-меру, порт 443 почти никогда не блокируется.
set -euo pipefail

APP_DIR="/opt/jobmonitor"
GIT_URL="${GIT_URL:?Set GIT_URL to the repo clone URL}"
GIT_BRANCH="${GIT_BRANCH:-claude/ios-job-monitoring-app-3j1ae5}"
API_AUTH_TOKEN="${API_AUTH_TOKEN:?Set API_AUTH_TOKEN to a long random string}"
CRON_TZ="${CRON_TZ:-Europe/Moscow}"
MAIL_TO="${MAIL_TO:-V_utkin@castleduck.com}"
RESEND_API_KEY="${RESEND_API_KEY:-}"
MAIL_FROM="${MAIL_FROM:-Job Monitor <onboarding@resend.dev>}"

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
# Если каталог уже принадлежит jobmonitor (с прошлого прогона), а git
# командой ниже выполняется от root — новые версии git откажутся работать
# ("dubious ownership") без явного разрешения на этот путь.
git config --global --add safe.directory "$APP_DIR"
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
sed -i -e "s#^MAIL_FROM=.*#MAIL_FROM=\"${MAIL_FROM}\"#" .env
if [[ -n "$RESEND_API_KEY" ]]; then
  sed -i -e "s#^RESEND_API_KEY=.*#RESEND_API_KEY=\"${RESEND_API_KEY}\"#" .env
  echo "RESEND_API_KEY настроен из переданной переменной."
else
  echo "RESEND_API_KEY не передан — заполните backend/.env вручную (nano $BACKEND_DIR/.env) перед тем, как ждать писем."
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

if [[ -n "$RESEND_API_KEY" ]]; then
  echo
  echo "== Тестовое письмо через Resend =="
  # --max-time ограничивает зависание, если исходящий 443 вдруг тоже
  # заблокирован — тогда curl сам оборвётся через 15 секунд с ошибкой,
  # а не будет висеть бесконечно.
  resend_response=$(curl -sS --max-time 15 -w '\n%{http_code}' -X POST 'https://api.resend.com/emails' \
    -H "Authorization: Bearer ${RESEND_API_KEY}" \
    -H 'Content-Type: application/json' \
    -d "$(cat <<JSON
{"from":"${MAIL_FROM}","to":["${MAIL_TO}"],"subject":"Job Monitor: сервер запущен","text":"Backend развёрнут, отправка через Resend работает."}
JSON
)") || echo "curl не смог достучаться до api.resend.com — проверьте исходящий 443 и повторите вручную."
  resend_status="${resend_response##*$'\n'}"
  resend_body="${resend_response%$'\n'*}"
  if [[ "$resend_status" == "200" ]]; then
    echo "Resend OK — письмо отправлено на ${MAIL_TO}"
  else
    echo "Resend FAIL (HTTP ${resend_status}): ${resend_body}"
  fi
fi

echo
echo "Готово. Проверка снаружи: curl http://178.217.98.225:4000/api/health"
echo "API_AUTH_TOKEN = ${API_AUTH_TOKEN}"
echo "Впишите этот адрес (http://178.217.98.225:4000) и токен в приложении (вкладка Настройки)."
echo
echo "Когда домен будет указывать на этот сервер — запустите deploy/setup-nginx-tls.sh."
