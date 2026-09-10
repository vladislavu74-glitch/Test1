# Деплой на VPS (178.217.98.225, Debian 13)

## Почему это не сделал я сам

Эта сессия Claude Code работает в изолированном облачном контейнере, у
которого исходящий доступ в интернет разрешён **только по HTTPS через
внутренний прокси**. Исходящие SSH-соединения (порт 22, произвольный TCP)
на этом уровне заблокированы полностью — подтверждено дважды (обычным
`ssh` и сырым TCP-соединением), это ограничение инфраструктуры песочницы,
а не то, что можно обойти настройками.

Поэтому ниже — точные команды, которые нужно выполнить **вам** (через свой
терминал/SSH-клиент, или через веб-консоль хостинга VDSina). Если что-то
пойдёт не так — пришлите мне вывод ошибки, и я поправлю скрипт/инструкцию.

**Важно про секреты**: этот файл лежит в публичном репозитории — реальный
пароль от почты и итоговый `API_AUTH_TOKEN` в него не попадают, они
подставляются только в переменные окружения на самом сервере, командой,
которую вы вводите в своей терминальной сессии.

## Шаг 1. Подключение к серверу

```bash
ssh root@178.217.98.225
```
(после первого входа рекомендую сменить пароль root — `passwd`.)

## Шаг 2. Установка backend'а — один блок команд

Репозиторий `vladislavu74-glitch/Test1` публичный, `git clone` работает
без токена. Подставьте свои значения для SMTP (см. ниже, где их взять) и
выполните на сервере:

```bash
export GIT_URL="https://github.com/vladislavu74-glitch/Test1.git"
export GIT_BRANCH="claude/ios-job-monitoring-app-3j1ae5"
export API_AUTH_TOKEN="$(openssl rand -hex 32)"
export SMTP_HOST="mail.hosting.reg.ru"
export SMTP_PORT="465"
export SMTP_SECURE="true"
export SMTP_USER="v_utkin@castleduck.com"
export SMTP_PASS="ВАШ_ПАРОЛЬ_ОТ_ПОЧТЫ"
export MAIL_FROM="Vlad Utkin <v_utkin@castleduck.com>"

curl -fsSL "https://raw.githubusercontent.com/vladislavu74-glitch/Test1/${GIT_BRANCH}/backend/deploy/setup.sh" -o setup.sh
bash setup.sh
echo "Ваш API_AUTH_TOKEN: $API_AUTH_TOKEN"   # впишите это значение в приложении, во вкладке Настройки
```

Скрипт: ставит Node.js 22, клонирует репозиторий в `/opt/jobmonitor`,
заполняет `.env` (включая SMTP, если переменные заданы), накатывает
миграции и seed, собирает проект, поднимает systemd-сервис `jobmonitor`,
открывает порт `4000` через ufw для проверки по IP, сам проверяет
health-эндпоинт и (если задан SMTP) сразу отправляет тестовое письмо —
внизу вывода будет `SMTP OK` или текст ошибки.

`API_AUTH_TOKEN` генерируется заново на сервере командой в блоке выше —
он не хранится в репозитории. Запишите значение, которое скрипт выведет в
конце — оно понадобится в приложении.

## Шаг 3. Проверка

```bash
curl http://178.217.98.225:4000/api/health
curl -H "Authorization: Bearer <API_AUTH_TOKEN>" http://178.217.98.225:4000/api/sources
journalctl -u jobmonitor -f     # логи, в т.ч. ежедневного скана в 10:00
```

В приложении (вкладка Настройки) укажите `http://178.217.98.225:4000` и
этот токен.

## Шаг 4. Домен и HTTPS (когда A-запись будет готова)

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
su -s /bin/bash jobmonitor -c "cd /opt/jobmonitor && git pull origin claude/ios-job-monitoring-app-3j1ae5"
su -s /bin/bash jobmonitor -c "cd /opt/jobmonitor/backend && npm ci && npx prisma migrate deploy && npm run build"
systemctl restart jobmonitor
```

(используем `su`, а не `sudo` — на минимальных образах Debian `sudo` может
быть не установлен, `su` есть всегда.)
