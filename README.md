# Қаламқас Field Map — Application

Веб/мобильное приложение для управления картой нефтяного месторождения Қаламқас.

---

## 🚀 Быстрый старт

```bash
# 1. Клонировать и установить зависимости
git clone <repo>
cd kalamkas-app

# 2. Запустить БД
docker-compose up -d db redis

# 3. Backend
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

# 4. Заполнить БД данными из старого index.html
python scripts/seed_db.py --source /path/to/index.html

# 5. Frontend
cd frontend
npm install
npm run dev
```

---

## 🤖 Работа с Claude Code агентом

### Запуск агента
```bash
claude
```

### Что умеет агент
- Читает `CLAUDE.md` и понимает архитектуру проекта
- Пишет тесты **перед** кодом (TDD)
- Запускает субагентов параллельно для сложных задач
- Работает с БД, парсит файлы, строит маршруты

### Примеры задач для агента

```
"Добавь endpoint для поиска скважин по радиусу от точки"

"Реализуй импорт Excel файла с колонками: номер скважины, тип, широта, долгота"

"Напиши React компонент RoutePanel — две точки на карте, строит маршрут через API"

"Добавь историю изменений графа с возможностью отката (undo)"

"Оптимизируй A* чтобы кешировать результаты в Redis"
```

### Структура задачи для агента (копируй шаблон)

```
## Задача: [название]

### Контекст:
[что уже есть, на что опираться]

### Требования:
1. ...
2. ...

### Критерии готовности:
- [ ] Тесты написаны и проходят
- [ ] Покрытие >= 80%
- [ ] API задокументирован
- [ ] Работает в docker-compose
```

---

## 📁 Структура проекта

```
kalamkas-app/
├── CLAUDE.md           ← инструкции для Claude Code агента
├── README.md
├── docker-compose.yml
├── backend/            ← FastAPI + PostgreSQL
│   ├── app/
│   │   ├── api/        ← REST endpoints
│   │   ├── models/     ← SQLAlchemy модели
│   │   ├── services/   ← бизнес-логика (A*, парсер, импорт)
│   │   ├── tests/      ← pytest тесты
│   │   └── main.py
│   └── requirements.txt
├── frontend/           ← React + TypeScript + Leaflet
└── scripts/
    └── seed_db.py      ← миграция данных из index.html
```

---

## 🧪 Тесты

```bash
# Backend
cd backend && pytest -v --cov=app

# Frontend
cd frontend && npm test

# Только быстрые тесты (без интеграционных)
cd backend && pytest -v -m "not integration"
```

---

## 📊 Текущий статус

| Компонент        | Статус     |
|------------------|------------|
| A* алгоритм      | ✅ Готов + тесты |
| HTML парсер      | ✅ Готов + тесты |
| DB схема         | 🔄 В работе |
| REST API         | 🔄 В работе |
| React frontend   | ⏳ Планируется |
| Docker setup     | ✅ Готов |
