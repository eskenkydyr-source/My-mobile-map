# CLAUDE.md — Қаламқас Field Map Application

## 🎯 Проект

Веб/мобильное приложение для управления картой нефтяного месторождения Қаламқас.
Заменяет текущий монолитный `index.html` на полноценное приложение с базой данных,
API и React-фронтендом.

---

## 🏗️ Архитектура

```
kalamkas-app/
├── CLAUDE.md                 ← этот файл
├── README.md
├── docker-compose.yml        ← PostgreSQL + Redis + API + Frontend
│
├── backend/                  ← FastAPI (Python)
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── wells.py
│   │   │   │   ├── graph.py
│   │   │   │   ├── routes.py   ← маршрутизация A*
│   │   │   │   ├── import.py   ← импорт CSV/Excel
│   │   │   │   └── export.py
│   │   ├── models/
│   │   │   ├── well.py
│   │   │   ├── graph_node.py
│   │   │   ├── graph_edge.py
│   │   │   ├── bkns.py
│   │   │   └── gu.py
│   │   ├── services/
│   │   │   ├── astar.py        ← A* алгоритм
│   │   │   ├── graph_service.py
│   │   │   ├── import_service.py
│   │   │   └── html_parser.py  ← парсинг старого index.html
│   │   ├── db/
│   │   │   ├── database.py
│   │   │   └── migrations/
│   │   └── tests/
│   │       ├── test_astar.py
│   │       ├── test_graph.py
│   │       ├── test_wells.py
│   │       └── test_import.py
│   ├── requirements.txt
│   └── pytest.ini
│
├── frontend/                 ← React + TypeScript + Leaflet
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map/
│   │   │   │   ├── MapView.tsx
│   │   │   │   ├── WellMarker.tsx
│   │   │   │   ├── RouteLayer.tsx
│   │   │   │   └── GraphEditor.tsx
│   │   │   ├── Sidebar/
│   │   │   │   ├── LayersPanel.tsx
│   │   │   │   ├── RoutePanel.tsx
│   │   │   │   └── ObjectPanel.tsx
│   │   │   └── UI/
│   │   ├── hooks/
│   │   │   ├── useGraph.ts
│   │   │   ├── useRoute.ts
│   │   │   └── useWells.ts
│   │   ├── api/
│   │   │   └── client.ts
│   │   ├── store/             ← Zustand
│   │   └── tests/
│   │       ├── Map.test.tsx
│   │       └── Route.test.tsx
│   ├── package.json
│   └── vite.config.ts
│
└── scripts/
    ├── seed_db.py             ← импорт данных из index.html в БД
    ├── run_tests.sh
    └── deploy.sh
```

---

## 🤖 Правила для Claude Code агента

### ОБЯЗАТЕЛЬНЫЙ ПОРЯДОК РАБОТЫ (TDD)

**ВСЕГДА** следуй этому порядку:

```
1. ПОНЯТЬ задачу → записать в TODO
2. НАПИСАТЬ тесты → они должны провалиться (Red)
3. НАПИСАТЬ минимальный код → тесты проходят (Green)  
4. РЕФАКТОРИНГ → тесты всё ещё проходят (Refactor)
5. ЗАФИКСИРОВАТЬ изменения
```

Никогда не пиши код без предварительного теста. Если тест уже есть — сначала запусти его.

### СУБАГЕНТЫ — распределение задач

При сложных задачах запускай субагентов параллельно через `Task` tool:

```python
# Пример декомпозиции задачи "добавить импорт Excel"
subagents = [
    Task("Написать тесты для import_service.py"),
    Task("Написать модели БД для импортируемых данных"),
    Task("Написать парсер Excel файла"),
    Task("Написать API endpoint для загрузки файла"),
]
# Запускать параллельно, объединять результаты
```

**Правила разбивки на субагентов:**
- Каждый субагент работает с одним модулем/файлом
- Субагенты не зависят друг от друга по данным
- Тесты — отдельный субагент всегда
- Frontend и Backend — всегда разные субагенты

### ПОНИМАНИЕ ЗАДАЧИ перед началом

Перед любой задачей выполни анализ:

