# Деплой на VPS (178.217.98.225, Debian 13)

## Почему это не сделал я сам

Эта сессия Claude Code работает в изолированном облачном контейнере, у
которого исходящий доступ в интернет разрешён **только по HTTPS через
внутренний прокси**. Исходящие SSH-соединения (порт 22, произвольный TCP)
на этом уровне заблокированы полностью — это ограничение инфраструктуры
песочницы, а не что-то, что можно обойти настройками. Попытка `ssh
root@178.217.98.225` из этой сессии просто не доходит до сервера (таймаут
уже на этапе установления соединения).

Поэтому ниже — точные команды, которые нужно выполнить **вам** (через свой
терминал/SSH-клиент, или через веб-консоль хостинга VDSina). Если что-то
пойдёт не так — пришлите мне вывод ошибки, и я поправлю скрипт/инструкцию.

## Шаг 1. Подключение к серверу

```bash
ssh root@178.217.98.225
```
(пароль вам известен; после первого входа рекомендую сразу сменить пароль
root — `passwd` — раз он проходил через переписку).

## Шаг 2. Первичная настройка backend'а

Репозиторий `vladislavu74-glitch/Test1`, судя по всему, приватный — для
`git clone` на сервере нужен доступ. Проще всего — Personal Access Token:
GitHub → Settings → Developer settings → Personal access tokens → создать
токен с правом `repo`, затем на сервере:

```bash
export GIT_URL="https://<ВАШ_ТОКЕН>@github.com/vladislavu74-glitch/Test1.git"
export GIT_BRANCH="claude/ios-job-monitoring-app-3j1ae5"
export API_AUTH_TOKEN="f691ef35bea67893ccf50973495ccec69b446de2817f5455d50f44c190427e5e"

curl -fsSL "https://raw.githubusercontent.com/vladislavu74-glitch/Test1/${GIT_BRANCH}/backend/deploy/setup.sh" -o setup.sh \
  || echo "Если repo приватный, curl сюда не достанет — тогда просто скопируйте содержимое backend/deploy/setup.sh в файл на сервере вручную (nano setup.sh)."
bash setup.sh
```

Токен `API_AUTH_TOKEN` выше сгенерирован для вас заранее (32 случайных
байта) — используйте именно его или свой, но тот же самый нужно будет
вписать в приложении (вкладка **Настройки**).

Скрипт: ставит Node.js 22, клонирует репозиторий в `/opt/jobmonitor`,
создаёт `.env` из `.env.example` с уже подставленными
`API_AUTH_TOKEN`/`CRON_TZ`/`MAIL_TO`, накатывает миграции и seed,
собирает проект, поднимает systemd-сервис `jobmonitor` и открывает порт
`4000` через ufw для проверки по IP.

## Шаг 3. SMTP для писем

Откройте `.env` на сервере и заполните SMTP-блок (для Gmail — пароль
приложения, https://myaccount.google.com/apppasswords):

```bash
nano /opt/jobmonitor/backend/.env
# SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
systemctl restart jobmonitor
```

## Шаг 4. Проверка

```bash
curl http://178.217.98.225:4000/api/health
curl -H "Authorization: Bearer <API_AUTH_TOKEN>" http://178.217.98.225:4000/api/sources
journalctl -u jobmonitor -f     # логи, в т.ч. ежедневного скана в 10:00
```

На этом этапе в приложении (вкладка Настройки) можно указать
`http://178.217.98.225:4000` и токен — всё уже должно работать (кроме
писем, пока не заполнен SMTP).

## Шаг 5. Домен и HTTPS (когда A-запись будет готова)

Направьте A-запись вашего домена на `178.217.98.225`, дождитесь
распространения (`dig +short ваш-домен.ру` должен вернуть этот IP), затем:

```bash
cd /opt/jobmonitor/backend/deploy
DOMAIN="ваш-домен.ру" CERTBOT_EMAIL="ваш@email" bash setup-nginx-tls.sh
```

Скрипт настроит nginx как реверс-прокси на порт 4000, выпустит сертификат
Let's Encrypt через certbot и закроет прямой доступ к порту 4000 (наружу
остаются только 80/443). После этого в приложении смените адрес backend'а
на `https://ваш-домен.ру`.

## Обновление кода в будущем

```bash
cd /opt/jobmonitor
sudo -u jobmonitor git pull origin claude/ios-job-monitoring-app-3j1ae5
cd backend
sudo -u jobmonitor npm ci
sudo -u jobmonitor npx prisma migrate deploy
sudo -u jobmonitor npm run build
systemctl restart jobmonitor
```
