# Сборка APK для Қаламқас Карта

## Что изменилось

В проект добавлен **Capacitor** — мост между веб-приложением и Android.
Он оборачивает React-билд в нативный Android WebView.

### Новые файлы:
- `frontend/capacitor.config.ts` — конфигурация Capacitor
- `frontend/android/` — нативный Android-проект (генерируется автоматически)
- `.github/workflows/build-apk.yml` — GitHub Actions для автосборки APK
- `frontend/index.html` — точка входа Vite (был в .gitignore, исправлено)

### Изменённые файлы:
- `frontend/vite.config.ts` — добавлена переменная `CAPACITOR=true` для относительных путей
- `frontend/package.json` — добавлен скрипт `build:mobile`, добавлены Capacitor-зависимости
- `.gitignore` — убран `index.html`, добавлены Android build-папки

---

## Способ 1: Автосборка через GitHub Actions (рекомендуется)

Не нужно ничего устанавливать локально. GitHub всё соберёт сам.

### Шаги:

1. **Запушь изменения в репозиторий:**
   ```bash
   cd kalamkas-app
   git add .
   git commit -m "feat: add Capacitor Android build"
   git push origin master
   ```

2. **Дождись сборки:**
   - Открой GitHub → вкладка **Actions**
   - Увидишь workflow "Build APK" — он запустится автоматически
   - Сборка займёт ~3-5 минут

3. **Скачай APK:**
   - Открой завершённый workflow run
   - Внизу будет раздел **Artifacts**
   - Скачай `kalamkas-map-debug` → внутри будет `app-debug.apk`

4. **Установи на телефон:**
   - Перекинь APK на телефон (через Telegram, Google Drive, кабель)
   - Открой файл → разреши установку из неизвестных источников → Установить

### Ручной запуск:
Можно запустить сборку вручную без пуша:
GitHub → Actions → "Build APK" → **Run workflow** (кнопка справа)

---

## Способ 2: Локальная сборка (нужен Android Studio)

### Предварительно установить:
- [Android Studio](https://developer.android.com/studio) (скачает Android SDK автоматически)
- Node.js 18+ (уже есть)
- JDK 17 (обычно идёт с Android Studio)

### Шаги:

```bash
cd kalamkas-app/frontend

# 1. Установить зависимости
npm install

# 2. Собрать фронтенд для мобильной версии
npm run build:mobile

# 3. Открыть в Android Studio
npx cap open android
```

В Android Studio:
- Подождать пока Gradle синхронизируется (1-2 минуты первый раз)
- Меню: **Build → Build Bundle / APK → Build APK(s)**
- APK появится: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

---

## FAQ

### Как обновить APK после изменений в коде?
```bash
cd frontend
npm run build:mobile    # пересобирает и синхронизирует
npx cap open android    # открывает в Android Studio → Build APK
```
Или просто запушь в GitHub — Actions соберёт новый APK.

### Почему debug, а не release?
Debug APK не требует ключа подписи — можно сразу ставить на любой телефон.
Для публикации в Google Play нужен release APK с подписью — это отдельный шаг.

### Можно ли поменять иконку приложения?
Да, замени файлы в `frontend/android/app/src/main/res/mipmap-*/`.
Удобнее всего через [Android Asset Studio](https://icon.kitchen/).

### Приложение работает без интернета?
Да, карта и данные (GeoJSON) встроены в APK. Тайловая подложка (OpenStreetMap)
требует интернета, но можно добавить офлайн-тайлы позже.

### Минимальная версия Android?
Android 5.1+ (API 22) — поддерживает 99%+ устройств.
