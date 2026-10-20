# Симулятор шкипера · Skipper Simulator

Нарративный симулятор решений шкипера чартерной яхты на одну неделю. ТЗ: `Симулятор шкипера — ТЗ v0.1.md`.

## Запуск

```bash
npm install
npm run dev          # игра в браузере: http://localhost:5173
npm test             # движок + UI
npm run build        # статическая сборка в dist/
npm run simulate -- --seed 42 --strategy newbie   # неделя в консоли
npm run validate-content                          # проверка content/core/*.json и content/regions/*
```

## Устройство

- `src/engine/` — правила игры, чистые функции, без DOM. Публичный API: `src/engine/index.ts`.
- `src/content/` + `content/core/` (общие данные) + `content/regions/<id>/` (карта, маршруты, погода, события) — данные и их валидатор. Новое событие добавляется правкой JSON.
- `src/ui/` — React-интерфейс: `session/` (состояние и сохранение), `screens/` (экран = папка со своими строками RU/EN), `components/`, `view/` (подготовка данных для экранов).
- Иллюстрации сцен: положите картинку в `public/scenes/` и добавьте её в `src/ui/scenes/manifest.ts`. Без картинки показывается заглушка.

## Деплой

`main` автоматически публикуется на GitHub Pages (`.github/workflows/pages.yml`). Один раз включите Pages: **Settings → Pages → Source: GitHub Actions**. На бесплатном плане GitHub это работает только для публичного репозитория.