```
## Анализ задачи: [название]

### Что нужно сделать:
- [ ] ...

### Зависимости:
- Какие файлы нужно изменить
- Какие API затрагиваются
- Есть ли миграции БД

### Тесты которые нужно написать:
- Unit тесты: ...
- Integration тесты: ...
- E2E тесты: ...

### Риски:
- ...

### Оценка: [S/M/L/XL]
```

---

## 🗄️ База данных

**PostgreSQL** — основное хранилище всех изменений.

### Схема

```sql
-- Скважины
CREATE TABLE wells (
    id          SERIAL PRIMARY KEY,
    well_id     VARCHAR(50) UNIQUE NOT NULL,   -- "1234"
    well_type   VARCHAR(20),                   -- dob, nagn, likv, water, gaz, kontr, razv
    lat         DOUBLE PRECISION NOT NULL,
    lon         DOUBLE PRECISION NOT NULL,
    properties  JSONB,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

-- Узлы графа дорог
CREATE TABLE graph_nodes (
    id          SERIAL PRIMARY KEY,
    node_idx    INTEGER UNIQUE NOT NULL,       -- индекс в исходном массиве
    lat         DOUBLE PRECISION NOT NULL,
    lon         DOUBLE PRECISION NOT NULL,
    node_type   VARCHAR(20) DEFAULT 'road',    -- road, bkns, gu, custom
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

-- Рёбра графа
CREATE TABLE graph_edges (
    id          SERIAL PRIMARY KEY,
    from_node   INTEGER REFERENCES graph_nodes(node_idx),
    to_node     INTEGER REFERENCES graph_nodes(node_idx),
    distance_m  INTEGER NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- История изменений графа
CREATE TABLE graph_history (
    id          SERIAL PRIMARY KEY,
    action      VARCHAR(20),                   -- add_node, delete_node, delete_edge, move_node
    data        JSONB,
    user_note   TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- БКНС
CREATE TABLE bkns (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100),
    lat         DOUBLE PRECISION,
    lon         DOUBLE PRECISION,
    properties  JSONB,
    geometry    JSONB                          -- GeoJSON polygon
);

-- ГУ (групповые установки)
CREATE TABLE gu (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100),
    lat         DOUBLE PRECISION,
    lon         DOUBLE PRECISION,
    properties  JSONB,
    geometry    JSONB
);

-- Импортированные файлы
CREATE TABLE import_log (
    id          SERIAL PRIMARY KEY,
    filename    VARCHAR(255),
    file_type   VARCHAR(20),                   -- excel, csv, json
    rows_imported INTEGER,
    status      VARCHAR(20),
    error_msg   TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);
```

---

## 🔌 API Endpoints

```
GET    /api/wells                    → список скважин (фильтр по типу, bbox)
GET    /api/wells/{id}               → данные скважины
POST   /api/wells                    → добавить скважину
PUT    /api/wells/{id}               → обновить

GET    /api/graph/nodes              → все узлы графа
GET    /api/graph/edges              → все рёбра
POST   /api/graph/nodes              → добавить узел
DELETE /api/graph/nodes/{id}         → удалить узел
DELETE /api/graph/edges/{from}/{to}  → удалить ребро
PUT    /api/graph/nodes/{id}/move    → переместить узел

POST   /api/route                    → построить маршрут A*
       body: { from: [lat,lon], to: [lat,lon] }
       response: { path: [[lat,lon],...], distance_m, nodes }

POST   /api/import/excel             → загрузить Excel файл
POST   /api/import/csv               → загрузить CSV
GET    /api/import/log               → история импортов

GET    /api/bkns                     → список БКНС
GET    /api/gu                       → список ГУ

GET    /api/export/graph             → экспорт графа в JSON
GET    /api/export/wells             → экспорт скважин в CSV
```

---

## 🧪 Тестирование

### Backend (pytest)
```bash
cd backend
pytest tests/ -v --cov=app --cov-report=html
```

### Frontend (vitest)
```bash
cd frontend  
npm run test
npm run test:coverage
```

### E2E (playwright)
```bash
npm run test:e2e
```

### Минимальный coverage: 80%

---

## ⚙️ Команды для разработки

```bash
# Запуск всего окружения
docker-compose up -d

# Backend dev server
cd backend && uvicorn app.main:app --reload --port 8000

# Frontend dev server
cd frontend && npm run dev

# Запуск тестов backend
cd backend && pytest -x -v

# Запуск тестов frontend
cd frontend && npm test

# Сид базы из index.html
python scripts/seed_db.py --source ../index.html

# Миграции
cd backend && alembic upgrade head
cd backend && alembic revision --autogenerate -m "description"
```

