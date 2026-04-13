# Каталог автомобилей (CarSensor)

Монорепозиторий: скрапинг объявлений с [CarSensor](https://www.carsensor.net/), API с JWT, веб-каталог на React. Фотографии кешируются на диск и отдаются через API.

## Состав

| Пакет | Описание |
|--------|-----------|
| `apps/api` | Express, Prisma, PostgreSQL. Авторизация JWT, список/карточка авто, раздача `/uploads` |
| `apps/worker` | Почасовой cron: парсинг листинга и карточек, нормализация полей (JA → RU/латиница), загрузка фото в `uploads/cars` |
| `apps/web` | Vite + React: каталог, карточка с галереей, адаптивная вёрстка |

## Требования

- **Node.js** 18+ (проверено на 18.16; для Prisma 5.x не нужен Node 20)
- **Docker Desktop** (опционально) — только PostgreSQL для локальной разработки
- Доступ в интернет для скрапинга и CDN CarSensor

## Быстрый старт (локально)

1. **Переменные окружения**

   ```bash
   cp .env.example .env
   cp .env.example apps/api/.env
   ```

   Prisma и команды в `apps/api` читают `apps/api/.env`. Воркер подхватывает корневой `.env`, затем `apps/api/.env`.

2. **PostgreSQL**

   ```bash
   docker compose up -d
   ```

   Сервис **Redis** в `docker-compose.yml` сейчас приложением не используется (зарезервирован на будущее).

3. **Зависимости и БД**

   ```bash
   npm install
   npm --workspace @cars/api run prisma:generate
   npm --workspace @cars/api run prisma:migrate -- --name init
   npm --workspace @cars/api run prisma:seed
   ```

   Учётная запись для API: **`admin` / `admin123`** (хеш в БД).

4. **Фронт**

   ```bash
   cp apps/web/.env.example apps/web/.env
   ```

   В `apps/web/.env` задайте `VITE_API_URL=http://localhost:4000` (в проде — публичный URL API).

5. **Запуск (три процесса)**

   ```bash
   npm run dev:api     # http://localhost:4000
   npm run dev:worker
   npm run dev:web     # http://localhost:3000
   ```

   После первого запуска воркера данные и фото появятся в БД и в каталоге `uploads/cars`.

## Переменные окружения

### Корень / `apps/api/.env`

| Переменная | Назначение |
|------------|------------|
| `DATABASE_URL` | Строка подключения PostgreSQL |
| `JWT_SECRET` | Секрет подписи JWT |
| `API_PORT` | Порт API (по умолчанию `4000`) |
| `JWT_EXPIRES_IN` | Время жизни токена (например `12h`) |
| `UPLOADS_DIR` | Абсолютный путь к каталогу `uploads` (общий для API и воркера). Если не задан — `<корень репо>/uploads` |
| `IMAGE_CACHE_PASSES` | Число проходов при скачивании одного фото (воркер) |
| `IMAGE_CACHE_FORCE` | Если `1`, воркер при синке **всегда** перекачивает фото (после смены логики URL на диске остаются старые файлы с тем же именем) |
| `REHYDRATE_SCRAPE_RETRIES` | Повторы запроса карточки при регидрации фото |

### `apps/web/.env` (префикс `VITE_`)

| Переменная | Назначение |
|------------|------------|
| `VITE_API_URL` | Базовый URL API (без слэша в конце) |
| `VITE_DEMO_USERNAME` / `VITE_DEMO_PASSWORD` | Логин для авто-запросов к API с фронта (по умолчанию admin / admin123) |

## Полезные команды

```bash
# Сборка всех пакетов
npm run build

# Продакшен-запуск (после build)
npm run start:api
npm run start:worker

# Превью собранного фронта
npm --workspace @cars/web run preview

# Сброс только машин в БД + очистка uploads/cars (пользователь admin не трогается)
npm --workspace @cars/api run db:reset-cars

# Перекачать фото по текущим объявлениям (обновить записи CarImage)
npm --workspace @cars/worker run rehydrate:images

# То же на проде без tsx (Render Shell из корня репо после сборки)
npm --workspace @cars/worker run rehydrate:images:prod

# Удалить все файлы в uploads/cars и заново скачать
npm --workspace @cars/worker run fresh:images
```

## API (кратко)

- `GET /health` — проверка живости
- `POST /auth/login` — тело `{ "username", "password" }` → `{ accessToken }`
- `GET /cars` — список (query: `page`, `limit`, фильтры по марке/году/цене/пробегу, `sortBy`, `sortOrder`). Нужен заголовок `Authorization: Bearer <token>`
- `GET /cars/:id` — карточка с `images[]`. JWT обязателен
- Статика: `GET /uploads/...` — закешированные фото

## Воркер

- Расписание: **каждый час** (`0 * * * *`), плюс один прогон при старте.
- Источник: листинг `usedcar/index.html`, затем страницы объявлений.
- Фото: нормализация URL (в т.ч. CDN `ccsrpcml`, суффикс `L`), выбор **крупнейшего** варианта из `srcset`, доп. поиск URL в HTML; сохранение в `uploads/cars`, в БД пути вида `/uploads/cars/...`. После обновления логики качества на проде: один прогон с `IMAGE_CACHE_FORCE=1` **или** регидрация (`rehydrate:images` локально / `rehydrate:images:prod` в Render Shell — там уже `force`).
- Тексты полей нормализуются в `apps/worker/src/scraper/normalize.ts`.

## Сборка под выкладку

1. **API**

   ```bash
   npm run build
   npm --workspace @cars/api run prisma:deploy
   npm run start:api
   ```

   На проде выполняйте миграции один раз при деплое: `prisma migrate deploy` (не `migrate dev`).

2. **Воркер** — отдельный процесс/сервис с тем же `DATABASE_URL`, `UPLOADS_DIR` и доступом к той же файловой папке `uploads`, что и у API.

3. **Web**

   ```bash
   npm run build:web
   ```

   Артефакты в `apps/web/dist`. Задайте `VITE_API_URL` на **публичный HTTPS-URL API** на этапе сборки.

## Рекомендуемая схема деплоя

Подходит вариант «отдельные сервисы + управляемая БД»:

| Компонент | Варианты |
|-----------|----------|
| PostgreSQL | Neon, Supabase, RDS, managed Postgres хостинга |
| API | Render, Railway, Fly.io, VPS (systemd/Docker) |
| Worker | Второй процесс на том же хосте или отдельный сервис с тем же образом/репо |
| Фронт | Vercel, Netlify, Cloudflare Pages, статика за CDN |
| Файлы `uploads` | Общий том (volume) или сетевой диск, **один и тот же путь** в `UPLOADS_DIR` для API и воркера |

**Важно**

- После деплоя фронта включите **CORS** на API для домена сайта (сейчас `cors()` без ограничений — для прода лучше сузить `origin`).
- Секреты: смените `JWT_SECRET`, пароль admin при необходимости через БД/новый seed.
- Таймауты и лимиты хостинга: воркер делает много HTTP-запросов к CarSensor; при блокировках увеличьте `IMAGE_CACHE_PASSES` / повторы или перенесите воркер на VPS с стабильным IP.

## Render

В корне лежит [`render.yaml`](render.yaml): managed Postgres (`carsensor-db`), один веб-сервис **`carsensor-api`** (API + воркер в одном процессе через [`scripts/render-start-combined.sh`](scripts/render-start-combined.sh), чтобы общий каталог `uploads/` был одним и тем же), статика **`carsensor-web`**.

1. Запушьте репозиторий на GitHub (публичный).
2. [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint** → укажите репозиторий → подтвердите создание ресурсов.
3. Дождитесь деплоя API, затем при необходимости пересоберите фронт: в настройках `carsensor-web` переменная **`VITE_API_URL`** должна совпадать с публичным URL API (в blueprint задано `https://carsensor-api.onrender.com`; если переименуете сервис — обновите URL и сделайте **Manual Deploy** для веба).
4. Логин в каталог: **`admin` / `admin123`** (сид при старте контейнера API, вместе с `prisma migrate deploy` — на free tier нет `preDeployCommand`).

У бесплатного веб-сервиса возможен **cold start**; диск эфемерный — при рестарте кеш `uploads` обнуляется (картинки подтянутся снова по мере работы воркера).

## Лицензия и данные

Проект учебный/тестовый. Данные CarSensor принадлежат правообладателям; соблюдайте их правила использования и robots при публичной выкладке.