---

## 📦 Технологический стек

### Backend
- **Python 3.11+**
- **FastAPI** — REST API
- **SQLAlchemy 2.0** — ORM (async)
- **Alembic** — миграции
- **PostgreSQL 15** — основная БД
- **Redis** — кеш маршрутов A*
- **Pandas** — парсинг Excel/CSV
- **pytest + httpx** — тесты

### Frontend
- **React 18 + TypeScript**
- **Vite** — сборка
- **Leaflet + react-leaflet** — карта
- **Zustand** — стейт
- **TanStack Query** — API запросы
- **Tailwind CSS** — стили
- **Vitest + Testing Library** — тесты

### DevOps
- **Docker + docker-compose**
- **GitHub Actions** — CI/CD
- **nginx** — reverse proxy

---

## 🚀 Этапы разработки

### Фаза 1 — Миграция данных (текущий приоритет)
- [ ] Написать парсер `index.html` → извлечь WELLS, BKNS, GU, GRAPH
- [ ] Написать тесты для парсера
- [ ] Создать схему БД и миграции
- [ ] Написать `seed_db.py` для заполнения БД
- [ ] Тесты: проверить что все 3308 скважин загрузились корректно

### Фаза 2 — Backend API
- [ ] CRUD для скважин (тесты → код)
- [ ] CRUD для графа узлов/рёбер (тесты → код)
- [ ] A* маршрутизация (тесты → код, переписать с JS)
- [ ] Импорт Excel/CSV (тесты → код)

### Фаза 3 — Frontend
- [ ] Базовый MapView с Leaflet
- [ ] Слои: скважины, БКНС, ГУ
- [ ] Боковая панель (3 вкладки)
- [ ] Построение маршрута
- [ ] Редактор графа

### Фаза 4 — Продвинутые функции
- [ ] Мобильная адаптация (PWA)
- [ ] Офлайн режим
- [ ] История изменений графа
- [ ] Экспорт отчётов

---

## 🧠 Контекст предметной области

**Қаламқас** — нефтяное месторождение в Казахстане (Мангистауская область).

**Объекты карты:**
- **Скважины** (3308 шт) — типы: добывающие, нагнетательные, ликвидированные, водозаборные, газовые, контрольные, разведочные
- **БКНС** (11 шт) — блочные кустовые насосные станции, перекачивают воду для поддержания пластового давления
- **ГУ** (73 шт) — групповые установки, сбор нефти со скважин куста
- **ЦДНГ** — цех добычи нефти и газа (территориальные зоны)

**Граф дорог:**
- 693 узла, 1384 ребра
- A* алгоритм для построения маршрутов
- Типы узлов: road, bkns, gu, custom

**Координатная система:** WGS84 (lat/lon), Казахстан ~45.3-45.4°N, 51.8-52.1°E

---

## 📋 Правила кода

1. **Типизация везде** — Python: type hints обязательны, TS: no `any`
2. **Async/await** в Python для всех DB операций
3. **Pydantic v2** для валидации данных в FastAPI
4. **Константы** выносить в `config.py` / `constants.ts`
5. **Логирование** через `structlog` (Python) / `winston` (Node)
6. **Ошибки** — кастомные exception классы, не голые `Exception`
7. **Комментарии** на русском для бизнес-логики, английский для технических
8. **Git commits** формат: `feat:`, `fix:`, `test:`, `refactor:`, `docs:`

---

## 🔑 Переменные окружения (.env)

```env
# Database
DATABASE_URL=postgresql+asyncpg://kalamkas:password@localhost:5432/kalamkas_db
REDIS_URL=redis://localhost:6379

# API
SECRET_KEY=your-secret-key-here
API_PREFIX=/api
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]

# Import
MAX_IMPORT_FILE_SIZE_MB=50
ALLOWED_IMPORT_EXTENSIONS=.xlsx,.xls,.csv

# Map
DEFAULT_MAP_CENTER_LAT=45.374
DEFAULT_MAP_CENTER_LON=51.926
DEFAULT_MAP_ZOOM=12
```

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
