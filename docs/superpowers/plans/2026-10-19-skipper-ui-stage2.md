# Симулятор шкипера — Этап 2 + стиль Этапа 4: браузерный интерфейс. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Неделю шкипера можно пройти в браузере от главного меню до разбора, на RU и EN. Есть все экраны ТЗ 6.1, морская карта на SVG, сохранение в localStorage. Поверх работает стиль «бортового журнала»: палитра, типографика, день и ночь, карта от руки, сдержанная анимация, вёрстка для телефона.

**Architecture:** UI — это тонкий слой поверх готового движка Этапа 1. Он никогда не считает правила сам, а только вызывает публичный API `src/engine/index.ts`. Состояние сессии живёт в чистом редьюсере `src/ui/session/reducer.ts`: `(Session, Action) → Session`. Редьюсер вызывает функции движка и ловит `EngineError`. Текущий экран вычисляется из состояния функцией `screenFor(session)`, роутера нет. Экраны — React-компоненты: каждый в своей папке, со своим словарём строк RU/EN. Движок по-прежнему не знает о DOM; единственное новое в нём — функция предпросмотра плана `previewPlan` для планировщика дня.

**Tech Stack:** React 19, Vite 5.4 (совместим с текущим Vitest 2), CSS Modules плюс CSS custom properties, SVG для карты и схем. Шрифты @fontsource: PT Serif (повествование), JetBrains Mono (приборы), Caveat (рукописные пометки), все три с кириллицей. Тесты UI: Vitest + jsdom + Testing Library. Визуальная проверка на телефоне и десктопе: Playwright (только Task 18).

**Spec:** `Симулятор шкипера — ТЗ v0.1.md` (разделы 6, 7.1, 7.3–7.4), плюс решения Этапа 1 из `docs/superpowers/stage1-followups.md`. Предыдущий план: `docs/superpowers/plans/2026-10-18-skipper-engine-stage1.md`.

**Вне плана:** иллюстрации сцен (их рисует генератор картинок, ТЗ 6.3; здесь только заменяемый слой с заглушками), звук, баланс (Этап 3), разбиение `planDay` на отдельные участки.

## Global Constraints

- Node ≥ 20, ESM, TypeScript `strict` + `noUncheckedIndexedAccess`. JSX: `"jsx": "react-jsx"`.
- Версии: `react@^19.1`, `react-dom@^19.1`, `vite@^5.4` (не 6: текущий `vitest@^2.1` требует Vite 5), `@vitejs/plugin-react@^4.3`, `jsdom@^25`, `@testing-library/react@^16`, `@testing-library/dom@^10`, `@testing-library/user-event@^14`, `@testing-library/jest-dom@^6`, `@fontsource/{pt-serif,jetbrains-mono,caveat}@^5`. В Task 18 добавляется `@playwright/test@^1.48`.
- UI импортирует движок **только** из `src/engine/index.ts` (путь `../../engine` и т.п.), а контент — только из `src/content/parse.ts`. Импорт `src/engine/<модуль>` из `src/ui/**` запрещён; это проверяет тест `tests/ui/boundaries.test.ts` (Task 1).
- `src/engine/**` и `src/content/{schema,validate,conditions,parse}.ts` по-прежнему не трогают DOM, `window`, `localStorage`, React, `Math.random`, `Date`.
- UI не считает правила игры. Время прихода, ветер, шансы проверок, доступность вариантов, итоги берутся только из функций движка.
- Каждая строка интерфейса лежит в словаре `Dict<K>` с непустыми `ru` и `en` (`src/ui/i18n/t.ts`). Литералы на русском или английском в JSX запрещены; исключение — `ContentErrorScreen`, который двуязычен намеренно. Полноту словарей проверяет тест `tests/ui/i18n.test.ts`.
- Словарь экрана лежит рядом с экраном: `src/ui/screens/<name>/strings.ts`. Общие строки — `src/ui/i18n/common.ts`, игровые термины (голоса, столпы, точки проверки, повреждения, сцены) — `src/ui/i18n/glossary.ts`.
- Экраны отправляют действия только через `useAct()` из `SessionContext.tsx`. Хук помечает действие ключом текущего экрана, поэтому двойной клик не применяет действие дважды.
- Корневой элемент экрана — `ScreenFrame` с `data-screen="<Screen>"`. Тесты находят текущий экран по этому атрибуту.
- Стили: CSS Modules (`*.module.css`) рядом с компонентом. Цвета, шрифты и отступы берутся только из токенов `src/ui/styles/tokens.css` (`var(--…)`), hex-литералы в модулях запрещены.
- Анимации уважают `prefers-reduced-motion`: хук `useReducedMotion()` (Task 4) и глобальное правило в `global.css`.
- Сохранение: один слот `localStorage['skipper.save.v1']` и автосейв в начале каждого дня (ТЗ 7.1). Доступ к storage идёт через `try/catch`: приватный режим и квота не роняют игру.
- Файл ≤ 400 строк, функция ≤ 50 строк, компонент ≤ 150 строк JSX-логики. Если файл растёт, вынеси подкомпонент.
- Иммутабельность: состояние сессии и игры не мутируется, только копируется (`{ ...s }`).
- Коммиты: `<type>: <description>` (feat, fix, test, chore, docs, style), окончание:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Pdqpk9VAhNWW8cFzmX2cjj
  ```

## Review Focus

1. **Перезагрузка вкладки посреди дня и битое сохранение.** Автосейв пишется только утром. Ожидаемое поведение: «Продолжить» возвращает к утру текущего дня. Повреждённый JSON, чужая версия или ссылка на несуществующую лодку не роняют игру: меню показывает «Сохранение повреждено» и кнопку удалить. Тесты: Task 1 (`save.test.ts`), Task 5 (`MenuScreen.test.tsx`).
2. **Движок отвергает план** (утреннее событие съело время, выход уже после заката, маршрут не от текущей точки). Ожидаемое поведение: локализованный баннер ошибки, экран не меняется, белого экрана нет. Планировщик заранее не предлагает час выхода раньше текущих часов; после заката остаётся только «Провести день здесь». Тесты: Task 1 (reducer), Task 12 (`PlanningScreen.test.tsx`).
3. **Смена языка посреди партии.** Ожидаемое поведение: весь видимый текст (интерфейс и контент событий) переключается сразу, смешения языков нет, `game.lang` обновлён, следующий `presentEvent` отдаёт текст на новом языке. Тесты: Task 1 (reducer), Task 5, Task 14 (неделя целиком на EN).
4. **Экран телефона 375 px.** Ожидаемое поведение: нет горизонтального скролла, карта масштабируется в ширину, кнопки не меньше 44 px, боковая панель уходит под основной блок. Тест: Task 18 (Playwright, 375 и 1280).
5. **Двойной клик по кнопке действия** («Дальше», вариант события). Ожидаемое поведение: второй клик того же экрана игнорируется. Он не разрешает следующее событие из очереди и не показывает «Expected phase…». Тест: Task 1 (`reducer.test.ts`, действие с устаревшим `key`) и Task 10 (двойной клик по варианту).

---

## Параллельное исполнение

Порядок тот же, что на Этапе 1: волны, внутри волны задачи независимы, каждая идёт в своём worktree от ветки `stage2-ui`. Волна стартует, когда смержена вся предыдущая.

| Волна | Задачи | Параллельно | Зависит от |
|---|---|---|---|
| 0 | T1 Каркас UI: Vite, React, сессия, сохранение, i18n, оболочка, заглушки всех экранов, токены, тестовые хелперы | 1 агент | Этап 1 |
| 1 | T2 API движка для UI (`previewPlan` + экспорт + мелкие фиксы) · T3 слой представления (ресурсы, бортжурнал, проекция карты) + `ResourcePanel` · T4 общие компоненты (голоса, Typewriter, роза ветров, reduced motion) · T5 главное меню · T6 капитан и выбор лодки · T7 приёмка и брифинг | 6 агентов | T1 |
| 2 | T8 морская карта `ChartMap` · T9 утро, вечер, сдача · T10 событие и итог выбора · T11 разбор недели и бортжурнал | 4 агента | Волна 1 |
| 3 | T12 планировщик дня · T13 манёвры и переход | 2 агента | Волна 2 |
| 4 | T14 неделя целиком в UI (RU и EN), сборка, CI, деплой на Pages | 1 агент | Волна 3 |
| 5 | T15 день и ночь · затем параллельно T16 карта от руки и T17 анимация · затем T18 адаптив и Playwright | 1 → 2 → 1 | Волна 4 |

**Правило единственного владельца.** Каждый файл создаёт ровно одна задача. Task 1 создаёт заглушку каждого экрана (`src/ui/screens/<name>/<Name>Screen.tsx`) и `LogbookDrawer`. Задача экрана **заменяет** только свою заглушку и создаёт файлы в своей папке. Общие файлы Task 1 (`App.tsx`, `registry.ts`, `session/*`, `tokens.css`, `global.css`) правит только координатор, кроме явно указанных правок в Волне 5.

**Тесты экранов** не ждут соседей. Хелпер `renderShell(game)` (Task 1) монтирует оболочку с готовым `GameState` нужной фазы (`gameAt(phase)` строит его через движок и стратегию `expert`). После действия тест проверяет `currentScreen()` — `data-screen` следующего экрана, пусть даже это ещё заглушка.

## Структура файлов

```
skipper-simulator/
├── index.html, vite.config.ts                     # T1
├── src/engine/preview.ts                          # T2  предпросмотр плана дня (новый модуль движка)
├── src/ui/
│   ├── main.tsx, App.tsx, content.ts              # T1  точка входа, Shell, загрузка контента
│   ├── i18n/{t.ts, common.ts, glossary.ts}        # T1
│   ├── session/{types.ts, reducer.ts, screen.ts, save.ts, SessionContext.tsx}   # T1
│   ├── scenes/manifest.ts                         # T1  заменяемый слой иллюстраций (пустой)
│   ├── styles/{tokens.css, global.css}            # T1 (+T15 день/ночь, +T17 движение, +T18 адаптив)
│   ├── theme/daytime.ts                           # T15
│   ├── view/{format.ts, resources.ts, logbook.ts, map.ts, strings.ts}            # T3
│   ├── components/
│   │   ├── Button, ScreenFrame, ErrorBanner, SceneArt (+ .module.css)            # T1
│   │   ├── ResourcePanel.tsx                      # T3
│   │   ├── voices/{VoiceBadge, VoiceLine, icons}.tsx, Typewriter.tsx, WindRose.tsx, motion.ts   # T4
│   │   ├── chart/{ChartMap.tsx, symbols.tsx}      # T8  (+ T16 decor.tsx)
│   │   └── logbook/LogbookDrawer.tsx              # T1 заглушка → T11
│   └── screens/
│       ├── registry.ts, ContentErrorScreen.tsx    # T1
│       ├── menu/        # T5      ├── captain/, boat/      # T6     ├── checkin/, briefing/   # T7
│       ├── morning/, evening/, return/            # T9      ├── event/ (Event + Outcome)    # T10
│       ├── debrief/     # T11     ├── planning/   # T12     ├── maneuvers/, passage/       # T13
└── tests/ui/   setup.ts, fixtures.ts, render.tsx (T1) + тесты каждой задачи; tests-e2e/ (T18)
```

## Контракты UI (общие для всех задач)

**Экраны** (`Screen` в `src/ui/session/types.ts`): `menu | captain | boat | checkin | briefing | morning | planning | maneuvers | passage | event | outcome | evening | return | debrief`.

**Как `screenFor(session)` выбирает экран** (по приоритету):
1. Нет игры → `menu`.
2. `ui.outcome` → `outcome`: итог только что сделанного выбора в событии.
3. Фаза `evening` и `ui.passageDay === game.day` → `passage`: сводка перехода до событий перехода.
4. `game.eventQueue` не пуста → `event`.
5. Фаза `planning`: если `ui.draftPlan` → `maneuvers`, иначе `planning`.
6. Иначе экран по фазе: `captain→captain`, `boat_select→boat`, `checkin→checkin`, `briefing→briefing`, `morning→morning`, `evening→evening`, `return→return`, `debrief→debrief`.

**Действия** (`Action`) и вызов движка за каждым:

| Действие | Что делает |
|---|---|
| `new_game {seed}` | `newGame(content, {seed, lang: session.lang})` |
| `load {game}` | Берёт состояние из сохранения. |
| `to_menu` | Выход в меню (состояние на диске не трогает). |
| `set_lang {lang}` | `session.lang` и `game.lang`. |
| `assign_voices {alloc}` | `assignVoices` |
| `choose_boat {boatId}` | `chooseBoat` |
| `checkin {checkpoints}` | `performCheckin` |
| `briefing {topicIds, dialogueIds}` | `performBriefing` |
| `start_day {choice}` | `startDay` |
| `draft_plan {plan}` | `validatePlan`. Без участков сразу `planDay`, иначе `ui.draftPlan = plan` (экран манёвров). |
| `cancel_draft` | Назад из манёвров в планировщик. |
| `commit_plan {orders}` | `planDay({...draftPlan, maneuverOrders: orders})`, затем `ui.passageDay = day` и `ui.lastOrders` дополняется. |
| `passage_seen` | Закрывает сводку перехода. |
| `resolve_event {optionId}` | `resolvePendingEvent`, затем `ui.outcome = {eventId, optionId, entries: новые записи лога}`. |
| `outcome_seen` | Закрывает итог выбора. |
| `end_day {choice}` | `endDay` |
| `finish_week` | `finishWeek` |
| `dismiss_error` | Убирает баннер ошибки. |

Любое действие может нести `key`. Если `key !== screenKey(session)`, редьюсер возвращает сессию без изменений: это защита от двойного клика. `EngineError` превращается в `session.error = message`, а `game` не меняется.

**Ключ экрана:** `screenKey(s) = "<screen>:<day>:<eventQueue[0]>:<log.length>"`. Оболочка рендерит текущий экран с этим `key`, поэтому локальное состояние формы сбрасывается при каждом шаге движка.

---
### Task 1: Каркас UI — Vite, React, сессия, сохранение, i18n, оболочка, заглушки экранов, токены

**Files:**
- Modify: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `vite.config.ts`, `index.html`
- Create: `src/ui/main.tsx`, `src/ui/App.tsx`, `src/ui/content.ts`
- Create: `src/ui/i18n/t.ts`, `src/ui/i18n/common.ts`, `src/ui/i18n/glossary.ts`
- Create: `src/ui/session/types.ts`, `src/ui/session/reducer.ts`, `src/ui/session/screen.ts`, `src/ui/session/save.ts`, `src/ui/session/SessionContext.tsx`
- Create: `src/ui/scenes/manifest.ts`
- Create: `src/ui/components/{Button,ScreenFrame,ErrorBanner,SceneArt}.tsx` + `{Button,ScreenFrame,ErrorBanner,SceneArt}.module.css`, `src/ui/components/logbook/LogbookDrawer.tsx`
- Create: `src/ui/screens/registry.ts`, `src/ui/screens/ContentErrorScreen.tsx` и 14 заглушек экранов (список в Step 9)
- Create: `src/ui/styles/tokens.css`, `src/ui/styles/global.css`
- Test: `tests/ui/setup.ts`, `tests/ui/fixtures.ts`, `tests/ui/render.tsx`, `tests/ui/session/reducer.test.ts`, `tests/ui/session/save.test.ts`, `tests/ui/i18n.test.ts`, `tests/ui/boundaries.test.ts`, `tests/ui/shell.test.tsx`

**Interfaces:**
- Consumes (движок Этапа 1, `src/engine/index.ts`): `newGame, assignVoices, chooseBoat, performCheckin, performBriefing, startDay, validatePlan, planDay, resolvePendingEvent, endDay, finishWeek, EngineError` и типы `Content, GameState, Lang, LocalizedText, Phase, DayPlan, MorningChoice, EveningChoice, CheckpointId, TrainableVoice, ManeuverKind, LogEntry, VoiceId, Pillar, PointKind`. `parseContent, formatErrors, ContentError, ParseResult` из `src/content/parse.ts`. `setupWeek, drainEvents, playDay` из `src/sim/run.ts` и `expert` из `src/sim/strategies.ts` (только в тестах).
- Produces:
  - `Screen`, `Action`, `Session`, `UiState`, `EventOutcome`, `ManeuverOrders` (`session/types.ts`)
  - `sessionReducer(s, a): Session`, `initialSession(content, lang, game?)`, `emptyUi()` (`session/reducer.ts`)
  - `screenFor(s): Screen`, `screenKey(s): string` (`session/screen.ts`)
  - `SAVE_KEY`, `LANG_KEY`, `readSave(storage, content): SaveRead`, `writeSave(storage, game, now): boolean`, `clearSave(storage)`, `readLangPref(storage)`, `writeLangPref(storage, lang)`, `shouldAutosave(prev, next)`, `memoryStorage()`, `browserStorage()` (`session/save.ts`)
  - `SessionProvider`, `useSession()`, `useGame()`, `useLang()`, `useT(dict)`, `useAct()` (`session/SessionContext.tsx`)
  - `Dict<K>`, `dict()`, `fmt()`, `makeT()`, `TFn<K>` (`i18n/t.ts`); `COMMON` (`i18n/common.ts`); `VOICE_NAMES, VOICE_HINTS, PILLAR_NAMES, CHECKPOINT_NAMES, POINT_KIND_NAMES, DAMAGE_NAMES, SCENE_TITLES, label()` (`i18n/glossary.ts`)
  - `Button`, `ScreenFrame`, `ErrorBanner`, `SceneArt`, `sceneMood()` (`components/*`), `SCENE_IMAGES` (`scenes/manifest.ts`)
  - `Shell`, `App` (`App.tsx`), `SCREENS` (`screens/registry.ts`), `loadBundledContent()` (`content.ts`)
  - Тестовые хелперы: `content`, `gameAt(phase, seed?)`, `withEvent(game, eventId)` (`tests/ui/fixtures.ts`); `renderShell(game, opts?) → { user, storage, currentScreen(), session(), dispatch(), ...RTL }`, `renderWithSession(node, game?, lang?) → { user, ...RTL }` (`tests/ui/render.tsx`)

- [ ] **Step 1: Установить зависимости и настроить сборку**

```bash
npm i react@^19.1.0 react-dom@^19.1.0 @fontsource/pt-serif@^5 @fontsource/jetbrains-mono@^5 @fontsource/caveat@^5
npm i -D vite@^5.4.0 @vitejs/plugin-react@^4.3.0 @types/react@^19 @types/react-dom@^19 jsdom@^25 @testing-library/react@^16 @testing-library/dom@^10 @testing-library/user-event@^14 @testing-library/jest-dom@^6
```

В `package.json` раздел `scripts` целиком:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "typecheck": "tsc --noEmit",
  "validate-content": "tsx scripts/validate-content.ts",
  "simulate": "tsx scripts/simulate.ts"
}
```

`tsconfig.json`, добавить в `compilerOptions` (остальное не трогать):

```json
"jsx": "react-jsx",
"lib": ["ES2022", "DOM", "DOM.Iterable"],
"types": ["node", "vite/client"]
```

`vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// base './' so the build works from any static path (GitHub Pages, Netlify).
export default defineConfig({ plugins: [react()], base: './' });
```

`vitest.config.ts` (заменить целиком):

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environmentMatchGlobs: [['tests/ui/**', 'jsdom']],
    setupFiles: ['tests/ui/setup.ts'],
  },
});
```

`.gitignore`, добавить строки `dist/`, `test-results/`, `playwright-report/`.

`index.html`:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#1d4e6b" />
    <title>Симулятор шкипера · Skipper Simulator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/ui/main.tsx"></script>
  </body>
</html>
```

`tests/ui/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
```

Run: `npm test`
Expected: 172 теста Этапа 1 проходят (новых тестов ещё нет).

- [ ] **Step 2: Написать падающие тесты i18n и границ модулей**

`tests/ui/i18n.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { LocalizedText } from '../../src/engine';
import { fmt, makeT } from '../../src/ui/i18n/t';

type AnyDict = Record<string, LocalizedText | Record<string, LocalizedText>>;
const modules = import.meta.glob<Record<string, unknown>>(
  ['../../src/ui/**/strings.ts', '../../src/ui/i18n/common.ts', '../../src/ui/i18n/glossary.ts'],
  { eager: true },
);

const isText = (v: unknown): v is LocalizedText =>
  typeof v === 'object' && v !== null && 'ru' in v && 'en' in v;

function* texts(value: unknown, path: string): Generator<[string, LocalizedText]> {
  if (isText(value)) { yield [path, value]; return; }
  if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) yield* texts(v, `${path}.${k}`);
  }
}

describe('i18n', () => {
  it('every UI string has non-empty ru and en', () => {
    const problems: string[] = [];
    let count = 0;
    for (const [file, mod] of Object.entries(modules)) {
      for (const [name, value] of Object.entries(mod as AnyDict)) {
        if (typeof value !== 'object') continue;
        for (const [path, t] of texts(value, `${file}:${name}`)) {
          count++;
          if (!t.ru.trim() || !t.en.trim()) problems.push(path);
          const ruVars = (t.ru.match(/\{\w+\}/g) ?? []).sort().join();
          const enVars = (t.en.match(/\{\w+\}/g) ?? []).sort().join();
          if (ruVars !== enVars) problems.push(`${path}: placeholders differ (${ruVars} vs ${enVars})`);
        }
      }
    }
    expect(count).toBeGreaterThan(20);
    expect(problems).toEqual([]);
  });

  it('fmt fills placeholders and keeps unknown ones visible', () => {
    expect(fmt('День {n} из {total}', { n: 2, total: 6 })).toBe('День 2 из 6');
    expect(fmt('Hi {who}', {})).toBe('Hi {who}');
  });

  it('makeT picks the language', () => {
    const t = makeT({ hello: { ru: 'Привет, {name}', en: 'Hello, {name}' } }, 'en');
    expect(t('hello', { name: 'Max' })).toBe('Hello, Max');
  });
});
```

`tests/ui/boundaries.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe('module boundaries', () => {
  it('UI imports the engine only through src/engine/index.ts', () => {
    const offenders = files('src/ui').filter((f) => /from '(\.\.\/)+engine\/(?!index')/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('UI imports content only through src/content/parse.ts', () => {
    const offenders = files('src/ui').filter((f) => /from '(\.\.\/)+content\/(?!parse')/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('engine stays free of DOM, React and storage', () => {
    const banned = /from 'react|document\.|window\.|localStorage|Math\.random|new Date|Date\.now/;
    const offenders = files('src/engine').filter((f) => banned.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
```

Run: `npx vitest run tests/ui/i18n.test.ts tests/ui/boundaries.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/ui/i18n/t"`.

- [ ] **Step 3: i18n — функции, общие строки, глоссарий**

`src/ui/i18n/t.ts`:

```ts
import type { Lang, LocalizedText } from '../../engine';

export type Dict<K extends string> = Readonly<Record<K, LocalizedText>>;
export type Vars = Readonly<Record<string, string | number>>;
export type TFn<K extends string> = (key: K, vars?: Vars) => string;

/** Identity helper that keeps literal keys: `const S = dict({ a: {...} })`. */
export const dict = <K extends string>(d: Dict<K>): Dict<K> => d;

/** `{name}` placeholders; unknown placeholders stay visible so a typo shows on screen. */
export function fmt(template: string, vars: Vars = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function makeT<K extends string>(d: Dict<K>, lang: Lang): TFn<K> {
  return (key, vars) => fmt(d[key][lang], vars);
}
```

`src/ui/i18n/common.ts`:

```ts
import { dict } from './t';

export const COMMON = dict({
  appTitle: { ru: 'Симулятор шкипера', en: 'Skipper Simulator' },
  next: { ru: 'Дальше', en: 'Next' },
  back: { ru: 'Назад', en: 'Back' },
  confirm: { ru: 'Подтвердить', en: 'Confirm' },
  day: { ru: 'День {n}', en: 'Day {n}' },
  dayOf: { ru: 'День {n} из {total}', en: 'Day {n} of {total}' },
  errorPrefix: { ru: 'Не получилось: {message}', en: 'That did not work: {message}' },
  dismiss: { ru: 'Закрыть', en: 'Dismiss' },
  logbook: { ru: 'Бортжурнал', en: 'Logbook' },
  menu: { ru: 'В меню', en: 'Menu' },
  stub: { ru: 'Экран в разработке', en: 'Screen under construction' },
  hours: { ru: '{n} ч', en: '{n} h' },
  minutes: { ru: '{n} мин', en: '{n} min' },
  knots: { ru: '{n} уз', en: '{n} kn' },
  miles: { ru: '{n} миль', en: '{n} nm' },
  euro: { ru: '{n} €', en: '€{n}' },
});
```

`src/ui/i18n/glossary.ts`:

```ts
import type { CheckpointId, Lang, LocalizedText, Pillar, PointKind, VoiceId } from '../../engine';

const t = (ru: string, en: string): LocalizedText => ({ ru, en });

export const VOICE_NAMES: Readonly<Record<VoiceId, LocalizedText>> = {
  sea_sense: t('Морское чутьё', 'Sea Sense'),
  caution: t('Осторожность', 'Caution'),
  order: t('Порядок', 'Order'),
  mechanic: t('Механик', 'Mechanic'),
  diplomat: t('Дипломат', 'Diplomat'),
  economist: t('Экономист', 'Economist'),
  pride: t('Гордость', 'Pride'),
  crew_voice: t('Голос экипажа', "Crew's Voice"),
};

export const VOICE_HINTS: Readonly<Record<VoiceId, LocalizedText>> = {
  sea_sense: t('Читает погоду, барометр и защищённость бухт. Видит скрытые признаки фронта.', 'Reads weather, the barometer and how sheltered a bay is. Spots hidden signs of a front.'),
  caution: t('Призывает рифиться, ждать и проверять. Снижает риск, но тянет время.', 'Urges you to reef, wait and double-check. Lowers risk but costs time.'),
  order: t('Требует дисциплины команд и безопасности. Помогает на швартовках и якоре.', 'Demands clear commands and safety. Helps at moorings and anchoring.'),
  mechanic: t('Понимает электрику, воду и двигатель. Даёт точные цифры вместо «примерно».', 'Knows the electrics, water and engine. Gives exact numbers instead of rough guesses.'),
  diplomat: t('Знает, как говорить с экипажем и маринерами. Смягчает сорванные ожидания.', 'Knows how to talk to the crew and marineros. Softens broken expectations.'),
  economist: t('«Марина дорогая, бухта бесплатно». Ложный голос, иногда прав.', '"Marinas are pricey, bays are free." A false voice that is sometimes right.'),
  pride: t('«Не позорься перед экипажем». Ложный голос: толкает к риску.', '"Don\'t embarrass yourself in front of the crew." A false voice that pushes you to take risks.'),
  crew_voice: t('Желания гостей: пляж, таверна, ранний выход. Отражает настроение.', 'What the guests want: beach, taverna, an early start. Mirrors their mood.'),
};

export const PILLAR_NAMES: Readonly<Record<Pillar, LocalizedText>> = {
  weather: t('Погода', 'Weather'),
  time: t('Время', 'Time'),
  briefing: t('Брифинг', 'Briefing'),
  promises: t('Ожидания', 'Expectations'),
  safety: t('Безопасность', 'Safety'),
  boat: t('Лодка и ресурсы', 'Boat & resources'),
};

export const CHECKPOINT_NAMES: Readonly<Record<CheckpointId, LocalizedText>> = {
  anchor: t('Якорь и цепь', 'Anchor and chain'),
  impeller: t('Импеллер', 'Impeller'),
  gas: t('Газ', 'Gas'),
  toilets: t('Гальюны', 'Heads'),
  sails: t('Паруса', 'Sails'),
  electrics: t('Схема электрики', 'Wiring diagram'),
  damage_photos: t('Фото повреждений', 'Damage photos'),
};

export const POINT_KIND_NAMES: Readonly<Record<PointKind, LocalizedText>> = {
  base: t('База', 'Base'),
  marina: t('Марина', 'Marina'),
  bay: t('Бухта', 'Bay'),
  quay: t('Городской причал', 'Town quay'),
};

/** Damage ids from balance.deposit.damageCostEur. Unknown ids fall back to the id itself. */
export const DAMAGE_NAMES: Readonly<Record<string, LocalizedText>> = {
  sail_torn: t('Порван парус', 'Torn sail'),
  toilet_broken: t('Сломан гальюн', 'Broken head'),
  prop_line: t('Конец на винте', 'Line round the prop'),
  hull_scratch: t('Царапина на корпусе', 'Scratched hull'),
  impeller: t('Сгорел импеллер', 'Burnt-out impeller'),
  anchor_lost: t('Потерян якорь', 'Lost anchor'),
};

/** Scene ids from events.json plus `marina_dawn` for the main menu. */
export const SCENE_TITLES: Readonly<Record<string, LocalizedText>> = {
  marina_dawn: t('Марина на рассвете', 'Marina at dawn'),
  anchorage_day: t('Стоянка на якоре, день', 'At anchor, daytime'),
  anchorage_night: t('Стоянка на якоре, ночь', 'At anchor, night'),
  anchorage_sunset: t('Закат на якоре', 'Sunset at anchor'),
  bay_lunch: t('Обед в бухте', 'Lunch in the bay'),
  bow_anchor: t('На баке у якоря', 'At the bow anchor'),
  cabin_day: t('Каюта днём', 'Cabin by day'),
  cabin_night: t('Каюта ночью', 'Cabin at night'),
  cockpit_morning: t('Кокпит утром', 'Cockpit in the morning'),
  deck_spray: t('Брызги на палубе', 'Spray on deck'),
  deck_squall: t('Шквал', 'Squall'),
  deck_winch: t('У лебёдки', 'At the winch'),
  deck_wind: t('Ветер на палубе', 'Wind on deck'),
  dusk_harbour: t('Гавань в сумерках', 'Harbour at dusk'),
  engine_bay: t('Моторный отсек', 'Engine bay'),
  fuel_dock: t('Заправочный причал', 'Fuel dock'),
  galley: t('Камбуз', 'Galley'),
  marina_berth: t('Место в марине', 'Marina berth'),
  marina_entrance: t('Вход в марину', 'Marina entrance'),
  quay_morning: t('Причал утром', 'Quay in the morning'),
};

/** Glossary lookup with a visible fallback for ids the glossary does not know yet. */
export function label(table: Readonly<Record<string, LocalizedText>>, id: string, lang: Lang): string {
  return table[id]?.[lang] ?? id.replace(/_/g, ' ');
}
```

- [ ] **Step 4: Запустить тесты i18n и границ**

Run: `npx vitest run tests/ui/i18n.test.ts tests/ui/boundaries.test.ts`
Expected: PASS (3 + 3).

- [ ] **Step 5: Написать падающие тесты редьюсера и сохранения**

`tests/ui/fixtures.ts`:

```ts
import {
  assignVoices, chooseBoat, finishWeek, newGame, performBriefing, performCheckin, planDay, startDay,
  type Content, type GameState, type Phase,
} from '../../src/engine';
import { drainEvents, playDay } from '../../src/sim/run';
import { expert } from '../../src/sim/strategies';
import { loadBundledContent } from '../../src/ui/content';

const loaded = loadBundledContent();
if (!loaded.content) throw new Error('Bundled content is invalid');
export const content: Content = loaded.content;

/** A real GameState in the requested phase, built through the engine with the expert strategy. */
export function gameAt(phase: Phase, seed = 42): GameState {
  let s = newGame(content, { seed, lang: 'ru' });
  if (phase === 'captain') return s;
  s = assignVoices(s, content, expert.voices);
  if (phase === 'boat_select') return s;
  s = chooseBoat(s, content, expert.boatId);
  if (phase === 'checkin') return s;
  s = performCheckin(s, content, expert.checkpoints);
  if (phase === 'briefing') return s;
  s = performBriefing(s, content, expert.briefingTopics, expert.briefingDialogues);
  if (phase === 'morning') return s;
  if (phase === 'planning') return drainEvents(startDay(s, content, expert.morning(s, content)), content, expert);
  if (phase === 'evening') {
    const planning = drainEvents(startDay(s, content, expert.morning(s, content)), content, expert);
    return drainEvents(planDay(planning, content, expert.plan(planning, content)), content, expert);
  }
  while (s.phase === 'morning') s = playDay(s, content, expert);
  return phase === 'return' ? s : finishWeek(s, content);
}

/** Puts an event at the head of the queue, as the engine does when it fires. */
export function withEvent(game: GameState, eventId: string): GameState {
  return { ...game, eventQueue: [eventId, ...game.eventQueue], firedEvents: [...game.firedEvents, eventId] };
}
```

`tests/ui/session/reducer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { expert } from '../../../src/sim/strategies';
import { initialSession, sessionReducer } from '../../../src/ui/session/reducer';
import { screenFor, screenKey } from '../../../src/ui/session/screen';
import type { Action, Session } from '../../../src/ui/session/types';
import { content, gameAt, withEvent } from '../fixtures';

const run = (s: Session, ...actions: Action[]): Session => actions.reduce(sessionReducer, s);
const withGame = (phase: Parameters<typeof gameAt>[0]): Session => initialSession(content, 'ru', gameAt(phase));

describe('sessionReducer', () => {
  it('walks the setup phases to the first morning', () => {
    const s = run(
      initialSession(content, 'ru'),
      { type: 'new_game', seed: 7 },
      { type: 'assign_voices', alloc: expert.voices },
      { type: 'choose_boat', boatId: expert.boatId },
      { type: 'checkin', checkpoints: expert.checkpoints },
      { type: 'briefing', topicIds: expert.briefingTopics, dialogueIds: [] },
    );
    expect(s.error).toBeNull();
    expect(s.game?.day).toBe(1);
    expect(screenFor(s)).toBe('morning');
  });

  it('turns EngineError into session.error and keeps the game', () => {
    const before = run(initialSession(content, 'ru'), { type: 'new_game', seed: 7 });
    const after = sessionReducer(before, { type: 'assign_voices', alloc: { sea_sense: 4 } });
    expect(after.game).toBe(before.game);
    expect(after.error).toMatch(/sum must be/);
    expect(sessionReducer(after, { type: 'dismiss_error' }).error).toBeNull();
  });

  it('a stay-in-place plan commits at once and skips the passage screen', () => {
    const s = sessionReducer(withGame('planning'), {
      type: 'draft_plan',
      plan: { departureHour: 9, legs: [], swimStops: 0, shower: 'normal', autopilot: false },
    });
    expect(s.game?.phase).toBe('evening');
    expect(s.ui.passageDay).toBeNull();
    expect(['evening', 'event']).toContain(screenFor(s));
  });

  it('a sailing plan goes through maneuvers, then the passage summary', () => {
    const start = withGame('planning');
    const plan = expert.plan(start.game!, content);
    const drafted = sessionReducer(start, { type: 'draft_plan', plan });
    expect(screenFor(drafted)).toBe('maneuvers');
    const back = sessionReducer(drafted, { type: 'cancel_draft' });
    expect(screenFor(back)).toBe('planning');
    const committed = sessionReducer(drafted, { type: 'commit_plan', orders: {} });
    expect(committed.game?.phase).toBe('evening');
    expect(screenFor(committed)).toBe('passage');
    expect(screenFor(sessionReducer(committed, { type: 'passage_seen' }))).not.toBe('passage');
  });

  it('resolving an event shows its outcome with the new log entries', () => {
    const ev = content.events.find((e) => e.trigger.phase === 'evening' && e.options.some((o) => !o.requires))!;
    const option = ev.options.find((o) => !o.requires)!;
    const start = initialSession(content, 'ru', withEvent(gameAt('evening'), ev.id));
    expect(screenFor(start)).toBe('event');
    const s = sessionReducer(start, { type: 'resolve_event', optionId: option.id });
    expect(screenFor(s)).toBe('outcome');
    expect(s.ui.outcome).toMatchObject({ eventId: ev.id, optionId: option.id });
    expect(s.ui.outcome!.entries.some((e) => e.cause === `choice:${ev.id}:${option.id}`)).toBe(true);
    expect(screenFor(sessionReducer(s, { type: 'outcome_seen' }))).toBe('evening');
  });

  it('ignores an action tagged with a stale screen key (double click)', () => {
    const ev = content.events.find((e) => e.trigger.phase === 'evening' && e.options.some((o) => !o.requires))!;
    const option = ev.options.find((o) => !o.requires)!;
    const start = initialSession(content, 'ru', withEvent(gameAt('evening'), ev.id));
    const key = screenKey(start);
    const once = sessionReducer(start, { type: 'resolve_event', optionId: option.id, key });
    const twice = sessionReducer(once, { type: 'resolve_event', optionId: option.id, key });
    expect(twice).toBe(once);
  });

  it('set_lang switches both the session and the running game', () => {
    const s = sessionReducer(withGame('morning'), { type: 'set_lang', lang: 'en' });
    expect(s.lang).toBe('en');
    expect(s.game?.lang).toBe('en');
  });

  it('screen priority: outcome > passage > event > phase', () => {
    const base = withGame('evening');
    const ev = content.events.find((e) => e.trigger.phase === 'evening')!;
    const queued: Session = { ...base, game: withEvent(base.game!, ev.id) };
    expect(screenFor(queued)).toBe('event');
    const passage: Session = { ...queued, ui: { ...queued.ui, passageDay: queued.game!.day } };
    expect(screenFor(passage)).toBe('passage');
    const outcome: Session = { ...passage, ui: { ...passage.ui, outcome: { eventId: ev.id, optionId: 'x', entries: [] } } };
    expect(screenFor(outcome)).toBe('outcome');
    expect(screenFor(initialSession(content, 'ru'))).toBe('menu');
  });

  it('to_menu drops the game, load restores it with its language', () => {
    const s = withGame('morning');
    const menu = sessionReducer(s, { type: 'to_menu' });
    expect(screenFor(menu)).toBe('menu');
    const loaded = sessionReducer(menu, { type: 'load', game: { ...s.game!, lang: 'en' } });
    expect(loaded.lang).toBe('en');
    expect(screenFor(loaded)).toBe('morning');
  });
});
```

`tests/ui/session/save.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  clearSave, memoryStorage, readLangPref, readSave, SAVE_KEY, shouldAutosave, writeLangPref, writeSave,
} from '../../../src/ui/session/save';
import { content, gameAt } from '../fixtures';

const NOW = new Date('2026-10-19T10:00:00Z');

describe('save slot', () => {
  it('round-trips a game through storage', () => {
    const storage = memoryStorage();
    const game = gameAt('morning');
    expect(writeSave(storage, game, NOW)).toBe(true);
    const r = readSave(storage, content);
    expect(r).toEqual({ kind: 'ok', savedAt: NOW.toISOString(), game });
  });

  it('reports none, corrupt JSON, wrong version and dangling references', () => {
    const storage = memoryStorage();
    expect(readSave(storage, content).kind).toBe('none');
    storage.setItem(SAVE_KEY, '{not json');
    expect(readSave(storage, content).kind).toBe('corrupt');
    const game = gameAt('morning');
    storage.setItem(SAVE_KEY, JSON.stringify({ savedAt: 'x', game: { ...game, version: 2 } }));
    expect(readSave(storage, content).kind).toBe('corrupt');
    storage.setItem(SAVE_KEY, JSON.stringify({ savedAt: 'x', game: { ...game, boatId: 'ghost_boat' } }));
    expect(readSave(storage, content).kind).toBe('corrupt');
    clearSave(storage);
    expect(readSave(storage, content).kind).toBe('none');
  });

  it('survives storage that throws (private mode, quota)', () => {
    const broken = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceeded'); }, getItem: () => { throw new Error('denied'); } } as Storage;
    expect(writeSave(broken, gameAt('morning'), NOW)).toBe(false);
    expect(readSave(broken, content).kind).toBe('none');
    expect(readSave(null, content).kind).toBe('none');
    expect(() => writeLangPref(broken, 'en')).not.toThrow();
  });

  it('remembers the language preference', () => {
    const storage = memoryStorage();
    expect(readLangPref(storage)).toBeNull();
    writeLangPref(storage, 'en');
    expect(readLangPref(storage)).toBe('en');
  });

  it('autosaves once at the start of each day', () => {
    const morning = gameAt('morning');
    const planning = gameAt('planning');
    expect(shouldAutosave(gameAt('briefing'), morning)).toBe(true);
    expect(shouldAutosave(morning, morning)).toBe(false);
    expect(shouldAutosave(morning, { ...morning, day: 2 })).toBe(true);
    expect(shouldAutosave(morning, planning)).toBe(false);
    expect(shouldAutosave(morning, null)).toBe(false);
  });
});
```

Run: `npx vitest run tests/ui/session`
Expected: FAIL — `Failed to resolve import "../../../src/ui/session/reducer"`.

- [ ] **Step 6: Загрузка контента и типы сессии**

`src/ui/content.ts`:

```ts
import balance from '../../content/balance.json';
import boats from '../../content/boats.json';
import briefing from '../../content/briefing.json';
import crew from '../../content/crew.json';
import debrief from '../../content/debrief.json';
import dialogues from '../../content/dialogues.json';
import events from '../../content/events.json';
import maneuvers from '../../content/maneuvers.json';
import map from '../../content/map.json';
import routes from '../../content/routes.json';
import weather from '../../content/weather.json';
import { parseContent, type ParseResult } from '../content/parse';

/** Content bundled by Vite at build time and validated on start (ТЗ 5.3). */
export function loadBundledContent(): ParseResult {
  return parseContent({ boats, map, routes, weather, crew, briefing, events, dialogues, debrief, maneuvers, balance });
}
```

`src/ui/session/types.ts`:

```ts
import type {
  CheckpointId, Content, DayPlan, EveningChoice, GameState, Lang, LogEntry, ManeuverKind, MorningChoice, TrainableVoice,
} from '../../engine';

export type Screen =
  | 'menu' | 'captain' | 'boat' | 'checkin' | 'briefing' | 'morning' | 'planning' | 'maneuvers'
  | 'passage' | 'event' | 'outcome' | 'evening' | 'return' | 'debrief';

export type ManeuverOrders = Partial<Record<ManeuverKind, string[]>>;

/** What the last event choice did: the log entries it appended. */
export interface EventOutcome { eventId: string; optionId: string; entries: LogEntry[] }

/** UI-only steps that the engine does not model. */
export interface UiState {
  draftPlan: DayPlan | null;
  passageDay: number | null;
  outcome: EventOutcome | null;
  lastOrders: ManeuverOrders;
}

export interface Session {
  content: Content;
  lang: Lang;
  game: GameState | null;
  ui: UiState;
  error: string | null;
}

export type ActionBody =
  | { type: 'new_game'; seed: number }
  | { type: 'load'; game: GameState }
  | { type: 'to_menu' }
  | { type: 'set_lang'; lang: Lang }
  | { type: 'assign_voices'; alloc: Partial<Record<TrainableVoice, number>> }
  | { type: 'choose_boat'; boatId: string }
  | { type: 'checkin'; checkpoints: CheckpointId[] }
  | { type: 'briefing'; topicIds: string[]; dialogueIds: string[] }
  | { type: 'start_day'; choice: MorningChoice }
  | { type: 'draft_plan'; plan: DayPlan }
  | { type: 'cancel_draft' }
  | { type: 'commit_plan'; orders: ManeuverOrders }
  | { type: 'passage_seen' }
  | { type: 'resolve_event'; optionId: string }
  | { type: 'outcome_seen' }
  | { type: 'end_day'; choice: EveningChoice }
  | { type: 'finish_week' }
  | { type: 'dismiss_error' };

/** `key` = screenKey at the moment the button was rendered; stale keys are ignored. */
export type Action = ActionBody & { key?: string };
```

- [ ] **Step 7: Редьюсер, выбор экрана, сохранение**

`src/ui/session/screen.ts`:

```ts
import type { Phase } from '../../engine';
import type { Screen, Session } from './types';

const PHASE_SCREEN: Record<Exclude<Phase, 'planning'>, Screen> = {
  captain: 'captain',
  boat_select: 'boat',
  checkin: 'checkin',
  briefing: 'briefing',
  morning: 'morning',
  evening: 'evening',
  return: 'return',
  debrief: 'debrief',
};

export function screenFor(s: Session): Screen {
  const g = s.game;
  if (!g) return 'menu';
  if (s.ui.outcome) return 'outcome';
  if (g.phase === 'evening' && s.ui.passageDay === g.day) return 'passage';
  if (g.eventQueue.length > 0) return 'event';
  if (g.phase === 'planning') return s.ui.draftPlan ? 'maneuvers' : 'planning';
  return PHASE_SCREEN[g.phase];
}

/** Changes on every engine step, so screens remount with fresh local state. */
export function screenKey(s: Session): string {
  const g = s.game;
  return [screenFor(s), g?.day ?? 0, g?.eventQueue[0] ?? '', g?.log.length ?? 0, s.ui.draftPlan ? 'd' : ''].join(':');
}
```

`src/ui/session/reducer.ts`:

```ts
import {
  assignVoices, chooseBoat, endDay, EngineError, finishWeek, newGame, performBriefing, performCheckin, planDay,
  resolvePendingEvent, startDay, validatePlan, type Content, type DayPlan, type GameState, type Lang,
} from '../../engine';
import { screenKey } from './screen';
import type { Action, ManeuverOrders, Session, UiState } from './types';

export const emptyUi = (): UiState => ({ draftPlan: null, passageDay: null, outcome: null, lastOrders: {} });

export function initialSession(content: Content, lang: Lang, game: GameState | null = null): Session {
  return { content, lang: game?.lang ?? lang, game, ui: emptyUi(), error: null };
}

function requireGame(s: Session): GameState {
  if (!s.game) throw new EngineError('WRONG_PHASE', 'No game in progress');
  return s.game;
}

function commitPlan(s: Session, game: GameState, plan: DayPlan, orders: ManeuverOrders): Session {
  const next = planDay(game, s.content, { ...plan, maneuverOrders: orders });
  return {
    ...s,
    game: next,
    error: null,
    ui: { ...s.ui, draftPlan: null, passageDay: plan.legs.length > 0 ? next.day : null, lastOrders: { ...s.ui.lastOrders, ...orders } },
  };
}

function resolveEvent(s: Session, optionId: string): Session {
  const g = requireGame(s);
  const eventId = g.eventQueue[0] ?? '';
  const next = resolvePendingEvent(g, s.content, optionId);
  return { ...s, game: next, error: null, ui: { ...s.ui, outcome: { eventId, optionId, entries: next.log.slice(g.log.length) } } };
}

function reduce(s: Session, a: Action): Session {
  const c = s.content;
  const step = (game: GameState): Session => ({ ...s, game, error: null });
  switch (a.type) {
    case 'new_game': return { ...s, game: newGame(c, { seed: a.seed, lang: s.lang }), ui: emptyUi(), error: null };
    case 'load': return initialSession(c, a.game.lang, a.game);
    case 'to_menu': return { ...s, game: null, ui: emptyUi(), error: null };
    case 'set_lang': return { ...s, lang: a.lang, game: s.game && { ...s.game, lang: a.lang } };
    case 'assign_voices': return step(assignVoices(requireGame(s), c, a.alloc));
    case 'choose_boat': return step(chooseBoat(requireGame(s), c, a.boatId));
    case 'checkin': return step(performCheckin(requireGame(s), c, a.checkpoints));
    case 'briefing': return step(performBriefing(requireGame(s), c, a.topicIds, a.dialogueIds));
    case 'start_day': return step(startDay(requireGame(s), c, a.choice));
    case 'draft_plan': {
      const g = requireGame(s);
      validatePlan(g, c, a.plan);
      return a.plan.legs.length === 0 ? commitPlan(s, g, a.plan, {}) : { ...s, error: null, ui: { ...s.ui, draftPlan: a.plan } };
    }
    case 'cancel_draft': return { ...s, ui: { ...s.ui, draftPlan: null } };
    case 'commit_plan': {
      if (!s.ui.draftPlan) throw new EngineError('WRONG_PHASE', 'No plan to commit');
      return commitPlan(s, requireGame(s), s.ui.draftPlan, a.orders);
    }
    case 'passage_seen': return { ...s, ui: { ...s.ui, passageDay: null } };
    case 'resolve_event': return resolveEvent(s, a.optionId);
    case 'outcome_seen': return { ...s, ui: { ...s.ui, outcome: null } };
    case 'end_day': return step(endDay(requireGame(s), c, a.choice));
    case 'finish_week': return step(finishWeek(requireGame(s), c));
    case 'dismiss_error': return { ...s, error: null };
  }
}

export function sessionReducer(s: Session, a: Action): Session {
  if (a.key !== undefined && a.key !== screenKey(s)) return s;
  try {
    return reduce(s, a);
  } catch (e) {
    if (e instanceof EngineError) return { ...s, error: e.message };
    throw e;
  }
}
```

`src/ui/session/save.ts`:

```ts
import { z } from 'zod';
import type { Content, GameState, Lang } from '../../engine';

export const SAVE_KEY = 'skipper.save.v1';
export const LANG_KEY = 'skipper.lang';

const PHASES = ['captain', 'boat_select', 'checkin', 'briefing', 'morning', 'planning', 'evening', 'return', 'debrief'] as const;
const num = z.number().finite();
const text = z.object({ ru: z.string(), en: z.string() });

/** Shape check of a stored game. Deep engine invariants are trusted: the slot is written only by writeSave. */
const SlotSchema = z.object({
  savedAt: z.string(),
  game: z.object({
    version: z.literal(1),
    seed: num, rng: num, lang: z.enum(['ru', 'en']), phase: z.enum(PHASES), day: z.number().int().min(0), clockMin: num,
    weatherTemplateId: z.string(), locationId: z.string(), boatId: z.string().nullable(),
    voices: z.record(num),
    resources: z.object({ waterL: num, fuelL: num, serviceBankPct: num, starterBankPct: num, gasPct: num, moneyEur: num, mood: num, fatigue: num }),
    flags: z.record(z.boolean()), damages: z.array(z.string()),
    crew: z.array(z.object({ id: z.string(), archetypeId: z.string(), name: text })),
    expectations: z.array(z.unknown()), moodPerDay: num, injuries: num,
    log: z.array(z.object({ day: num, clockMin: num, kind: z.string(), cause: z.string() }).passthrough()),
    firedEvents: z.array(z.string()), eventQueue: z.array(z.string()),
    weather: z.unknown(), dayFacts: z.unknown(), returnedOnTime: z.boolean().nullable(),
  }).passthrough(),
});

export type SaveRead = { kind: 'none' } | { kind: 'corrupt' } | { kind: 'ok'; savedAt: string; game: GameState };

function refsExist(g: GameState, c: Content): boolean {
  return c.map.some((p) => p.id === g.locationId)
    && (g.boatId === null || c.boats.some((b) => b.id === g.boatId))
    && c.weather.some((t) => t.id === g.weatherTemplateId)
    && g.eventQueue.every((id) => c.events.some((e) => e.id === id));
}

function safeGet(storage: Storage | null, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

function safeSet(storage: Storage | null, key: string, value: string): boolean {
  if (!storage) return false;
  try { storage.setItem(key, value); return true; } catch { return false; }
}

export function readSave(storage: Storage | null, content: Content): SaveRead {
  const raw = safeGet(storage, SAVE_KEY);
  if (raw === null) return { kind: 'none' };
  try {
    const parsed = SlotSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return { kind: 'corrupt' };
    const game = parsed.data.game as unknown as GameState;
    return refsExist(game, content) ? { kind: 'ok', savedAt: parsed.data.savedAt, game } : { kind: 'corrupt' };
  } catch {
    return { kind: 'corrupt' };
  }
}

export function writeSave(storage: Storage | null, game: GameState, now: Date): boolean {
  return safeSet(storage, SAVE_KEY, JSON.stringify({ savedAt: now.toISOString(), game }));
}

export function clearSave(storage: Storage | null): void {
  try { storage?.removeItem(SAVE_KEY); } catch { /* storage unavailable: nothing to clear */ }
}

export function readLangPref(storage: Storage | null): Lang | null {
  const v = safeGet(storage, LANG_KEY);
  return v === 'ru' || v === 'en' ? v : null;
}

export function writeLangPref(storage: Storage | null, lang: Lang): void {
  safeSet(storage, LANG_KEY, lang);
}

/** ТЗ 7.1: one slot, autosaved at the start of each day (morning, no pending event). */
export function shouldAutosave(prev: GameState | null, next: GameState | null): boolean {
  if (!next || next.phase !== 'morning' || next.eventQueue.length > 0) return false;
  return !prev || prev.phase !== 'morning' || prev.day !== next.day;
}

export function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
  };
}

/** localStorage if it works (it can throw in private mode), otherwise null. */
export function browserStorage(): Storage | null {
  try {
    const s = window.localStorage;
    s.setItem('__probe', '1');
    s.removeItem('__probe');
    return s;
  } catch {
    return null;
  }
}
```

Run: `npx vitest run tests/ui/session`
Expected: PASS (9 + 5).

- [ ] **Step 8: Контекст сессии и общие компоненты**

`src/ui/session/SessionContext.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import type { Content, GameState, Lang } from '../../engine';
import { makeT, type Dict, type TFn } from '../i18n/t';
import { initialSession, sessionReducer } from './reducer';
import { shouldAutosave, writeLangPref, writeSave } from './save';
import { screenKey } from './screen';
import type { Action, ActionBody, Session } from './types';

interface SessionValue { session: Session; dispatch: Dispatch<Action>; storage: Storage | null }
const SessionCtx = createContext<SessionValue | null>(null);

export interface SessionProviderProps {
  content: Content;
  storage: Storage | null;
  initialLang: Lang;
  initialGame?: GameState | null;
  children: ReactNode;
}

export function SessionProvider({ content, storage, initialLang, initialGame = null, children }: SessionProviderProps) {
  const [session, dispatch] = useReducer(sessionReducer, null, () => initialSession(content, initialLang, initialGame));
  const prevGame = useRef<GameState | null>(initialGame);
  useEffect(() => {
    if (session.game && shouldAutosave(prevGame.current, session.game)) writeSave(storage, session.game, new Date());
    prevGame.current = session.game;
  }, [session.game, storage]);
  useEffect(() => {
    document.documentElement.lang = session.lang;
    writeLangPref(storage, session.lang);
  }, [session.lang, storage]);
  const value = useMemo(() => ({ session, dispatch, storage }), [session, storage]);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionCtx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}

export const useLang = (): Lang => useSession().session.lang;

export function useT<K extends string>(d: Dict<K>): TFn<K> {
  const lang = useLang();
  return useMemo(() => makeT(d, lang), [d, lang]);
}

/** Dispatch tagged with the screen key it was rendered for: a second click on a stale screen is ignored. */
export function useAct(): (action: ActionBody) => void {
  const { session, dispatch } = useSession();
  const key = screenKey(session);
  return useCallback((action: ActionBody) => dispatch({ ...action, key }), [dispatch, key]);
}

export interface GameView { game: GameState; content: Content; lang: Lang }

export function useGame(): GameView {
  const { session } = useSession();
  if (!session.game) throw new Error('useGame needs a game in progress');
  return { game: session.game, content: session.content, lang: session.lang };
}
```

`src/ui/components/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant }

export function Button({ variant = 'primary', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={[styles.button, styles[variant], className].filter(Boolean).join(' ')} {...rest} />;
}
```

`src/ui/components/Button.module.css`:

```css
.button {
  min-height: 44px;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius);
  border: 1px solid transparent;
  font: inherit;
  cursor: pointer;
  transition: background-color var(--duration), color var(--duration), border-color var(--duration);
}
.button:disabled { opacity: 0.45; cursor: not-allowed; }
.button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.primary { background: var(--accent); color: var(--accent-fg); }
.primary:not(:disabled):hover { background: var(--accent-strong); }
.secondary { background: transparent; color: var(--accent); border-color: var(--accent); }
.ghost { background: transparent; color: var(--fg-soft); }
.ghost:not(:disabled):hover { color: var(--fg); }
```

`src/ui/components/ScreenFrame.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { Screen } from '../session/types';
import styles from './ScreenFrame.module.css';

export interface ScreenFrameProps {
  screen: Screen;
  title: string;
  subtitle?: string;
  side?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

/** Root of every screen: `data-screen` is how tests and themes know where we are. */
export function ScreenFrame({ screen, title, subtitle, side, actions, children }: ScreenFrameProps) {
  return (
    <main className={styles.frame} data-screen={screen}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </header>
      <div className={side ? styles.withSide : styles.body}>
        <section className={styles.content}>{children}</section>
        {side && <aside className={styles.side}>{side}</aside>}
      </div>
      {actions && <footer className={styles.actions}>{actions}</footer>}
    </main>
  );
}
```

`src/ui/components/ScreenFrame.module.css`:

```css
.frame { max-width: 1200px; margin: 0 auto; padding: var(--space-6) var(--space-4) var(--space-8); }
.header { margin-bottom: var(--space-6); }
.title { font-size: var(--text-2xl); margin: 0; letter-spacing: 0.01em; }
.subtitle { margin: var(--space-2) 0 0; color: var(--fg-soft); font-style: italic; }
.body { display: block; }
.withSide { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: var(--space-6); align-items: start; }
.content { min-width: 0; }
.side { background: var(--panel); border-radius: var(--radius); padding: var(--space-4); box-shadow: var(--shadow); }
.actions { display: flex; flex-wrap: wrap; gap: var(--space-3); justify-content: flex-end; margin-top: var(--space-6); }
```

`src/ui/components/ErrorBanner.tsx`:

```tsx
import { COMMON } from '../i18n/common';
import { useSession, useT } from '../session/SessionContext';
import { Button } from './Button';
import styles from './ErrorBanner.module.css';

export function ErrorBanner() {
  const { session, dispatch } = useSession();
  const t = useT(COMMON);
  if (!session.error) return null;
  return (
    <div role="alert" className={styles.banner}>
      <span>{t('errorPrefix', { message: session.error })}</span>
      <Button variant="ghost" onClick={() => dispatch({ type: 'dismiss_error' })}>{t('dismiss')}</Button>
    </div>
  );
}
```

`src/ui/components/ErrorBanner.module.css`:

```css
.banner {
  position: sticky; top: 0; z-index: 20;
  display: flex; gap: var(--space-3); align-items: center; justify-content: space-between;
  padding: var(--space-2) var(--space-4);
  background: var(--bad); color: var(--accent-fg);
}
```

`src/ui/scenes/manifest.ts`:

```ts
/**
 * Replaceable illustration layer (ТЗ 6.3). Put a painting into public/scenes/ and map its scene id here:
 *   marina_dawn: 'scenes/marina_dawn.webp',
 * A scene without an entry renders the styled placeholder.
 */
export const SCENE_IMAGES: Readonly<Record<string, string>> = {};
```

`src/ui/components/SceneArt.tsx`:

```tsx
import { label, SCENE_TITLES } from '../i18n/glossary';
import { SCENE_IMAGES } from '../scenes/manifest';
import { useLang } from '../session/SessionContext';
import styles from './SceneArt.module.css';

export type SceneMood = 'day' | 'dusk' | 'night' | 'storm';

export function sceneMood(scene: string): SceneMood {
  if (/night/.test(scene)) return 'night';
  if (/sunset|dusk/.test(scene)) return 'dusk';
  if (/squall|spray|wind/.test(scene)) return 'storm';
  return 'day';
}

/** A painting if the manifest has one, otherwise a calm placeholder: sky, horizon, two lines of swell. */
export function SceneArt({ scene, className }: { scene: string; className?: string }) {
  const lang = useLang();
  const src = SCENE_IMAGES[scene];
  const title = label(SCENE_TITLES, scene, lang);
  return (
    <figure className={[styles.scene, className].filter(Boolean).join(' ')} data-scene={scene} data-mood={sceneMood(scene)}>
      {src ? (
        <img className={styles.image} src={src} alt={title} />
      ) : (
        <svg className={styles.stub} viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" role="img" aria-label={title}>
          <rect className={styles.sky} width="400" height="150" />
          <circle className={styles.sun} cx="300" cy="95" r="22" />
          <rect className={styles.sea} y="150" width="400" height="90" />
          <path className={styles.swell} d="M0 172 Q 50 162 100 172 T 200 172 T 300 172 T 400 172" />
          <path className={styles.swell} d="M0 200 Q 50 190 100 200 T 200 200 T 300 200 T 400 200" />
        </svg>
      )}
      <figcaption className={styles.caption}>{title}</figcaption>
    </figure>
  );
}
```

`src/ui/components/SceneArt.module.css`:

```css
.scene { position: relative; margin: 0; border-radius: var(--radius); overflow: hidden; background: var(--sea-900); aspect-ratio: 5 / 3; }
.image, .stub { display: block; width: 100%; height: 100%; object-fit: cover; }
.caption {
  position: absolute; left: var(--space-3); bottom: var(--space-2);
  font-family: var(--font-hand); font-size: var(--text-lg); color: var(--paper);
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.5);
}
.sky { fill: var(--scene-sky); }
.sun { fill: var(--scene-sun); }
.sea { fill: var(--scene-sea); }
.swell { fill: none; stroke: var(--scene-swell); stroke-width: 2; opacity: 0.7; }
.scene[data-mood='day'] { --scene-sky: var(--sea-200); --scene-sun: var(--ochre-200); --scene-sea: var(--sea-500); --scene-swell: var(--paper); }
.scene[data-mood='dusk'] { --scene-sky: var(--ochre-500); --scene-sun: var(--red-500); --scene-sea: var(--sea-700); --scene-swell: var(--ochre-200); }
.scene[data-mood='night'] { --scene-sky: var(--sea-900); --scene-sun: var(--paper-dark); --scene-sea: var(--ink); --scene-swell: var(--sea-500); }
.scene[data-mood='storm'] { --scene-sky: var(--ink-soft); --scene-sun: var(--ink-soft); --scene-sea: var(--sea-900); --scene-swell: var(--paper-dark); }
```

`src/ui/components/logbook/LogbookDrawer.tsx` (заглушка, её заменит Task 11):

```tsx
/** Stub owned by Task 11: the logbook drawer shown during a game. */
export function LogbookDrawer() {
  return null;
}
```

- [ ] **Step 9: Заглушки экранов, реестр, оболочка, точка входа, токены**

14 заглушек по одному шаблону (`ScreenFrame` и строка `COMMON.stub`). Таблица: файл → имя компонента → `screen`:

| Файл | Компонент | screen |
|---|---|---|
| `src/ui/screens/menu/MenuScreen.tsx` | `MenuScreen` | `menu` |
| `src/ui/screens/captain/CaptainScreen.tsx` | `CaptainScreen` | `captain` |
| `src/ui/screens/boat/BoatScreen.tsx` | `BoatScreen` | `boat` |
| `src/ui/screens/checkin/CheckinScreen.tsx` | `CheckinScreen` | `checkin` |
| `src/ui/screens/briefing/BriefingScreen.tsx` | `BriefingScreen` | `briefing` |
| `src/ui/screens/morning/MorningScreen.tsx` | `MorningScreen` | `morning` |
| `src/ui/screens/planning/PlanningScreen.tsx` | `PlanningScreen` | `planning` |
| `src/ui/screens/maneuvers/ManeuversScreen.tsx` | `ManeuversScreen` | `maneuvers` |
| `src/ui/screens/passage/PassageScreen.tsx` | `PassageScreen` | `passage` |
| `src/ui/screens/event/EventScreen.tsx` | `EventScreen` | `event` |
| `src/ui/screens/event/OutcomeScreen.tsx` | `OutcomeScreen` | `outcome` |
| `src/ui/screens/evening/EveningScreen.tsx` | `EveningScreen` | `evening` |
| `src/ui/screens/return/ReturnScreen.tsx` | `ReturnScreen` | `return` |
| `src/ui/screens/debrief/DebriefScreen.tsx` | `DebriefScreen` | `debrief` |

Шаблон (пример для `boat`, остальные — замена имени и `screen`):

```tsx
import { ScreenFrame } from '../../components/ScreenFrame';
import { COMMON } from '../../i18n/common';
import { useT } from '../../session/SessionContext';

/** Stub: replaced by its owning task. */
export function BoatScreen() {
  const t = useT(COMMON);
  return <ScreenFrame screen="boat" title={t('stub')} subtitle="boat" />;
}
```

`src/ui/screens/registry.ts`:

```ts
import type { ComponentType } from 'react';
import type { Screen } from '../session/types';
import { BoatScreen } from './boat/BoatScreen';
import { BriefingScreen } from './briefing/BriefingScreen';
import { CaptainScreen } from './captain/CaptainScreen';
import { CheckinScreen } from './checkin/CheckinScreen';
import { DebriefScreen } from './debrief/DebriefScreen';
import { EveningScreen } from './evening/EveningScreen';
import { EventScreen } from './event/EventScreen';
import { OutcomeScreen } from './event/OutcomeScreen';
import { ManeuversScreen } from './maneuvers/ManeuversScreen';
import { MenuScreen } from './menu/MenuScreen';
import { MorningScreen } from './morning/MorningScreen';
import { PassageScreen } from './passage/PassageScreen';
import { PlanningScreen } from './planning/PlanningScreen';
import { ReturnScreen } from './return/ReturnScreen';

export const SCREENS: Readonly<Record<Screen, ComponentType>> = {
  menu: MenuScreen,
  captain: CaptainScreen,
  boat: BoatScreen,
  checkin: CheckinScreen,
  briefing: BriefingScreen,
  morning: MorningScreen,
  planning: PlanningScreen,
  maneuvers: ManeuversScreen,
  passage: PassageScreen,
  event: EventScreen,
  outcome: OutcomeScreen,
  evening: EveningScreen,
  return: ReturnScreen,
  debrief: DebriefScreen,
};
```

`src/ui/screens/ContentErrorScreen.tsx`:

```tsx
import { formatErrors, type ContentError } from '../../content/parse';

/** Shown before any session exists, so it is bilingual on purpose (no Dict). */
export function ContentErrorScreen({ errors }: { errors: readonly ContentError[] }) {
  return (
    <main data-screen="content-error" style={{ padding: 'var(--space-6)' }}>
      <h1>Контент не прошёл проверку · Content failed validation</h1>
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' }}>{formatErrors(errors)}</pre>
    </main>
  );
}
```

`src/ui/App.tsx`:

```tsx
import type { Content } from '../engine';
import { ErrorBanner } from './components/ErrorBanner';
import { LogbookDrawer } from './components/logbook/LogbookDrawer';
import { SCREENS } from './screens/registry';
import { SessionProvider, useSession } from './session/SessionContext';
import { readLangPref } from './session/save';
import { screenFor, screenKey } from './session/screen';

export function Shell() {
  const { session } = useSession();
  const Current = SCREENS[screenFor(session)];
  return (
    <div className="app" data-daytime="day">
      <ErrorBanner />
      <div className="screen" key={screenKey(session)}>
        <Current />
      </div>
      {session.game && <LogbookDrawer />}
    </div>
  );
}

export interface AppProps { content: Content; storage: Storage | null }

export function App({ content, storage }: AppProps) {
  const lang = readLangPref(storage) ?? (navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en');
  return (
    <SessionProvider content={content} storage={storage} initialLang={lang}>
      <Shell />
    </SessionProvider>
  );
}
```

`src/ui/main.tsx`:

```tsx
import '@fontsource/pt-serif/400.css';
import '@fontsource/pt-serif/400-italic.css';
import '@fontsource/pt-serif/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/caveat/400.css';
import './styles/tokens.css';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadBundledContent } from './content';
import { ContentErrorScreen } from './screens/ContentErrorScreen';
import { browserStorage } from './session/save';

const root = document.getElementById('root');
if (!root) throw new Error('#root element is missing in index.html');
const loaded = loadBundledContent();
createRoot(root).render(
  <StrictMode>
    {loaded.content ? <App content={loaded.content} storage={browserStorage()} /> : <ContentErrorScreen errors={loaded.errors} />}
  </StrictMode>,
);
```

`src/ui/styles/tokens.css` (дневная палитра; ночь и сумерки добавит Task 15):

```css
:root {
  /* palette (ТЗ 6.2): sea blue, ochre, faded red, paper */
  --sea-900: #0f2a3d;
  --sea-700: #1d4e6b;
  --sea-500: #3b7ea1;
  --sea-200: #b9d3df;
  --ochre-500: #c8912e;
  --ochre-200: #ecd9a8;
  --red-500: #a8473c;
  --paper: #f3ead6;
  --paper-dark: #e4d6b5;
  --ink: #2a2620;
  --ink-soft: #5d5446;
  --green-600: #4f7a4a;

  /* semantic */
  --bg: var(--paper);
  --fg: var(--ink);
  --fg-soft: var(--ink-soft);
  --panel: #fbf6ea;
  --line: var(--paper-dark);
  --accent: var(--sea-700);
  --accent-strong: var(--sea-900);
  --accent-fg: #ffffff;
  --focus: var(--ochre-500);
  --ok: var(--green-600);
  --warn: var(--ochre-500);
  --bad: var(--red-500);

  /* type */
  --font-serif: 'PT Serif', Georgia, serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --font-hand: 'Caveat', 'Segoe Print', cursive;
  --text-sm: 0.875rem;
  --text-md: 1rem;
  --text-lg: 1.25rem;
  --text-xl: 1.5rem;
  --text-2xl: 2rem;

  /* space & shape */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --radius: 6px;
  --shadow: 0 2px 8px rgb(42 38 32 / 0.15);
  --duration: 240ms;
}
```

`src/ui/styles/global.css`:

```css
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; }
body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-serif);
  font-size: var(--text-md);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
.app { min-height: 100vh; background: var(--bg); color: var(--fg); transition: background-color 1.2s ease, color 1.2s ease; }
h1, h2, h3 { font-weight: 700; line-height: 1.2; }
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}
```

- [ ] **Step 10: Тестовый рендер-хелпер и тест оболочки**

`tests/ui/render.tsx`:

```tsx
import { act, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Dispatch, ReactNode } from 'react';
import type { GameState, Lang } from '../../src/engine';
import { Shell } from '../../src/ui/App';
import { SessionProvider, useSession } from '../../src/ui/session/SessionContext';
import { memoryStorage } from '../../src/ui/session/save';
import type { Action, Session } from '../../src/ui/session/types';
import { content } from './fixtures';

export interface RenderOptions { lang?: Lang; storage?: Storage }

/**
 * Mounts the real Shell with a ready GameState.
 * `session()` returns the latest session; `dispatch()` sends an action as if a screen did.
 */
export function renderShell(game: GameState | null, opts: RenderOptions = {}) {
  const storage = opts.storage ?? memoryStorage();
  const user = userEvent.setup();
  const latest: { session: Session | null; dispatch: Dispatch<Action> | null } = { session: null, dispatch: null };
  function Probe() {
    const v = useSession();
    latest.session = v.session;
    latest.dispatch = v.dispatch;
    return null;
  }
  const view = render(
    <SessionProvider content={content} storage={storage} initialLang={opts.lang ?? 'ru'} initialGame={game}>
      <Probe />
      <Shell />
    </SessionProvider>,
  );
  const currentScreen = (): string | null => view.container.querySelector('[data-screen]')?.getAttribute('data-screen') ?? null;
  const session = (): Session => {
    if (!latest.session) throw new Error('session not rendered');
    return latest.session;
  };
  const dispatch = (action: Action): void => {
    act(() => latest.dispatch?.(action));
  };
  return { ...view, user, storage, currentScreen, session, dispatch };
}

/** Renders any node inside a SessionProvider (components that need the language or a game). */
export function renderWithSession(node: ReactNode, game: GameState | null = null, lang: Lang = 'ru') {
  const user = userEvent.setup();
  const view = render(
    <SessionProvider content={content} storage={memoryStorage()} initialLang={lang} initialGame={game}>{node}</SessionProvider>,
  );
  return { ...view, user };
}
```

`tests/ui/shell.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expert } from '../../src/sim/strategies';
import { loadBundledContent } from '../../src/ui/content';
import { readSave } from '../../src/ui/session/save';
import { content, gameAt } from './fixtures';
import { renderShell } from './render';

describe('Shell', () => {
  it('bundled content passes validation', () => {
    expect(loadBundledContent().errors).toEqual([]);
  });

  it('shows the menu without a game and the phase screen with one', () => {
    expect(renderShell(null).currentScreen()).toBe('menu');
  });

  it.each([
    ['captain', 'captain'], ['boat_select', 'boat'], ['checkin', 'checkin'], ['briefing', 'briefing'],
    ['morning', 'morning'], ['planning', 'planning'], ['return', 'return'], ['debrief', 'debrief'],
  ] as const)('phase %s renders screen %s', (phase, expected) => {
    expect(renderShell(gameAt(phase)).currentScreen()).toBe(expected);
  });

  it('autosaves when a morning starts, not before', () => {
    const r = renderShell(gameAt('briefing'));
    expect(readSave(r.storage, content).kind).toBe('none');
    r.dispatch({ type: 'briefing', topicIds: expert.briefingTopics, dialogueIds: [] });
    expect(r.currentScreen()).toBe('morning');
    const saved = readSave(r.storage, content);
    expect(saved.kind === 'ok' && saved.game.day).toBe(1);
  });

  it('sets <html lang> from the session language', () => {
    renderShell(null, { lang: 'en' });
    expect(document.documentElement.lang).toBe('en');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
```

Run: `npx vitest run tests/ui`
Expected: PASS.

- [ ] **Step 11: Проверить сборку и запустить dev-сервер**

Run: `npm run typecheck && npm test && npm run build`
Expected: tsc без ошибок; все тесты (172 + новые) PASS; `dist/index.html` создан.

Run: `npx vite --port 5173` (через несколько секунд остановить)
Expected: сервер стартует без ошибок. В браузере видна заглушка меню «Экран в разработке».

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts vite.config.ts index.html .gitignore src/ui tests/ui
git commit -m "feat: add UI shell with session reducer, saves, i18n and screen stubs"
```

---

### Task 2: API движка для UI — предпросмотр плана, экспорт, мелкие фиксы Этапа 1

**Files:**
- Create: `src/engine/preview.ts`
- Modify: `src/engine/index.ts`, `src/engine/day/passage.ts` (`validatePlan`, `validateOrders`), `src/engine/debrief.ts` (`buildDebrief.covered`)
- Modify: `docs/superpowers/stage1-followups.md` (вычеркнуть закрытые пункты)
- Test: `tests/engine/preview.test.ts`, `tests/engine/day/passage.test.ts` (добавить кейсы), `tests/engine/debrief.test.ts` (добавить кейс)

**Interfaces:**
- Consumes: `planLeg, bearingDeg, dirToDeg` (`sailing.ts`), `realWind` (`weather.ts`), `cautionTimeFactor` (`voices.ts`), `restHours` (`time.ts`), `otherEnd, requireBoat, requirePoint, requireRoute, requireTemplate, round1` (`state.ts`), фикстуры `makeContent()` и `makeState()`.
- Produces (всё через `src/engine/index.ts`):
  - `previewPlan(state, content, plan): PlanPreview`, `PlanPreview`, `LegPreview`
  - новые реэкспорты: `tavernaOpen`, `maneuverForKind`, `correctOrder`, `validateAllocation`, `checkChance`, `optionAvailable`, `requirePoint`, `requireRoute`, `requireEvent`, `otherEnd`, `causeMatches`, `exposure`, `signalsVisible`

**Правило предпросмотра.** Игрок видит оценку новичка: прогноз с суточным ходом, без локального усиления и без фронта. Морское чутьё на уровне `≥ balance.voices.seaSenseSignalLevel` добавляет локальный коэффициент участка (`localEffectKnown: true`). Фронт добавляется, только если его сигналы видны (`weather.signalsVisible`). Это и есть ловушка «верить прогнозу» из ТЗ 2: прокачанный голос или открытый барометр видят больше. Предпросмотр не бросает кубики и не меняет state.

- [ ] **Step 1: Написать падающие тесты предпросмотра**

`tests/engine/preview.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EngineError } from '../../src/engine/errors';
import { previewPlan } from '../../src/engine/preview';
import type { DayPlan, LegPlan } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';
import { deepFreeze } from '../fixtures/freeze';
import { makeState } from '../fixtures/state';

const content = makeContent();
const motor = (routeId: string): LegPlan => ({ routeId, mode: 'motor', reefs: 0, genoa: 'full', course: 'direct' });
const plan = (legs: LegPlan[], departureHour = 9, swimStops = 0): DayPlan => ({ departureHour, legs, swimStops, shower: 'normal', autopilot: false });

describe('previewPlan', () => {
  it('estimates departure, legs and arrival for a one-leg day without touching state', () => {
    const state = deepFreeze(makeState());
    const p = previewPlan(state, content, plan([motor('r_base_bay_a')]));
    expect(p.departureMin).toBe(9 * 60);
    expect(p.destinationId).toBe('bay_a');
    expect(p.legs).toHaveLength(1);
    expect(p.legs[0]).toMatchObject({ routeId: 'r_base_bay_a', from: 'base', to: 'bay_a', distanceNm: 10 });
    expect(p.arrivalMin!).toBeGreaterThan(p.departureMin! + p.legs[0]!.hours * 60);
    expect(p.marinaLate).toBe(false);
    expect(p.fuelNeededL).toBeGreaterThan(0);
  });

  it('never departs before the current clock', () => {
    const p = previewPlan(makeState({ clockMin: 11 * 60 }), content, plan([motor('r_base_bay_a')], 9));
    expect(p.departureMin).toBe(11 * 60);
  });

  it('shows the local wind effect only to a trained Sea Sense', () => {
    const at = { locationId: 'bay_a' } as const;
    const novice = previewPlan(makeState({ ...at, voices: { ...makeState().voices, sea_sense: 0 } }), content, plan([motor('r_bay_a_marina_b')], 8));
    const skilled = previewPlan(makeState({ ...at, voices: { ...makeState().voices, sea_sense: 2 } }), content, plan([motor('r_bay_a_marina_b')], 8));
    expect(novice.legs[0]!.localEffectKnown).toBe(false);
    expect(skilled.legs[0]!.localEffectKnown).toBe(true);
    expect(skilled.legs[0]!.windKn).toBeCloseTo(novice.legs[0]!.windKn * 1.3, 1);
  });

  it('adds a front only when its signals are visible', () => {
    const weather = { ...makeState().weather!, front: true, frontAddKn: 10, frontDir: 'W' as const };
    const hidden = previewPlan(makeState({ weather: { ...weather, signalsVisible: false } }), content, plan([motor('r_base_bay_a')], 14));
    const seen = previewPlan(makeState({ weather: { ...weather, signalsVisible: true } }), content, plan([motor('r_base_bay_a')], 14));
    expect(seen.legs[0]!.windKn).toBeCloseTo(hidden.legs[0]!.windKn + 10, 1);
    expect(seen.legs[0]!.windDir).toBe('W');
  });

  it('flags a marina reached after its places are gone and an arrival after sunset', () => {
    const late = previewPlan(makeState({ locationId: 'bay_a', clockMin: 16 * 60 }), content, plan([motor('r_bay_a_marina_b')], 16));
    expect(late.marinaLate).toBe(true);
    const dark = previewPlan(makeState({ clockMin: 19 * 60 + 30 }), content, plan([motor('r_base_bay_a')], 19.5));
    expect(dark.arrivalAfterSunset).toBe(true);
  });

  it('a stay-in-place plan has no departure and no arrival', () => {
    const p = previewPlan(makeState(), content, plan([], 9, 2));
    expect(p).toMatchObject({ departureMin: null, arrivalMin: null, destinationId: 'base', legs: [], swimStops: 2 });
  });

  it('rejects a broken route chain and a missing weather roll', () => {
    expect(() => previewPlan(makeState(), content, plan([motor('r_bay_a_marina_b')]))).toThrow(EngineError);
    expect(() => previewPlan(makeState({ weather: null }), content, plan([motor('r_base_bay_a')]))).toThrow(/startDay/);
  });
});
```

Run: `npx vitest run tests/engine/preview.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/engine/preview"`.

- [ ] **Step 2: Реализовать `preview.ts`**

`src/engine/preview.ts`:

```ts
import { EngineError } from './errors';
import { bearingDeg, dirToDeg, planLeg } from './sailing';
import { otherEnd, requireBoat, requirePoint, requireRoute, requireTemplate, round1 } from './state';
import { restHours } from './time';
import type { Content, DayPlan, DayWeather, Dir8, GameState, LegPlan, MapPoint, PointOfSail, RouteFeature } from './types';
import { cautionTimeFactor } from './voices';
import { realWind } from './weather';

export interface LegPreview {
  routeId: string;
  from: string;
  to: string;
  distanceNm: number;
  features: RouteFeature[];
  /** Wind the captain expects on this leg (forecast; + local effect and visible front if known). */
  windKn: number;
  windDir: Dir8;
  localEffectKnown: boolean;
  pos: PointOfSail;
  speedKn: number;
  hours: number;
  overpowered: boolean;
  forcedReef: boolean;
}

export interface PlanPreview {
  legs: LegPreview[];
  departureMin: number | null;
  arrivalMin: number | null;
  destinationId: string;
  /** Swim stops that would start before sunset. */
  swimStops: number;
  arrivalAfterSunset: boolean;
  marinaLate: boolean;
  fuelNeededL: number;
  restHours: number;
}

interface Ctx { state: GameState; content: Content; weather: DayWeather; seesLocal: boolean }

function legPreview(ctx: Ctx, leg: LegPlan, from: string, clockMin: number): LegPreview {
  const { content, state } = ctx;
  const b = content.balance;
  const route = requireRoute(content, leg.routeId);
  const to = otherEnd(route, from);
  if (!to) throw new EngineError('INVALID_INPUT', `Route ${route.id} does not start at ${from}`);
  const wind = realWind(ctx.weather, ctx.seesLocal ? route.kLocal : 1, clockMin / 60, requireTemplate(content, state.weatherTemplateId), b);
  const boat = requireBoat(content, state);
  const res = planLeg({
    mode: leg.mode, windKn: wind.windKn, windFromDeg: dirToDeg(wind.dir),
    courseDeg: bearingDeg(requirePoint(content, from), requirePoint(content, to)),
    reefs: leg.reefs, genoa: leg.genoa, course: leg.course, distanceNm: route.distanceNm,
    hullSpeedKn: boat.hullSpeedKn, motorKn: boat.motorKn,
  }, b);
  return {
    routeId: route.id, from, to, distanceNm: res.distanceNm, features: route.features,
    windKn: wind.windKn, windDir: wind.dir, localEffectKnown: ctx.seesLocal,
    pos: res.pos, speedKn: res.speedKn, hours: res.hours,
    overpowered: leg.mode === 'sail' && res.overpowered, forcedReef: leg.mode === 'sail' && res.forcedReef,
  };
}

function swimsBeforeSunset(clockMin: number, stops: number, content: Content): { count: number; clockMin: number } {
  const t = content.balance.time;
  let clock = clockMin;
  let count = 0;
  for (let i = 0; i < stops && clock < t.sunsetHour * 60; i++) {
    clock += t.swimStopMin;
    count++;
  }
  return { count, clockMin: clock };
}

function mooringMinutes(dest: MapPoint, late: boolean, state: GameState, content: Content): number {
  const t = content.balance.time;
  const anchoring = (t.anchorMin[0] + t.anchorMin[1]) / 2;
  const base = dest.kind === 'bay' ? anchoring : late ? t.marinaWaitMin + anchoring : t.marinaMooringMin;
  return base * cautionTimeFactor(state.voices.caution, content.balance);
}

/** What the captain can foresee for a plan. Pure: no RNG, no state change. */
export function previewPlan(state: GameState, content: Content, plan: DayPlan): PlanPreview {
  if (!state.weather) throw new EngineError('WRONG_PHASE', 'No weather for today: call startDay first');
  const b = content.balance;
  const weather = { ...state.weather, front: state.weather.front && state.weather.signalsVisible };
  const ctx: Ctx = { state, content, weather, seesLocal: state.voices.sea_sense >= b.voices.seaSenseSignalLevel };
  if (plan.legs.length === 0) {
    const swims = swimsBeforeSunset(state.clockMin, plan.swimStops, content);
    return {
      legs: [], departureMin: null, arrivalMin: null, destinationId: state.locationId, swimStops: swims.count,
      arrivalAfterSunset: false, marinaLate: false, fuelNeededL: 0, restHours: restHours(swims.clockMin, b),
    };
  }
  const departureMin = Math.max(state.clockMin, Math.round(plan.departureHour * 60));
  let clock = departureMin + b.time.departureMin;
  let at = state.locationId;
  const legs: LegPreview[] = [];
  for (const leg of plan.legs) {
    const p = legPreview(ctx, leg, at, clock);
    legs.push(p);
    clock += p.hours * 60 + (p.forcedReef ? b.sails.reefUnderwayMin : 0);
    at = p.to;
  }
  const swims = swimsBeforeSunset(clock, plan.swimStops, content);
  const dest = requirePoint(content, at);
  const marinaLate = dest.kind !== 'bay' && dest.placesGoneHour !== null && swims.clockMin / 60 > dest.placesGoneHour;
  const arrivalMin = Math.round(swims.clockMin + mooringMinutes(dest, marinaLate, state, content));
  const motorHours = legs.reduce((sum, l, i) => sum + (plan.legs[i]!.mode === 'motor' ? l.hours : 0), 0);
  return {
    legs, departureMin, arrivalMin, destinationId: at, swimStops: swims.count,
    arrivalAfterSunset: swims.clockMin >= b.time.sunsetHour * 60,
    marinaLate,
    fuelNeededL: round1(motorHours * b.fuel.motorLph),
    restHours: restHours(arrivalMin, b),
  };
}
```

Run: `npx vitest run tests/engine/preview.test.ts`
Expected: PASS (7).

- [ ] **Step 3: Падающие тесты на фиксы Этапа 1**

Добавить в `tests/engine/day/passage.test.ts` (в существующий `describe` для `validatePlan`; импорты `validatePlan`, `makeContent`, `makeState`, `EngineError` в файле уже есть, иначе добавить):

```ts
it('rejects a sailing plan when the effective departure is already past sunset', () => {
  const content = makeContent();
  const late = makeState({ clockMin: 20 * 60 + 10 });
  const leg = { routeId: 'r_base_bay_a', mode: 'motor' as const, reefs: 0 as const, genoa: 'full' as const, course: 'direct' as const };
  expect(() => validatePlan(late, content, { departureHour: 9, legs: [leg], swimStops: 0, shower: 'normal', autopilot: false }))
    .toThrow(/past sunset/);
  expect(() => validatePlan(late, content, { departureHour: 9, legs: [], swimStops: 0, shower: 'normal', autopilot: false }))
    .not.toThrow();
});

it('rejects maneuver orders for an unknown maneuver kind', () => {
  const content = makeContent();
  const orders = { docking: ['a', 'b'] } as unknown as Record<string, string[]>;
  expect(() => validatePlan(makeState(), content, { departureHour: 9, legs: [], swimStops: 0, shower: 'normal', autopilot: false, maneuverOrders: orders }))
    .toThrow(/Unknown maneuver kind "docking"/);
});
```

Добавить в `tests/engine/debrief.test.ts` (импорты `buildDebrief`, `makeContent`, `makeState` в файле есть):

```ts
it('does not repeat an event as a note when its injury is already a link', () => {
  const content = makeContent();
  const rule = { id: 'inj', pillar: 'safety' as const, decision: 'checkin:skip:toilets', consequence: 'injury:event:toilet_clog', priority: 9, text: { ru: 'р', en: 'e' } };
  const c = { ...content, debrief: [rule] };
  const state = makeState({
    phase: 'debrief',
    firedEvents: ['toilet_clog'],
    log: [
      { day: 0, clockMin: 0, kind: 'decision', cause: 'checkin:skip:toilets' },
      { day: 3, clockMin: 1200, kind: 'event', cause: 'event:toilet_clog' },
      { day: 3, clockMin: 1200, kind: 'effect', cause: 'injury:event:toilet_clog:fix_self:fail' },
    ],
  });
  const d = buildDebrief(state, c);
  expect(d.links.map((l) => l.ruleId)).toEqual(['inj']);
  expect(d.eventNotes).toEqual([]);
});
```

Run: `npx vitest run tests/engine/day/passage.test.ts tests/engine/debrief.test.ts`
Expected: FAIL на трёх новых кейсах.

- [ ] **Step 4: Исправить `validatePlan`, `validateOrders`, `covered`**

`src/engine/day/passage.ts`. В импорт типов добавить `MANEUVER_KINDS` (значение, не тип: `import { MANEUVER_KINDS, type Activity, ... } from '../types';`). Заменить `validateOrders`:

```ts
function validateOrders(content: Content, plan: DayPlan): void {
  for (const [kind, order] of Object.entries(plan.maneuverOrders ?? {}) as [ManeuverKind, string[]][]) {
    if (!(MANEUVER_KINDS as readonly string[]).includes(kind)) invalid(`Unknown maneuver kind "${kind}"`);
    const m = maneuverForKind(content, kind);
    const problem = m ? validateOrder(m, order) : null;
    if (problem) invalid(problem);
  }
}
```

В `validatePlan` сразу после проверки `departureHour` добавить:

```ts
  if (plan.legs.length > 0 && Math.max(plan.departureHour, state.clockMin / 60) >= t.sunsetHour) {
    invalid('Too late to leave today: it is already past sunset');
  }
```

`src/engine/debrief.ts`, в `buildDebrief` заменить строку `covered`:

```ts
  const covered = (eventId: string): boolean =>
    links.some((l) => causeMatches(l.consequence.cause, `event:${eventId}`) || causeMatches(l.consequence.cause, `injury:event:${eventId}`));
```

Run: `npx vitest run tests/engine`
Expected: PASS (все тесты движка, включая новые).

- [ ] **Step 5: Экспорт через публичный API**

`src/engine/index.ts` (заменить целиком):

```ts
// Public engine API for the UI. Import from here, not from internal modules.
export * from './types';
export { EngineError, type EngineErrorCode } from './errors';
export { newGame, assignVoices, boatOffers, chooseBoat, performCheckin, performBriefing, type NewGameOptions } from './setup';
export { startDay, type MorningChoice } from './day/morning';
export { planDay, validatePlan } from './day/passage';
export { endDay, finishWeek, tavernaOpen, type EveningChoice } from './day/evening';
export { presentEvent, resolvePendingEvent, optionAvailable, type EventView } from './events';
export { buildDebrief, type Debrief, type DebriefLink, type WeekScales } from './debrief';
export { buildConditionContext } from './expr';
export { formatClock } from './time';
export { resourceReadout, validateAllocation, checkChance } from './voices';
export { realWind, exposure, signalsVisible } from './weather';
export { maneuverForKind, correctOrder } from './maneuver';
export { requirePoint, requireRoute, requireEvent, otherEnd } from './state';
export { causeMatches } from './log';
export { previewPlan, type PlanPreview, type LegPreview } from './preview';
```

В `docs/superpowers/stage1-followups.md` в разделе «Stage 2» вычеркнуть (`~~…~~`) пункты про `covered()`, про выход после заката и про `validateOrders`, с пометкой `— fixed in Stage 2 Task 2`.

Run: `npm run typecheck && npm test`
Expected: tsc без ошибок, все тесты PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine tests/engine docs/superpowers/stage1-followups.md
git commit -m "feat: add plan preview to the engine API and close stage 1 follow-ups"
```

---

### Task 3: Слой представления — ресурсы, бортжурнал, проекция карты, `ResourcePanel`

**Files:**
- Create: `src/ui/view/format.ts`, `src/ui/view/strings.ts`, `src/ui/view/resources.ts`, `src/ui/view/logbook.ts`, `src/ui/view/map.ts`
- Create: `src/ui/components/ResourcePanel.tsx`, `src/ui/components/ResourcePanel.module.css`
- Test: `tests/ui/view/resources.test.ts`, `tests/ui/view/logbook.test.ts`, `tests/ui/view/map.test.ts`, `tests/ui/components/ResourcePanel.test.tsx`

**Interfaces:**
- Consumes: из движка `formatClock, resourceReadout` и типы; `label, CHECKPOINT_NAMES, DAMAGE_NAMES` (glossary), `fmt, dict`, `COMMON`, `useGame, useT` (Task 1). В тестах `runWeek` (`src/sim/run.ts`), `expert, newbie` (`src/sim/strategies.ts`).
- Produces:
  - `formatHour(hour): string`, `signed(n): string` (`view/format.ts`)
  - `ResourceKey`, `Level`, `ResourceRow`, `LOW_SHARE`, `CRITICAL_SHARE`, `resourceRows(game, content, lang): ResourceRow[]` (`view/resources.ts`)
  - `Tone`, `LogLine`, `describeEntry(entry, content, lang): LogLine | null`, `isNoise(entry): boolean`, `logbookDays(log, content, lang): { day; lines }[]`, `dayLines(log, day, content, lang): LogLine[]` (`view/logbook.ts`)
  - `Bounds`, `Projection`, `mapBounds(points, padNm?)`, `projection(bounds, pxPerNm?)`, `routesFrom(content, pointId)`, `routeBetween(content, a, b)`, `pointName(content, id, lang)` (`view/map.ts`)
  - `VIEW`, `RESOURCE_NAMES`, `UNITS`, `LOG`, `SHOWER_NAMES`, `MODE_NAMES`, `SIGNAL_NAMES` (`view/strings.ts`)
  - `<ResourcePanel />` — день, часы, место, ресурсы с точностью по уровню Механика, повреждения (`components/ResourcePanel.tsx`)

**Правило бортжурнала.** `describeEntry` описывает любую запись (её использует и разбор: решения вроде `checkin:skip:toilets` там нужны). `isNoise` прячет из игрового бортжурнала то, что игрок «не видел»: незамеченные признаки фронта, скрытые дефекты, расход, служебные записи. Причины берутся из словаря Этапа 1 (`stage1` plan, раздел «Контракты»).

- [ ] **Step 1: Написать падающие тесты**

`tests/ui/view/resources.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resourceRows } from '../../../src/ui/view/resources';
import { content, gameAt } from '../fixtures';

describe('resourceRows', () => {
  const game = gameAt('morning');

  it('gives rough readouts without Mechanic and exact ones with it', () => {
    const rough = resourceRows({ ...game, voices: { ...game.voices, mechanic: 0 } }, content, 'ru');
    const exact = resourceRows({ ...game, voices: { ...game.voices, mechanic: 4 } }, content, 'ru');
    expect(rough.find((r) => r.key === 'waterL')!.value).toMatch(/^~\d+ л$/);
    expect(exact.find((r) => r.key === 'waterL')!.value).toMatch(/^\d+ л$/);
  });

  it('colours low and critical levels, fatigue inverted', () => {
    const tired = { ...game, resources: { ...game.resources, waterL: 1, fatigue: 95, mood: 25 } };
    const rows = resourceRows(tired, content, 'en');
    expect(rows.find((r) => r.key === 'waterL')!.level).toBe('critical');
    expect(rows.find((r) => r.key === 'fatigue')!.level).toBe('critical');
    expect(rows.find((r) => r.key === 'mood')!.level).toBe('low');
    expect(rows.find((r) => r.key === 'waterL')!.label).toBe('Water');
  });

  it('lists all eight resources', () => {
    expect(resourceRows(game, content, 'ru').map((r) => r.key)).toEqual(
      ['waterL', 'fuelL', 'serviceBankPct', 'starterBankPct', 'gasPct', 'moneyEur', 'mood', 'fatigue'],
    );
  });
});
```

`tests/ui/view/logbook.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../../../src/engine';
import { runWeek } from '../../../src/sim/run';
import { expert, newbie } from '../../../src/sim/strategies';
import { describeEntry, isNoise, logbookDays } from '../../../src/ui/view/logbook';
import { content } from '../fixtures';

const entry = (cause: string, extra: Partial<LogEntry> = {}): LogEntry => ({ day: 2, clockMin: 600, kind: 'decision', cause, ...extra });

describe('logbook', () => {
  it('describes every entry of real weeks in both languages without raw placeholders', () => {
    for (const strategy of [expert, newbie]) {
      for (const seed of [1, 2, 3, 42]) {
        const { state } = runWeek(content, seed, strategy);
        for (const e of state.log) {
          for (const lang of ['ru', 'en'] as const) {
            const line = describeEntry(e, content, lang);
            if (!line) continue;
            expect(line.text, e.cause).not.toMatch(/\{\w+\}|undefined|NaN/);
            expect(line.text.length, e.cause).toBeGreaterThan(3);
            expect(line.text, `no describer for ${e.cause}`).not.toMatch(/^(Запись|Entry):/);
          }
        }
      }
    }
  });

  it('shows what was said and what the crew heard', () => {
    const line = describeEntry(entry('dialogue:early_try'), content, 'ru')!;
    expect(line.text).toContain('Постараемся выйти пораньше');
    expect(line.text).toContain('Выходим в 8');
  });

  it('hides unseen front signals and hidden defects from the in-game logbook, but still describes them', () => {
    const unseen = entry('signal:front', { kind: 'signal', data: { seen: false, barometerTrendHpa: -4, frontAddKn: 10 } });
    expect(isNoise(unseen)).toBe(true);
    expect(describeEntry(unseen, content, 'ru')).not.toBeNull();
    expect(isNoise({ ...unseen, data: { seen: true, barometerTrendHpa: -4, frontAddKn: 10 } })).toBe(false);
    expect(isNoise(entry('defect:hidden:worn_impeller', { kind: 'info' }))).toBe(true);
    expect(isNoise(entry('checkin:skip:toilets'))).toBe(true);
    expect(describeEntry(entry('checkin:skip:toilets'), content, 'en')!.text).toContain('Heads');
  });

  it('marks good and bad outcomes', () => {
    expect(describeEntry(entry('promise:early_try:broken', { kind: 'effect' }), content, 'ru')!.tone).toBe('bad');
    expect(describeEntry(entry('promise:early_try:kept', { kind: 'effect' }), content, 'ru')!.tone).toBe('good');
    expect(describeEntry(entry('marina:refused', { kind: 'effect' }), content, 'ru')!.tone).toBe('bad');
  });

  it('groups the visible log by day', () => {
    const { state } = runWeek(content, 42, expert);
    const days = logbookDays(state.log, content, 'ru');
    expect(days.map((d) => d.day)).toEqual([...new Set(days.map((d) => d.day))].sort((a, b) => a - b));
    expect(days.every((d) => d.lines.length > 0)).toBe(true);
  });
});
```

`tests/ui/view/map.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapBounds, projection, routeBetween, routesFrom } from '../../../src/ui/view/map';
import { content } from '../fixtures';

describe('map view', () => {
  it('bounds contain every point with padding', () => {
    const b = mapBounds(content.map, 3);
    for (const p of content.map) {
      expect(p.x).toBeGreaterThanOrEqual(b.minX + 3);
      expect(p.y).toBeLessThanOrEqual(b.maxY - 3);
    }
  });

  it('projects north up and stays inside the viewBox', () => {
    const proj = projection(mapBounds(content.map), 20);
    const south = proj.toSvg({ x: 0, y: -8 });
    const north = proj.toSvg({ x: 0, y: 24 });
    expect(north.y).toBeLessThan(south.y);
    for (const p of content.map) {
      const s = proj.toSvg(p);
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(proj.width);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(proj.height);
    }
  });

  it('finds routes from a point in both directions', () => {
    const from = routesFrom(content, 'cala_azzurra').map((r) => r.to.id).sort();
    expect(from).toContain('base_marina');
    expect(from).toContain('kastri_marina');
    expect(routeBetween(content, 'kastri_marina', 'cala_azzurra')?.id).toBe('r_cala_azzurra_kastri_marina');
    expect(routeBetween(content, 'fjord_bay', 'blue_lagoon')).toBeNull();
  });
});
```

`tests/ui/components/ResourcePanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResourcePanel } from '../../../src/ui/components/ResourcePanel';
import { SessionProvider } from '../../../src/ui/session/SessionContext';
import { memoryStorage } from '../../../src/ui/session/save';
import { content, gameAt } from '../fixtures';

describe('ResourcePanel', () => {
  it('shows day, place, clock and every resource', () => {
    const game = { ...gameAt('planning'), damages: ['hull_scratch'] };
    render(
      <SessionProvider content={content} storage={memoryStorage()} initialLang="ru" initialGame={game}>
        <ResourcePanel />
      </SessionProvider>,
    );
    expect(screen.getByText(/День 1 из 6/)).toBeInTheDocument();
    expect(screen.getByText('Вода')).toBeInTheDocument();
    expect(screen.getByText('Усталость капитана')).toBeInTheDocument();
    expect(screen.getByText(/Царапина на корпусе/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(8);
  });
});
```

Run: `npx vitest run tests/ui/view tests/ui/components/ResourcePanel.test.tsx`
Expected: FAIL — `Failed to resolve import "../../../src/ui/view/resources"`.

- [ ] **Step 2: Строки и форматирование**

`src/ui/view/format.ts`:

```ts
import { formatClock } from '../../engine';

const MIN_PER_HOUR = 60;

export const formatHour = (hour: number): string => formatClock(Math.round(hour * MIN_PER_HOUR));

/** One decimal, explicit sign: "+5", "−2.5" (true minus sign for typography). */
export function signed(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r > 0) return `+${r}`;
  return r < 0 ? `−${Math.abs(r)}` : '0';
}
```

`src/ui/view/strings.ts`:

```ts
import type { LocalizedText, Resources, ShowerDiscipline } from '../../engine';
import { dict } from '../i18n/t';

const t = (ru: string, en: string): LocalizedText => ({ ru, en });

export const VIEW = dict({
  resources: { ru: 'Ресурсы', en: 'Resources' },
  damages: { ru: 'Повреждения: {list}', en: 'Damage: {list}' },
  noDamage: { ru: 'Повреждений нет', en: 'No damage' },
  at: { ru: '{place} · {clock}', en: '{place} · {clock}' },
});

export const RESOURCE_NAMES: Readonly<Record<keyof Resources, LocalizedText>> = {
  waterL: t('Вода', 'Water'),
  fuelL: t('Топливо', 'Fuel'),
  serviceBankPct: t('Сервисный банк', 'Service bank'),
  starterBankPct: t('Стартовый аккумулятор', 'Starter battery'),
  gasPct: t('Газ', 'Gas'),
  moneyEur: t('Деньги', 'Money'),
  mood: t('Настроение экипажа', 'Crew mood'),
  fatigue: t('Усталость капитана', 'Skipper fatigue'),
};

export const UNITS = dict({
  liters: { ru: ' л', en: ' L' },
});

export const SHOWER_NAMES: Readonly<Record<ShowerDiscipline, LocalizedText>> = {
  strict: t('строгий', 'strict'),
  normal: t('обычный', 'normal'),
  loose: t('свободный', 'relaxed'),
};

export const MODE_NAMES = dict({
  motor: { ru: 'на моторе', en: 'under engine' },
  sail: { ru: 'под парусом', en: 'under sail' },
});

/** Event signal ids (effect.signal in events.json). Unknown ids use LOG.signalGeneric. */
export const SIGNAL_NAMES: Readonly<Record<string, LocalizedText>> = {
  barometer: t('Барометр падал', 'The barometer was falling'),
  local_warning: t('Местные предупреждали о ветре', 'Locals warned about the wind'),
};

export const LOG = dict({
  boatChosen: { ru: 'Взяли лодку «{name}»', en: 'Took the boat "{name}"' },
  checked: { ru: 'На приёмке проверили: {what}', en: 'Checked at check-in: {what}' },
  skipped: { ru: 'На приёмке не проверили: {what}', en: 'Not checked at check-in: {what}' },
  defectFound: { ru: 'Нашли на приёмке: {what}', en: 'Found at check-in: {what}' },
  defectHidden: { ru: 'Скрытый дефект остался незамеченным: {what}', en: 'A hidden defect went unnoticed: {what}' },
  briefed: { ru: 'На брифинге обсудили: {what}', en: 'Briefed the crew on: {what}' },
  notBriefed: { ru: 'На брифинге не обсудили: {what}', en: 'Did not brief the crew on: {what}' },
  said: { ru: 'Сказали: «{said}». Экипаж услышал: «{heard}»', en: 'Said: "{said}". The crew heard: "{heard}"' },
  promiseKept: { ru: 'Ожидание выполнено: «{heard}»', en: 'Expectation met: "{heard}"' },
  promiseBroken: { ru: 'Ожидание сорвано: «{heard}»', en: 'Expectation broken: "{heard}"' },
  barometerOpen: { ru: 'Утром посмотрели на барометр и небо', en: 'Checked the barometer and the sky in the morning' },
  barometerIgnored: { ru: 'Утром на барометр не смотрели', en: 'Did not look at the barometer in the morning' },
  frontSignalSeen: { ru: 'Барометр падает ({trend} гПа), на западе тучи', en: 'Barometer falling ({trend} hPa), clouds to the west' },
  frontSignalMissed: { ru: 'Барометр падал, но этого никто не заметил', en: 'The barometer was falling, but nobody noticed' },
  signalGeneric: { ru: 'Признак: {id}', en: 'Sign: {id}' },
  frontArrived: { ru: 'Пришёл фронт: ветер {wind} уз', en: 'A front came through: wind {wind} kn' },
  departPlanned: { ru: 'План: выход в {time}', en: 'Plan: leave at {time}' },
  routeBusy: { ru: 'Насыщенный маршрут: {nm} миль, переходов: {legs}', en: 'A packed route: {nm} nm in {legs} legs' },
  routeEasy: { ru: 'Спокойный маршрут: {nm} миль, переходов: {legs}', en: 'An easy route: {nm} nm in {legs} legs' },
  reefs: { ru: 'Рифов взято: {n}', en: 'Reefs taken: {n}' },
  shower: { ru: 'Режим душа: {kind}', en: 'Shower discipline: {kind}' },
  autopilot: { ru: 'Автопилот на весь переход', en: 'Autopilot for the whole passage' },
  leg: { ru: '{route}, {mode}: ветер {wind} уз, ход {speed} уз, {hours} ч', en: '{route}, {mode}: wind {wind} kn, speed {speed} kn, {hours} h' },
  zeroStarter: { ru: 'Стартовый аккумулятор сел: прикурка и задержка', en: 'The starter battery was flat: jump start and a delay' },
  zeroFuel: { ru: 'Кончилось топливо', en: 'Ran out of fuel' },
  zeroWater: { ru: 'Кончилась вода', en: 'Ran out of water' },
  zeroService: { ru: 'Сервисный банк разряжен: тёплый холодильник, нет насоса', en: 'Service bank flat: warm fridge, no water pump' },
  zeroGas: { ru: 'Нет газа: холодный ужин', en: 'No gas: a cold dinner' },
  orderOk: { ru: 'Манёвр «{title}»: команды по порядку', en: 'Maneuver "{title}": commands in the right order' },
  orderWrong: { ru: 'Манёвр «{title}»: команды не по порядку', en: 'Maneuver "{title}": commands out of order' },
  injury: { ru: 'Травма в экипаже', en: 'A crew member was injured' },
  refillWater: { ru: 'Заправились водой', en: 'Filled up with water' },
  refillFuel: { ru: 'Заправились топливом', en: 'Filled up with fuel' },
  refillGas: { ru: 'Поменяли газовый баллон', en: 'Swapped the gas bottle' },
  anchorAttempts: { ru: 'Якорь встал, попыток: {n}', en: 'Anchor set after {n} attempt(s)' },
  anchorDragging: { ru: 'Якорь ползёт: ночь без сна', en: 'The anchor dragged: a sleepless night' },
  marinaRefused: { ru: 'Марина отказала: мест нет', en: 'The marina turned us away: no berths' },
  marinaFee: { ru: 'Стоянка в марине: {eur} €', en: 'Marina fee: €{eur}' },
  swim: { ru: 'Остановка на купание', en: 'A swim stop' },
  swimSkipped: { ru: 'Купание отменили: уже темно', en: 'Swim cancelled: it is already dark' },
  taverna: { ru: 'Ужин в таверне', en: 'Dinner at a taverna' },
  rest: { ru: 'Отдых на стоянке, настроение {mood}', en: 'Rest at the anchorage, mood {mood}' },
  nightRolly: { ru: 'Ночь в болтанке', en: 'A rolly night' },
  nightArrival: { ru: 'Пришли в темноте', en: 'Arrived after dark' },
  sailOverpowered: { ru: 'Слишком много парусов: крен, экипаж укачало', en: 'Overpowered: heeling hard, the crew got seasick' },
  sailBreak: { ru: 'Порвали парус', en: 'Tore a sail' },
  sailReefUnderway: { ru: 'Брали риф на ходу в сильный ветер', en: 'Reefed underway in a strong wind' },
  moodPerDay: { ru: 'Бытовое неудобство: настроение {mood}', en: 'Daily discomfort: mood {mood}' },
  eventHappened: { ru: 'Событие: {text}', en: 'Event: {text}' },
  eventOption: { ru: 'Решение: {option}', en: 'Decision: {option}' },
  chose: { ru: 'Выбрали: {option}', en: 'Chose: {option}' },
  checkPassed: { ru: 'Проверка «{voice}» удалась (шанс {chance}%)', en: '{voice} check passed ({chance}% chance)' },
  checkFailed: { ru: 'Проверка «{voice}» провалилась (шанс {chance}%)', en: '{voice} check failed ({chance}% chance)' },
  returnOnTime: { ru: 'Вернулись на базу вовремя', en: 'Back at base on time' },
  returnLate: { ru: 'Не успели на базу к сроку', en: 'Missed the base deadline' },
  lateFee: { ru: 'Штраф за опоздание: {eur} €', en: 'Late return fee: €{eur}' },
  depositCharged: { ru: 'С депозита удержали: {what}', en: 'Deducted from the deposit: {what}' },
  unknown: { ru: 'Запись: {cause}', en: 'Entry: {cause}' },
});
```

- [ ] **Step 3: Ресурсы и проекция карты**

`src/ui/view/resources.ts`:

```ts
import { resourceReadout, type Content, type GameState, type Lang, type Resources } from '../../engine';
import { COMMON } from '../i18n/common';
import { fmt } from '../i18n/t';
import { RESOURCE_NAMES, UNITS } from './strings';

export type ResourceKey = keyof Resources;
export type Level = 'ok' | 'low' | 'critical';
export interface ResourceRow { key: ResourceKey; label: string; value: string; share: number | null; level: Level }

/** Display thresholds (share of capacity) for colouring meters. UI only, not game balance. */
export const LOW_SHARE = 0.3;
export const CRITICAL_SHARE = 0.1;
/** Rounding step of the rough readout a captain without a trained Mechanic gets. */
const APPROX_STEP = { waterL: 50, fuelL: 20, serviceBankPct: 10, starterBankPct: 10, gasPct: 10 } as const;
type Gauge = keyof typeof APPROX_STEP;
const PCT = 100;

function levelFor(share: number, inverted = false): Level {
  const s = inverted ? 1 - share : share;
  return s < CRITICAL_SHARE ? 'critical' : s < LOW_SHARE ? 'low' : 'ok';
}

export function resourceRows(game: GameState, content: Content, lang: Lang): ResourceRow[] {
  const boat = content.boats.find((b) => b.id === game.boatId) ?? null;
  const r = game.resources;
  const name = (k: ResourceKey): string => RESOURCE_NAMES[k][lang];
  const gauge = (key: Gauge, capacity: number | null, unit: string): ResourceRow => {
    const share = capacity ? r[key] / capacity : null;
    const value = resourceReadout(r[key], unit, APPROX_STEP[key], game.voices.mechanic, content.balance);
    return { key, label: name(key), value, share, level: share === null ? 'ok' : levelFor(share) };
  };
  return [
    gauge('waterL', boat?.waterTankL ?? null, UNITS.liters[lang]),
    gauge('fuelL', boat?.fuelTankL ?? null, UNITS.liters[lang]),
    gauge('serviceBankPct', PCT, '%'),
    gauge('starterBankPct', PCT, '%'),
    gauge('gasPct', PCT, '%'),
    { key: 'moneyEur', label: name('moneyEur'), value: fmt(COMMON.euro[lang], { n: Math.round(r.moneyEur) }), share: null, level: r.moneyEur < 0 ? 'critical' : 'ok' },
    { key: 'mood', label: name('mood'), value: `${Math.round(r.mood)}/${PCT}`, share: r.mood / PCT, level: levelFor(r.mood / PCT) },
    { key: 'fatigue', label: name('fatigue'), value: `${Math.round(r.fatigue)}/${PCT}`, share: r.fatigue / PCT, level: levelFor(r.fatigue / PCT, true) },
  ];
}
```

`src/ui/view/map.ts`:

```ts
import type { Content, Lang, MapPoint, Route } from '../../engine';

export interface Bounds { minX: number; maxX: number; minY: number; maxY: number }
export interface Projection { width: number; height: number; toSvg(p: { x: number; y: number }): { x: number; y: number } }

export function mapBounds(points: readonly { x: number; y: number }[], padNm = 3): Bounds {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs) - padNm, maxX: Math.max(...xs) + padNm, minY: Math.min(...ys) - padNm, maxY: Math.max(...ys) + padNm };
}

/** Nautical miles → SVG pixels, north up (map y grows north, SVG y grows down). */
export function projection(b: Bounds, pxPerNm = 24): Projection {
  return {
    width: (b.maxX - b.minX) * pxPerNm,
    height: (b.maxY - b.minY) * pxPerNm,
    toSvg: (p) => ({ x: (p.x - b.minX) * pxPerNm, y: (b.maxY - p.y) * pxPerNm }),
  };
}

export function routesFrom(content: Content, pointId: string): Array<{ route: Route; to: MapPoint }> {
  return content.routes.flatMap((route) => {
    const toId = route.from === pointId ? route.to : route.to === pointId ? route.from : null;
    const to = toId ? content.map.find((p) => p.id === toId) : undefined;
    return to ? [{ route, to }] : [];
  });
}

export function routeBetween(content: Content, a: string, b: string): Route | null {
  return content.routes.find((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a)) ?? null;
}

export function pointName(content: Content, id: string, lang: Lang): string {
  return content.map.find((p) => p.id === id)?.name[lang] ?? id;
}
```

- [ ] **Step 4: Бортжурнал**

`src/ui/view/logbook.ts`:

```ts
import { formatClock, type Content, type Lang, type LogEntry, type LogKind, type Pillar } from '../../engine';
import { CHECKPOINT_NAMES, DAMAGE_NAMES, label, VOICE_NAMES } from '../i18n/glossary';
import { fmt, type Vars } from '../i18n/t';
import { formatHour, signed } from './format';
import { pointName } from './map';
import { LOG, MODE_NAMES, SHOWER_NAMES, SIGNAL_NAMES } from './strings';

export type Tone = 'neutral' | 'good' | 'bad';
export interface LogLine { day: number; clock: string; text: string; tone: Tone; kind: LogKind; cause: string; pillar?: Pillar }

type Described = { text: string; tone?: Tone } | null;
type Describer = (parts: string[], e: LogEntry, c: Content, lang: Lang) => Described;
type LogKey = keyof typeof LOG;

const say = (key: LogKey, lang: Lang, vars: Vars = {}, tone: Tone = 'neutral'): Described => ({ text: fmt(LOG[key][lang], vars), tone });
const num = (e: LogEntry, k: string): number => Number(e.data?.[k] ?? 0);
const firstSentence = (s: string): string => s.split(/(?<=[.!?…])\s/)[0] ?? s;

function defectText(c: Content, id: string, lang: Lang): string {
  return c.boats.flatMap((b) => b.hiddenDefects).find((d) => d.id === id)?.description[lang] ?? label(DAMAGE_NAMES, id, lang);
}
function topicTitle(c: Content, id: string, lang: Lang): string {
  return c.briefing.find((t) => t.id === id)?.title[lang] ?? id;
}
function optionText(c: Content, eventId: string, optionId: string, lang: Lang): string {
  return c.events.find((e) => e.id === eventId)?.options.find((o) => o.id === optionId)?.text[lang] ?? optionId;
}
function maneuverTitle(c: Content, id: string, lang: Lang): string {
  return c.maneuvers.find((m) => m.id === id)?.title[lang] ?? id;
}
function routeName(c: Content, id: string, lang: Lang): string {
  const r = c.routes.find((x) => x.id === id);
  return r ? `${pointName(c, r.from, lang)} — ${pointName(c, r.to, lang)}` : id;
}

const DESCRIBE: Record<string, Describer> = {
  boat: ([, id = ''], _e, c, lang) => say('boatChosen', lang, { name: c.boats.find((b) => b.id === id)?.name[lang] ?? id }),
  checkin: ([verb, id = ''], _e, c, lang) => {
    if (verb === 'found') return say('defectFound', lang, { what: defectText(c, id, lang) }, 'good');
    return say(verb === 'check' ? 'checked' : 'skipped', lang, { what: label(CHECKPOINT_NAMES, id, lang) });
  },
  defect: ([, id = ''], _e, c, lang) => say('defectHidden', lang, { what: defectText(c, id, lang) }, 'bad'),
  briefing: ([verb, id = ''], _e, c, lang) => say(verb === 'topic' ? 'briefed' : 'notBriefed', lang, { what: topicTitle(c, id, lang) }),
  voices: () => null,
  dialogue: ([id = ''], _e, c, lang) => {
    const d = c.dialogues.find((x) => x.id === id);
    return d ? say('said', lang, { said: d.said[lang], heard: d.heard[lang] }) : null;
  },
  promise: ([id = '', status], _e, c, lang) => {
    const heard = c.dialogues.find((x) => x.id === id)?.heard[lang] ?? id;
    return status === 'kept' ? say('promiseKept', lang, { heard }, 'good') : say('promiseBroken', lang, { heard }, 'bad');
  },
  barometer: ([v], _e, _c, lang) => say(v === 'open' ? 'barometerOpen' : 'barometerIgnored', lang),
  signal: ([id = ''], e, _c, lang) => {
    if (id === 'front') return e.data?.seen === true ? say('frontSignalSeen', lang, { trend: num(e, 'barometerTrendHpa') }) : say('frontSignalMissed', lang);
    const known = SIGNAL_NAMES[id];
    return known ? { text: known[lang] } : say('signalGeneric', lang, { id });
  },
  weather: (_p, e, _c, lang) => say('frontArrived', lang, { wind: num(e, 'windKn') }, 'bad'),
  plan: ([what, v = ''], e, _c, lang) => {
    if (what === 'depart') return say('departPlanned', lang, { time: formatHour(num(e, 'hour')) });
    if (what === 'route') return say(v === 'busy' ? 'routeBusy' : 'routeEasy', lang, { nm: num(e, 'distanceNm'), legs: num(e, 'legs') });
    if (what === 'reefs') return say('reefs', lang, { n: v });
    if (what === 'shower') return say('shower', lang, { kind: SHOWER_NAMES[v as keyof typeof SHOWER_NAMES]?.[lang] ?? v });
    if (what === 'autopilot') return say('autopilot', lang);
    return null;
  },
  leg: ([routeId = ''], e, c, lang) => say('leg', lang, {
    route: routeName(c, routeId, lang),
    mode: MODE_NAMES[e.data?.mode === 'sail' ? 'sail' : 'motor'][lang],
    wind: num(e, 'windKn'), speed: num(e, 'speedKn'), hours: Math.round(num(e, 'hours') * 10) / 10,
  }),
  engine: () => null,
  zero: ([res], _e, _c, lang) => {
    const key = ({ starter: 'zeroStarter', fuel: 'zeroFuel', water: 'zeroWater', service: 'zeroService', gas: 'zeroGas' } as const)[res as 'fuel'];
    return key ? say(key, lang, {}, 'bad') : null;
  },
  order: ([ok, id = ''], _e, c, lang) => say(ok === 'ok' ? 'orderOk' : 'orderWrong', lang, { title: maneuverTitle(c, id, lang) }, ok === 'ok' ? 'good' : 'bad'),
  maneuver: ([mId, errId], _e, c, lang) => {
    const err = c.maneuvers.find((m) => m.id === mId)?.errors.find((x) => x.id === errId);
    return { text: err?.text[lang] ?? `${mId}: ${errId}`, tone: 'bad' };
  },
  injury: (_p, _e, _c, lang) => say('injury', lang, {}, 'bad'),
  fatigue: () => null,
  consumption: () => null,
  charge: () => null,
  refill: ([what], _e, _c, lang) => say(what === 'fuel' ? 'refillFuel' : what === 'gas' ? 'refillGas' : 'refillWater', lang),
  anchor: ([what, n = '1'], _e, _c, lang) => (what === 'dragging' ? say('anchorDragging', lang, {}, 'bad') : say('anchorAttempts', lang, { n })),
  marina: ([what], e, _c, lang) => (what === 'refused' ? say('marinaRefused', lang, {}, 'bad') : say('marinaFee', lang, { eur: Math.abs(e.delta?.moneyEur ?? 0) })),
  activity: ([what], _e, _c, lang) => {
    if (what === 'swim_skipped') return say('swimSkipped', lang, {}, 'bad');
    return say(what === 'taverna' ? 'taverna' : 'swim', lang, {}, 'good');
  },
  rest: (_p, e, _c, lang) => say('rest', lang, { mood: signed(e.delta?.mood ?? 0) }, 'good'),
  night: ([what], _e, _c, lang) => {
    if (what === 'rolly') return say('nightRolly', lang, {}, 'bad');
    return what === 'arrival' ? say('nightArrival', lang, {}, 'bad') : null;
  },
  sail: ([what], _e, _c, lang) => {
    const key = ({ overpowered: 'sailOverpowered', break: 'sailBreak', reef_underway: 'sailReefUnderway' } as const)[what as 'break'];
    return key ? say(key, lang, {}, 'bad') : null;
  },
  mood_per_day: (_p, e, _c, lang) => say('moodPerDay', lang, { mood: signed(e.delta?.mood ?? 0) }, 'bad'),
  event: ([eventId = '', optionId, tag], _e, c, lang) => {
    if (!optionId) return say('eventHappened', lang, { text: firstSentence(c.events.find((x) => x.id === eventId)?.text[lang] ?? eventId) });
    return say('eventOption', lang, { option: optionText(c, eventId, optionId, lang) }, tag === 'fail' ? 'bad' : tag === 'success' ? 'good' : 'neutral');
  },
  choice: ([eventId = '', optionId = ''], _e, c, lang) => say('chose', lang, { option: optionText(c, eventId, optionId, lang) }),
  check: ([eventId = '', optionId = ''], e, c, lang) => {
    const voice = c.events.find((x) => x.id === eventId)?.options.find((o) => o.id === optionId)?.check?.voice;
    const vars = { voice: voice ? VOICE_NAMES[voice][lang] : '?', chance: Math.round(num(e, 'chance') * 100) };
    return e.data?.success === true ? say('checkPassed', lang, vars, 'good') : say('checkFailed', lang, vars, 'bad');
  },
  return: ([what], e, _c, lang) => {
    if (what === 'late_fee') return say('lateFee', lang, { eur: Math.abs(e.delta?.moneyEur ?? 0) }, 'bad');
    return what === 'on_time' ? say('returnOnTime', lang, {}, 'good') : say('returnLate', lang, {}, 'bad');
  },
  deposit: ([, id = ''], _e, c, lang) => say('depositCharged', lang, { what: defectText(c, id, lang) }, 'bad'),
};

export function describeEntry(e: LogEntry, content: Content, lang: Lang): LogLine | null {
  const [root = '', ...parts] = e.cause.split(':');
  const describer = DESCRIBE[root];
  const d = describer ? describer(parts, e, content, lang) : say('unknown', lang, { cause: e.cause });
  if (!d) return null;
  return { day: e.day, clock: formatClock(e.clockMin), text: d.text, tone: d.tone ?? 'neutral', kind: e.kind, cause: e.cause, ...(e.pillar ? { pillar: e.pillar } : {}) };
}

const NOISE_ROOTS = new Set(['voices', 'engine', 'fatigue', 'consumption', 'charge', 'defect', 'choice']);

/** Entries the captain did not witness or that only duplicate another line. Debrief still uses them. */
export function isNoise(e: LogEntry): boolean {
  const [root = '', verb] = e.cause.split(':');
  if (NOISE_ROOTS.has(root)) return true;
  if ((root === 'checkin' || root === 'briefing') && verb === 'skip') return true;
  if (root === 'plan' && verb === 'mode') return true;
  if (root === 'night' && verb === 'sleep') return true;
  return root === 'signal' && e.data?.seen === false;
}

export function dayLines(log: readonly LogEntry[], day: number, content: Content, lang: Lang): LogLine[] {
  return log.filter((e) => e.day === day && !isNoise(e)).flatMap((e) => describeEntry(e, content, lang) ?? []);
}

export function logbookDays(log: readonly LogEntry[], content: Content, lang: Lang): Array<{ day: number; lines: LogLine[] }> {
  const days = [...new Set(log.map((e) => e.day))].sort((a, b) => a - b);
  return days.map((day) => ({ day, lines: dayLines(log, day, content, lang) })).filter((d) => d.lines.length > 0);
}
```

Если файл перевалит за 400 строк, вынеси `DESCRIBE` в `src/ui/view/describers.ts`.

- [ ] **Step 5: `ResourcePanel`**

`src/ui/components/ResourcePanel.tsx`:

```tsx
import { formatClock } from '../../engine';
import { COMMON } from '../i18n/common';
import { DAMAGE_NAMES, label } from '../i18n/glossary';
import { useGame, useT } from '../session/SessionContext';
import { pointName } from '../view/map';
import { resourceRows } from '../view/resources';
import { VIEW } from '../view/strings';
import styles from './ResourcePanel.module.css';

export function ResourcePanel() {
  const { game, content, lang } = useGame();
  const t = useT(VIEW);
  const tc = useT(COMMON);
  const rows = resourceRows(game, content, lang);
  const damages = game.damages.map((d) => label(DAMAGE_NAMES, d, lang)).join(', ');
  return (
    <section className={styles.panel} aria-label={t('resources')}>
      <p className={styles.day}>{tc('dayOf', { n: game.day, total: content.balance.schedule.days })}</p>
      <p className={styles.where}>{t('at', { place: pointName(content, game.locationId, lang), clock: formatClock(game.clockMin) })}</p>
      <ul className={styles.list}>
        {rows.map((r) => (
          <li key={r.key} className={styles.row} data-level={r.level}>
            <span className={styles.label}>{r.label}</span>
            <span className={`${styles.value} mono`}>{r.value}</span>
            {r.share !== null && (
              <span className={styles.bar} aria-hidden="true">
                <span className={styles.fill} style={{ width: `${Math.max(0, Math.min(1, r.share)) * 100}%` }} />
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className={styles.damage}>{damages ? t('damages', { list: damages }) : t('noDamage')}</p>
    </section>
  );
}
```

`src/ui/components/ResourcePanel.module.css`:

```css
.panel { display: grid; gap: var(--space-2); }
.day { margin: 0; font-family: var(--font-hand); font-size: var(--text-xl); }
.where { margin: 0; color: var(--fg-soft); }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
.row { display: grid; grid-template-columns: 1fr auto; gap: 2px var(--space-2); font-size: var(--text-sm); }
.label { color: var(--fg-soft); }
.value { text-align: right; }
.bar { grid-column: 1 / -1; height: 4px; background: var(--line); border-radius: 2px; overflow: hidden; }
.fill { display: block; height: 100%; background: var(--accent); transition: width var(--duration); }
.row[data-level='low'] .fill { background: var(--warn); }
.row[data-level='critical'] .fill { background: var(--bad); }
.row[data-level='critical'] .value { color: var(--bad); font-weight: 700; }
.damage { margin: 0; font-size: var(--text-sm); color: var(--fg-soft); }
```

- [ ] **Step 6: Запустить тесты**

Run: `npx vitest run tests/ui/view tests/ui/components/ResourcePanel.test.tsx tests/ui/i18n.test.ts`
Expected: PASS. Если тест «describes every entry» нашёл причину без описателя (текст `Запись: …`), добавь описатель в `DESCRIBE`, а не правь тест.

Run: `npm run typecheck`
Expected: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add src/ui/view src/ui/components/ResourcePanel.tsx src/ui/components/ResourcePanel.module.css tests/ui/view tests/ui/components/ResourcePanel.test.tsx
git commit -m "feat: add UI view layer for resources, logbook lines and map projection"
```

---

### Task 4: Общие компоненты — голоса, построчный текст, роза ветров, reduced motion

**Files:**
- Create: `src/ui/components/motion.ts`
- Create: `src/ui/components/voices/icons.tsx`, `src/ui/components/voices/VoiceBadge.tsx`, `src/ui/components/voices/VoiceLine.tsx`, `src/ui/components/voices/Voice.module.css`
- Create: `src/ui/components/Typewriter.tsx`, `src/ui/components/Typewriter.module.css`
- Create: `src/ui/components/WindRose.tsx`, `src/ui/components/WindRose.module.css`
- Test: `tests/ui/components/Typewriter.test.tsx`, `tests/ui/components/voices.test.tsx`, `tests/ui/components/WindRose.test.tsx`

**Interfaces:**
- Consumes: `VOICE_NAMES` (glossary), `COMMON`, `useLang, useT` (Task 1), `DIRS, Dir8, VoiceId` из движка; `renderWithSession` (тесты).
- Produces:
  - `prefersReducedMotion(): boolean`, `useReducedMotion(): boolean` (`motion.ts`)
  - `<VoiceIcon voice size? />` (`voices/icons.tsx`), `<VoiceBadge voice level? />`, `<VoiceLine voice text />`, `FALSE_VOICES` (`voices/*`)
  - `<Typewriter text msPerLine? className? />`, `splitLines(text): string[]` (`Typewriter.tsx`)
  - `<WindRose dir kn gustKn? size? />`, `downwindDeg(dir): number` (`WindRose.tsx`)

**Правило Typewriter.** Весь текст всегда лежит в DOM (для скринридеров и тестов). Ещё не показанные строки получают `data-shown="false"` и прозрачность 0. Клик по тексту показывает всё сразу. При `prefers-reduced-motion` текст показан целиком сразу.

- [ ] **Step 1: Написать падающие тесты**

`tests/ui/components/Typewriter.test.tsx`:

```tsx
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { splitLines, Typewriter } from '../../../src/ui/components/Typewriter';

const TEXT = 'Ветер свежеет. На западе тучи! Что делаем?';
const shownFlags = (c: HTMLElement) => [...c.querySelectorAll('[data-shown]')].map((n) => n.getAttribute('data-shown'));

describe('Typewriter', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('splits text into sentences', () => {
    expect(splitLines(TEXT)).toEqual(['Ветер свежеет.', 'На западе тучи!', 'Что делаем?']);
  });

  it('reveals one line per tick and keeps the full text in the DOM', () => {
    vi.useFakeTimers();
    const { container, getByText } = render(<Typewriter text={TEXT} msPerLine={500} />);
    expect(getByText(/Что делаем\?/)).toBeInTheDocument();
    expect(shownFlags(container)).toEqual(['true', 'false', 'false']);
    act(() => { vi.advanceTimersByTime(500); });
    expect(shownFlags(container)).toEqual(['true', 'true', 'false']);
    act(() => { vi.advanceTimersByTime(500); });
    expect(shownFlags(container)).toEqual(['true', 'true', 'true']);
  });

  it('click shows everything at once', () => {
    const { container } = render(<Typewriter text={TEXT} />);
    fireEvent.click(container.firstElementChild!);
    expect(shownFlags(container)).toEqual(['true', 'true', 'true']);
  });

  it('shows everything at once when the user prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener: () => {}, removeEventListener: () => {} }));
    const { container } = render(<Typewriter text={TEXT} />);
    expect(shownFlags(container)).toEqual(['true', 'true', 'true']);
  });
});
```

`tests/ui/components/voices.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VoiceBadge } from '../../../src/ui/components/voices/VoiceBadge';
import { VoiceLine } from '../../../src/ui/components/voices/VoiceLine';
import { renderWithSession } from '../render';

describe('voices', () => {
  it('badge shows the localized voice name and level', () => {
    renderWithSession(<VoiceBadge voice="mechanic" level={3} />, null, 'en');
    expect(screen.getByText('Mechanic')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('line marks false voices', () => {
    const { container } = renderWithSession(<VoiceLine voice="pride" text="Не позорься." />);
    expect(screen.getByText('Не позорься.')).toBeInTheDocument();
    expect(container.querySelector('[data-voice="pride"]')?.getAttribute('data-false')).toBe('true');
  });
});
```

`tests/ui/components/WindRose.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { downwindDeg, WindRose } from '../../../src/ui/components/WindRose';
import { renderWithSession } from '../render';

describe('WindRose', () => {
  it('points the arrow downwind', () => {
    expect(downwindDeg('N')).toBe(180);
    expect(downwindDeg('NW')).toBe(135);
    expect(downwindDeg('S')).toBe(0);
  });

  it('labels direction, wind and gusts', () => {
    renderWithSession(<WindRose dir="NW" kn={12} gustKn={18} />);
    expect(screen.getByRole('img', { name: /NW.*12.*18/ })).toBeInTheDocument();
  });
});
```

Run: `npx vitest run tests/ui/components`
Expected: FAIL — `Failed to resolve import "../../../src/ui/components/Typewriter"`.

- [ ] **Step 2: Reduced motion и Typewriter**

`src/ui/components/motion.ts`:

```ts
import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(QUERY);
    const onChange = (): void => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
```

`src/ui/components/Typewriter.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from './motion';
import styles from './Typewriter.module.css';

/** Sentences: split after . ! ? … or a closing quote followed by whitespace. */
export function splitLines(text: string): string[] {
  return text.split(/(?<=[.!?…»"])\s+/).filter((l) => l.length > 0);
}

export interface TypewriterProps { text: string; msPerLine?: number; className?: string }

/** ТЗ 6.2: text appears line by line. The whole text stays in the DOM; click reveals the rest. */
export function Typewriter({ text, msPerLine = 700, className }: TypewriterProps) {
  const reduced = useReducedMotion();
  const lines = useMemo(() => splitLines(text), [text]);
  const [shown, setShown] = useState(reduced ? lines.length : 1);
  useEffect(() => {
    if (reduced || shown >= lines.length) return undefined;
    const id = window.setTimeout(() => setShown((n) => n + 1), msPerLine);
    return () => window.clearTimeout(id);
  }, [shown, lines.length, msPerLine, reduced]);
  const visible = reduced ? lines.length : shown;
  return (
    <p className={[styles.text, className].filter(Boolean).join(' ')} onClick={() => setShown(lines.length)}>
      {lines.map((line, i) => (
        <span key={i} className={styles.line} data-shown={i < visible ? 'true' : 'false'}>{line} </span>
      ))}
    </p>
  );
}
```

`src/ui/components/Typewriter.module.css`:

```css
.text { margin: 0; font-size: var(--text-lg); line-height: 1.6; cursor: default; }
.line { transition: opacity 600ms ease; }
.line[data-shown='false'] { opacity: 0; }
```

- [ ] **Step 3: Голоса**

`src/ui/components/voices/icons.tsx`:

```tsx
import type { VoiceId } from '../../../engine';

/** 24×24 line glyphs, drawn with currentColor. */
const PATHS: Readonly<Record<VoiceId, string>> = {
  sea_sense: 'M2 15c3-3 5-3 8 0s5 3 8 0 4-2 4-2M2 10c3-3 5-3 8 0s5 3 8 0 4-2 4-2',
  caution: 'M12 3 2 21h20L12 3zm0 6v6m0 3v1',
  order: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  mechanic: 'M14 6a4 4 0 0 0 5 5l-9 9-3-3 9-9a4 4 0 0 0-2-2z',
  diplomat: 'M4 5h16v10H9l-5 4V5z',
  economist: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm3 6h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9m3-10v2m0 8v2',
  pride: 'M3 18h18L19 8l-4 4-3-6-3 6-4-4-2 10z',
  crew_voice: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5m0-5c1-.6 1.6-1 2-1 3 0 6 2 6 5',
};

export function VoiceIcon({ voice, size = 20 }: { voice: VoiceId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[voice]} />
    </svg>
  );
}
```

`src/ui/components/voices/VoiceBadge.tsx`:

```tsx
import type { VoiceId } from '../../../engine';
import { VOICE_NAMES } from '../../i18n/glossary';
import { useLang } from '../../session/SessionContext';
import { VoiceIcon } from './icons';
import styles from './Voice.module.css';

/** ТЗ 4.2: Pride and Economist are false voices — styled apart so the player learns to doubt them. */
export const FALSE_VOICES: readonly VoiceId[] = ['pride', 'economist'];

export function VoiceBadge({ voice, level }: { voice: VoiceId; level?: number }) {
  const lang = useLang();
  return (
    <span className={styles.badge} data-voice={voice} data-false={FALSE_VOICES.includes(voice) ? 'true' : 'false'}>
      <VoiceIcon voice={voice} />
      <span className={styles.name}>{VOICE_NAMES[voice][lang]}</span>
      {level !== undefined && <span className={`${styles.level} mono`}>{level}</span>}
    </span>
  );
}
```

`src/ui/components/voices/VoiceLine.tsx`:

```tsx
import type { VoiceId } from '../../../engine';
import { FALSE_VOICES, VoiceBadge } from './VoiceBadge';
import styles from './Voice.module.css';

/** A voice speaking inside a scene, like a line of dialogue (ТЗ 6.1, «Сцена события»). */
export function VoiceLine({ voice, text }: { voice: VoiceId; text: string }) {
  return (
    <blockquote className={styles.line} data-voice={voice} data-false={FALSE_VOICES.includes(voice) ? 'true' : 'false'}>
      <VoiceBadge voice={voice} />
      <p className={styles.quote}>{text}</p>
    </blockquote>
  );
}
```

`src/ui/components/voices/Voice.module.css`:

```css
.badge {
  display: inline-flex; align-items: center; gap: var(--space-1);
  font-variant: small-caps; letter-spacing: 0.04em; color: var(--accent);
}
.badge[data-false='true'] { color: var(--bad); }
.name { font-weight: 700; }
.level { padding: 0 var(--space-1); border: 1px solid currentColor; border-radius: 3px; font-size: var(--text-sm); }
.line { margin: 0; padding: var(--space-2) var(--space-3); border-left: 3px solid var(--accent); background: var(--panel); }
.line[data-false='true'] { border-left-color: var(--bad); font-style: italic; }
.quote { margin: var(--space-1) 0 0; }
```

- [ ] **Step 4: Роза ветров**

`src/ui/components/WindRose.tsx`:

```tsx
import { DIRS, type Dir8 } from '../../engine';
import { COMMON } from '../i18n/common';
import { useT } from '../session/SessionContext';
import styles from './WindRose.module.css';

const STEP_DEG = 360 / DIRS.length;

/** Wind is named for where it comes FROM; the arrow points where it blows TO. */
export const downwindDeg = (dir: Dir8): number => (DIRS.indexOf(dir) * STEP_DEG + 180) % 360;

export interface WindRoseProps { dir: Dir8; kn: number; gustKn?: number; size?: number }

export function WindRose({ dir, kn, gustKn, size = 96 }: WindRoseProps) {
  const t = useT(COMMON);
  const speed = gustKn !== undefined ? `${t('knots', { n: kn })} (${gustKn})` : t('knots', { n: kn });
  const caption = `${dir} ${speed}`;
  return (
    <figure className={styles.rose}>
      <svg width={size} height={size} viewBox="-50 -50 100 100" role="img" aria-label={caption}>
        <circle className={styles.ring} r="44" />
        {DIRS.map((d, i) => (
          <line key={d} className={styles.tick} x1="0" y1="-44" x2="0" y2={i % 2 ? -38 : -34} transform={`rotate(${i * STEP_DEG})`} />
        ))}
        <text className={styles.north} y="-26" textAnchor="middle">N</text>
        <g transform={`rotate(${downwindDeg(dir)})`}>
          <line className={styles.shaft} x1="0" y1="-30" x2="0" y2="26" />
          <path className={styles.head} d="M0 34 L-7 20 L7 20 Z" />
        </g>
      </svg>
      <figcaption className={`${styles.caption} mono`}>{caption}</figcaption>
    </figure>
  );
}
```

`src/ui/components/WindRose.module.css`:

```css
.rose { margin: 0; display: inline-grid; justify-items: center; gap: var(--space-1); }
.ring { fill: var(--panel); stroke: var(--fg-soft); stroke-width: 1; }
.tick { stroke: var(--fg-soft); stroke-width: 1; }
.north { font-family: var(--font-hand); font-size: 14px; fill: var(--fg); }
.shaft { stroke: var(--accent); stroke-width: 3; stroke-linecap: round; }
.head { fill: var(--accent); }
.caption { font-size: var(--text-sm); }
```

- [ ] **Step 5: Запустить тесты**

Run: `npx vitest run tests/ui/components && npm run typecheck`
Expected: PASS, tsc без ошибок.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/motion.ts src/ui/components/voices src/ui/components/Typewriter.tsx src/ui/components/Typewriter.module.css src/ui/components/WindRose.tsx src/ui/components/WindRose.module.css tests/ui/components
git commit -m "feat: add voice badges, line-by-line text and wind rose components"
```

---

### Task 5: Главное меню — новая неделя, продолжить, язык, seed

**Files:**
- Modify (заменить заглушку): `src/ui/screens/menu/MenuScreen.tsx`
- Create: `src/ui/screens/menu/strings.ts`, `src/ui/screens/menu/Menu.module.css`
- Test: `tests/ui/screens/MenuScreen.test.tsx`

**Interfaces:**
- Consumes: `ScreenFrame, Button, SceneArt`, `useSession, useAct, useT, useLang`, `readSave, clearSave` (Task 1), `COMMON`.
- Produces: `MenuScreen` (`data-screen="menu"`).

**Поведение (ТЗ 6.1, «Главное меню»):**
- Сцена `marina_dawn` (заглушка `SceneArt`).
- «Новая неделя»: случайный seed (`Math.floor(Math.random() * 2 **31)`) или seed из поля «Seed недели» в блоке «Настройки» (`<details>`). Seed нужен, чтобы повторить неделю (ТЗ 5.3).
- «Продолжить» активна, только если `readSave(...).kind === 'ok'`. Подпись: «День N · сохранено ДД.ММ ЧЧ:ММ». При `corrupt` показывается «Сохранение повреждено» и кнопка «Удалить сохранение» (`clearSave`).
- Переключатель языка RU / EN (`set_lang`), две кнопки с `aria-pressed`.

- [ ] **Step 1: Написать падающий тест**

`tests/ui/screens/MenuScreen.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage, SAVE_KEY, writeSave } from '../../../src/ui/session/save';
import { gameAt } from '../fixtures';
import { renderShell } from '../render';

describe('MenuScreen', () => {
  afterEach(() => vi.restoreAllMocks());

  it('starts a new week with a random seed', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = renderShell(null);
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled();
    await r.user.click(screen.getByRole('button', { name: 'Новая неделя' }));
    expect(r.currentScreen()).toBe('captain');
    expect(r.session().game?.seed).toBe(2 ** 30);
  });

  it('starts a week with a chosen seed', async () => {
    const r = renderShell(null);
    await r.user.click(screen.getByText('Настройки'));
    await r.user.type(screen.getByLabelText('Seed недели'), '4242');
    await r.user.click(screen.getByRole('button', { name: 'Новая неделя' }));
    expect(r.session().game?.seed).toBe(4242);
  });

  it('continues a saved week', async () => {
    const storage = memoryStorage();
    writeSave(storage, gameAt('morning'), new Date('2026-10-19T09:30:00'));
    const r = renderShell(null, { storage });
    expect(screen.getByText(/День 1/)).toBeInTheDocument();
    await r.user.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(r.currentScreen()).toBe('morning');
  });

  it('reports a corrupt save and lets the player delete it', async () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, '{oops');
    const r = renderShell(null, { storage });
    expect(screen.getByText('Сохранение повреждено')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled();
    await r.user.click(screen.getByRole('button', { name: 'Удалить сохранение' }));
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(screen.queryByText('Сохранение повреждено')).toBeNull();
  });

  it('switches the language of the whole menu', async () => {
    const r = renderShell(null);
    await r.user.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByRole('button', { name: 'New week' })).toBeInTheDocument();
    expect(r.session().lang).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
});
```

Run: `npx vitest run tests/ui/screens/MenuScreen.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "Продолжить"`.

- [ ] **Step 2: Строки меню**

`src/ui/screens/menu/strings.ts`:

```ts
import { dict } from '../../i18n/t';

export const MENU = dict({
  tagline: { ru: 'Неделя чартера. Решают вода, время и слова капитана.', en: 'A charter week. Water, time and the skipper\'s words decide it.' },
  newWeek: { ru: 'Новая неделя', en: 'New week' },
  continue: { ru: 'Продолжить', en: 'Continue' },
  savedAt: { ru: 'День {day} · сохранено {when}', en: 'Day {day} · saved {when}' },
  corrupt: { ru: 'Сохранение повреждено', en: 'The save is damaged' },
  deleteSave: { ru: 'Удалить сохранение', en: 'Delete save' },
  settings: { ru: 'Настройки', en: 'Settings' },
  seed: { ru: 'Seed недели', en: 'Week seed' },
  seedHint: { ru: 'Один и тот же seed даёт ту же неделю. Пусто — случайная.', en: 'The same seed gives the same week. Leave empty for a random one.' },
  language: { ru: 'Язык', en: 'Language' },
});
```

- [ ] **Step 3: Экран меню**

`src/ui/screens/menu/MenuScreen.tsx`:

```tsx
import { useState } from 'react';
import type { Lang } from '../../../engine';
import { Button } from '../../components/Button';
import { SceneArt } from '../../components/SceneArt';
import { ScreenFrame } from '../../components/ScreenFrame';
import { COMMON } from '../../i18n/common';
import { useAct, useLang, useSession, useT } from '../../session/SessionContext';
import { clearSave, readSave } from '../../session/save';
import styles from './Menu.module.css';
import { MENU } from './strings';

const SEED_RANGE = 2 ** 31;
const LANGS: readonly Lang[] = ['ru', 'en'];

function parseSeed(raw: string): number | null {
  const n = Number(raw.trim());
  return raw.trim() !== '' && Number.isInteger(n) && n >= 0 ? n : null;
}

export function MenuScreen() {
  const { session, storage } = useSession();
  const act = useAct();
  const lang = useLang();
  const t = useT(MENU);
  const tc = useT(COMMON);
  const [seedText, setSeedText] = useState('');
  const [save, setSave] = useState(() => readSave(storage, session.content));

  const startNew = (): void => act({ type: 'new_game', seed: parseSeed(seedText) ?? Math.floor(Math.random() * SEED_RANGE) });
  const when = save.kind === 'ok'
    ? new Date(save.savedAt).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <ScreenFrame screen="menu" title={tc('appTitle')} subtitle={t('tagline')}>
      <SceneArt scene="marina_dawn" className={styles.scene} />
      <div className={styles.actions}>
        <Button onClick={startNew}>{t('newWeek')}</Button>
        <Button variant="secondary" disabled={save.kind !== 'ok'} onClick={() => save.kind === 'ok' && act({ type: 'load', game: save.game })}>
          {t('continue')}
        </Button>
        {save.kind === 'ok' && <p className={styles.saved}>{t('savedAt', { day: save.game.day, when })}</p>}
        {save.kind === 'corrupt' && (
          <p className={styles.corrupt}>
            {t('corrupt')}{' '}
            <Button variant="ghost" onClick={() => { clearSave(storage); setSave({ kind: 'none' }); }}>{t('deleteSave')}</Button>
          </p>
        )}
      </div>
      <div className={styles.lang} role="group" aria-label={t('language')}>
        {LANGS.map((l) => (
          <Button key={l} variant={l === lang ? 'primary' : 'ghost'} aria-pressed={l === lang} onClick={() => act({ type: 'set_lang', lang: l })}>
            {l.toUpperCase()}
          </Button>
        ))}
      </div>
      <details className={styles.settings}>
        <summary>{t('settings')}</summary>
        <label className={styles.field}>
          <span>{t('seed')}</span>
          <input inputMode="numeric" value={seedText} onChange={(e) => setSeedText(e.target.value)} />
        </label>
        <p className={styles.hint}>{t('seedHint')}</p>
      </details>
    </ScreenFrame>
  );
}
```

`src/ui/screens/menu/Menu.module.css`:

```css
.scene { max-width: 720px; margin-bottom: var(--space-6); }
.actions { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; }
.saved { margin: 0; color: var(--fg-soft); font-family: var(--font-hand); font-size: var(--text-lg); }
.corrupt { margin: 0; color: var(--bad); }
.lang { display: flex; gap: var(--space-2); margin-top: var(--space-6); }
.settings { margin-top: var(--space-6); max-width: 420px; }
.settings summary { cursor: pointer; color: var(--fg-soft); }
.field { display: grid; gap: var(--space-1); margin-top: var(--space-3); }
.field input { font: inherit; font-family: var(--font-mono); padding: var(--space-2); border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); color: var(--fg); }
.hint { font-size: var(--text-sm); color: var(--fg-soft); }
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/ui/screens/MenuScreen.test.tsx tests/ui/i18n.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/menu tests/ui/screens/MenuScreen.test.tsx
git commit -m "feat: add main menu with continue, language switch and week seed"
```

---

### Task 6: Создание капитана и выбор лодки

**Files:**
- Modify (заменить заглушки): `src/ui/screens/captain/CaptainScreen.tsx`, `src/ui/screens/boat/BoatScreen.tsx`
- Create: `src/ui/screens/captain/strings.ts`, `src/ui/screens/captain/Captain.module.css`, `src/ui/screens/boat/strings.ts`, `src/ui/screens/boat/BoatCard.tsx`, `src/ui/screens/boat/Boat.module.css`
- Test: `tests/ui/screens/CaptainScreen.test.tsx`, `tests/ui/screens/BoatScreen.test.tsx`

**Interfaces:**
- Consumes: `TRAINABLE_VOICES, boatOffers, type Boat, type TrainableVoice` из движка; `ScreenFrame, Button`, `useGame, useAct, useT`, `VOICE_NAMES, VOICE_HINTS`, `COMMON` (Task 1). `VoiceIcon` из Task 4 **не используется**: Task 4 идёт параллельно. Иконки голосов на этом экране добавит Task 17.
- Produces: `CaptainScreen` (`data-screen="captain"`), `BoatScreen` (`data-screen="boat"`), `BoatCard`.

**Поведение (ТЗ 3 фазы 1–2, ТЗ 4.2, ТЗ 6.1):**
- Капитан: 6 прокачиваемых голосов, у каждого «−», уровень, «+» и описание из `VOICE_HINTS`. Очков `balance.voices.points` (12), уровень 0..`maxLevel` (4). «+» неактивна, когда очков нет или уровень максимальный. «Дальше» активна при остатке 0. Ниже — Гордость и Голос экипажа с фиксированными уровнями (`prideLevel`, `crewVoiceLevel`) и пометкой «не прокачивается».
- Лодка: карточки из `boatOffers`. «Блестящие» фичи крупно, важное (вода, банки, стартовый отдельно или общий, солнце, генератор, гальюны) мелким шрифтом. Это и есть ловушка ТЗ 2. Цена и депозит. Недоступная по бюджету лодка — кнопка неактивна с пометкой «Не по бюджету».

- [ ] **Step 1: Написать падающие тесты**

`tests/ui/screens/CaptainScreen.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TRAINABLE_VOICES } from '../../../src/engine';
import { VOICE_NAMES } from '../../../src/ui/i18n/glossary';
import { gameAt } from '../fixtures';
import { renderShell } from '../render';

const raise = (voice: (typeof TRAINABLE_VOICES)[number]) => screen.getByRole('button', { name: `Прибавить: ${VOICE_NAMES[voice].ru}` });

describe('CaptainScreen', () => {
  it('distributes 12 points and moves on to the boats', async () => {
    const r = renderShell(gameAt('captain'));
    const next = screen.getByRole('button', { name: 'Дальше' });
    expect(next).toBeDisabled();
    for (const v of TRAINABLE_VOICES) {
      await r.user.click(raise(v));
      await r.user.click(raise(v));
    }
    expect(screen.getByText(/Осталось очков: 0/)).toBeInTheDocument();
    expect(next).toBeEnabled();
    await r.user.click(next);
    expect(r.currentScreen()).toBe('boat');
    expect(r.session().game?.voices.sea_sense).toBe(2);
  });

  it('caps a voice at the max level and never goes below zero', async () => {
    const r = renderShell(gameAt('captain'));
    for (let i = 0; i < 5; i++) await r.user.click(raise('mechanic'));
    expect(raise('mechanic')).toBeDisabled();
    expect(screen.getByRole('button', { name: `Убавить: ${VOICE_NAMES.order.ru}` })).toBeDisabled();
    expect(screen.getByText(/Осталось очков: 8/)).toBeInTheDocument();
  });

  it('shows the fixed voices', () => {
    renderShell(gameAt('captain'));
    expect(screen.getByText('Гордость')).toBeInTheDocument();
    expect(screen.getAllByText('не прокачивается')).toHaveLength(2);
  });
});
```

`tests/ui/screens/BoatScreen.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { content, gameAt } from '../fixtures';
import { renderShell } from '../render';

describe('BoatScreen', () => {
  it('shows every boat with shiny features and the small print', () => {
    const { container } = renderShell(gameAt('boat_select'));
    const cards = container.querySelectorAll('[data-boat]');
    expect(cards).toHaveLength(content.boats.length);
    const aurora = container.querySelector('[data-boat="aurora_45"]') as HTMLElement;
    expect(within(aurora).getByText('Подруливающее устройство')).toBeInTheDocument();
    expect(within(aurora).getByText(/Стартовый и сервисный — один банк/)).toBeInTheDocument();
  });

  it('takes an affordable boat and goes to check-in', async () => {
    const r = renderShell(gameAt('boat_select'));
    const money = r.session().game!.resources.moneyEur;
    await r.user.click(screen.getByRole('button', { name: 'Взять «Мельтеми 40»' }));
    expect(r.currentScreen()).toBe('checkin');
    expect(r.session().game!.resources.moneyEur).toBe(money - 4300);
  });

  it('disables boats over budget', () => {
    const poor = gameAt('boat_select');
    renderShell({ ...poor, resources: { ...poor.resources, moneyEur: 4000 } });
    expect(screen.getByRole('button', { name: 'Взять «Аврора 45»' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Взять «Калипсо 38»' })).toBeEnabled();
    expect(screen.getAllByText('Не по бюджету').length).toBe(2);
  });
});
```

Run: `npx vitest run tests/ui/screens/CaptainScreen.test.tsx tests/ui/screens/BoatScreen.test.tsx`
Expected: FAIL — кнопок «Прибавить: …» и «Взять «…»» нет (на месте заглушки).

- [ ] **Step 2: Экран капитана**

`src/ui/screens/captain/strings.ts`:

```ts
import { dict } from '../../i18n/t';

export const CAPTAIN = dict({
  title: { ru: 'Кто вы как капитан', en: 'What kind of skipper are you' },
  subtitle: { ru: 'Распределите очки по внутренним голосам. Прокачанный голос чаще говорит и видит больше.', en: 'Spread points across your inner voices. A trained voice speaks up more and notices more.' },
  remaining: { ru: 'Осталось очков: {n}', en: 'Points left: {n}' },
  raise: { ru: 'Прибавить: {voice}', en: 'Raise: {voice}' },
  lower: { ru: 'Убавить: {voice}', en: 'Lower: {voice}' },
  fixed: { ru: 'не прокачивается', en: 'cannot be trained' },
  fixedTitle: { ru: 'Эти голоса звучат всегда', en: 'These voices always speak' },
  reset: { ru: 'Сбросить', en: 'Reset' },
});
```

`src/ui/screens/captain/CaptainScreen.tsx`:

```tsx
import { useState } from 'react';
import { TRAINABLE_VOICES, type TrainableVoice } from '../../../engine';
import { Button } from '../../components/Button';
import { ScreenFrame } from '../../components/ScreenFrame';
import { COMMON } from '../../i18n/common';
import { VOICE_HINTS, VOICE_NAMES } from '../../i18n/glossary';
import { useAct, useGame, useT } from '../../session/SessionContext';
import styles from './Captain.module.css';
import { CAPTAIN } from './strings';

type Alloc = Record<TrainableVoice, number>;
const zero = (): Alloc => Object.fromEntries(TRAINABLE_VOICES.map((v) => [v, 0])) as Alloc;

export function CaptainScreen() {
  const { content, lang } = useGame();
  const act = useAct();
  const t = useT(CAPTAIN);
  const tc = useT(COMMON);
  const { points, maxLevel, prideLevel, crewVoiceLevel } = content.balance.voices;
  const [alloc, setAlloc] = useState<Alloc>(zero);
  const remaining = points - TRAINABLE_VOICES.reduce((sum, v) => sum + alloc[v], 0);
  const change = (v: TrainableVoice, d: number): void => setAlloc((a) => ({ ...a, [v]: a[v] + d }));

  return (
    <ScreenFrame
      screen="captain"
      title={t('title')}
      subtitle={t('subtitle')}
      actions={(
        <>
          <Button variant="ghost" onClick={() => setAlloc(zero())}>{t('reset')}</Button>
          <Button disabled={remaining !== 0} onClick={() => act({ type: 'assign_voices', alloc })}>{tc('next')}</Button>
        </>
      )}
    >
      <p className={styles.remaining}>{t('remaining', { n: remaining })}</p>
      <ul className={styles.voices}>
        {TRAINABLE_VOICES.map((v) => (
          <li key={v} className={styles.voice}>
            <div className={styles.head}>
              <strong>{VOICE_NAMES[v][lang]}</strong>
              <span className={styles.stepper}>
                <Button variant="secondary" aria-label={t('lower', { voice: VOICE_NAMES[v][lang] })} disabled={alloc[v] === 0} onClick={() => change(v, -1)}>−</Button>
                <span className={`${styles.level} mono`} aria-live="polite">{alloc[v]}</span>
                <Button variant="secondary" aria-label={t('raise', { voice: VOICE_NAMES[v][lang] })} disabled={remaining === 0 || alloc[v] >= maxLevel} onClick={() => change(v, 1)}>+</Button>
              </span>
            </div>
            <p className={styles.hint}>{VOICE_HINTS[v][lang]}</p>
          </li>
        ))}
      </ul>
      <h2 className={styles.fixedTitle}>{t('fixedTitle')}</h2>
      <ul className={styles.voices}>
        {([['pride', prideLevel], ['crew_voice', crewVoiceLevel]] as const).map(([v, level]) => (
          <li key={v} className={styles.voice} data-fixed="true">
            <div className={styles.head}>
              <strong>{VOICE_NAMES[v][lang]}</strong>
              <span className="mono">{level}</span>
              <em className={styles.fixed}>{t('fixed')}</em>
            </div>
            <p className={styles.hint}>{VOICE_HINTS[v][lang]}</p>
          </li>
        ))}
      </ul>
    </ScreenFrame>
  );
}
```

`src/ui/screens/captain/Captain.module.css`:

```css
.remaining { font-family: var(--font-hand); font-size: var(--text-xl); margin: 0 0 var(--space-4); }
.voices { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3); grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.voice { background: var(--panel); border-radius: var(--radius); padding: var(--space-3) var(--space-4); box-shadow: var(--shadow); }
.voice[data-fixed='true'] { opacity: 0.8; }
.head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.stepper { display: inline-flex; align-items: center; gap: var(--space-2); }
.level { min-width: 1.5em; text-align: center; font-size: var(--text-lg); }
.hint { margin: var(--space-2) 0 0; color: var(--fg-soft); font-size: var(--text-sm); }
.fixedTitle { font-size: var(--text-lg); margin: var(--space-6) 0 var(--space-3); }
.fixed { color: var(--fg-soft); font-size: var(--text-sm); }
```

- [ ] **Step 3: Экран выбора лодки**

`src/ui/screens/boat/strings.ts`:

```ts
import { dict } from '../../i18n/t';

export const BOAT = dict({
  title: { ru: 'Выбор лодки', en: 'Choose a boat' },
  subtitle: { ru: 'Бюджет на неделю: {eur} €. Смотрите не только на крупный шрифт.', en: 'Budget for the week: €{eur}. Read past the big print.' },
  take: { ru: 'Взять «{name}»', en: 'Take "{name}"' },
  tooExpensive: { ru: 'Не по бюджету', en: 'Over budget' },
  price: { ru: 'Аренда: {eur} €', en: 'Charter: €{eur}' },
  deposit: { ru: 'Депозит: {eur} €', en: 'Deposit: €{eur}' },
  smallPrint: { ru: 'Технические данные', en: 'Specifications' },
  size: { ru: '{ft} футов · каюты {cabins} · места {berths}', en: '{ft} ft · {cabins} cabins · {berths} berths' },
  water: { ru: 'Бак воды: {l} л', en: 'Water tank: {l} L' },
  fuel: { ru: 'Топливо: {l} л · мотор {kn} уз', en: 'Fuel: {l} L · engine {kn} kn' },
  bank: { ru: 'Сервисный банк: {ah} А·ч × {n}', en: 'Service bank: {ah} Ah × {n}' },
  starterSeparate: { ru: 'Стартовый аккумулятор отдельный', en: 'Separate starter battery' },
  starterShared: { ru: 'Стартовый и сервисный — один банк', en: 'Starter and service share one bank' },
  solar: { ru: 'Солнечные панели: {w} Вт', en: 'Solar panels: {w} W' },
  noSolar: { ru: 'Солнечных панелей нет', en: 'No solar panels' },
  generator: { ru: 'Генератор есть', en: 'Generator on board' },
  noGenerator: { ru: 'Генератора нет', en: 'No generator' },
  electricToilet: { ru: 'Электрические гальюны (едят заряд)', en: 'Electric heads (they drain the battery)' },
  manualToilet: { ru: 'Ручные гальюны', en: 'Manual heads' },
});
```

`src/ui/screens/boat/BoatCard.tsx`:

```tsx
import type { Boat } from '../../../engine';
import { Button } from '../../components/Button';
import { useLang, useT } from '../../session/SessionContext';
import styles from './Boat.module.css';
import { BOAT } from './strings';

export interface BoatCardProps { boat: Boat; affordable: boolean; onTake: () => void }

/** ТЗ 6.1: shiny features in big type, the things that decide the week in small print. */
export function BoatCard({ boat, affordable, onTake }: BoatCardProps) {
  const lang = useLang();
  const t = useT(BOAT);
  const name = boat.name[lang];
  const facts = [
    t('size', { ft: boat.lengthFt, cabins: boat.cabins, berths: boat.berths }),
    t('water', { l: boat.waterTankL }),
    t('fuel', { l: boat.fuelTankL, kn: boat.motorKn }),
    t('bank', { ah: boat.serviceBankAh, n: boat.serviceBanks }),
    boat.starterSeparate ? t('starterSeparate') : t('starterShared'),
    boat.solarW > 0 ? t('solar', { w: boat.solarW }) : t('noSolar'),
    boat.generator ? t('generator') : t('noGenerator'),
    boat.electricToilet ? t('electricToilet') : t('manualToilet'),
  ];
  return (
    <article className={styles.card} data-boat={boat.id} data-affordable={affordable}>
      <h2 className={styles.name}>{name}</h2>
      <ul className={styles.shiny}>
        {boat.shinyFeatures.map((f) => <li key={f.en}>{f[lang]}</li>)}
      </ul>
      <p className={styles.price}>{t('price', { eur: boat.priceEur })} · {t('deposit', { eur: boat.depositEur })}</p>
      <details className={styles.small} open>
        <summary>{t('smallPrint')}</summary>
        <ul>{facts.map((f) => <li key={f}>{f}</li>)}</ul>
      </details>
      <Button disabled={!affordable} onClick={onTake}>{t('take', { name })}</Button>
      {!affordable && <p className={styles.over}>{t('tooExpensive')}</p>}
    </article>
  );
}
```

`src/ui/screens/boat/BoatScreen.tsx`:

```tsx
import { boatOffers } from '../../../engine';
import { ScreenFrame } from '../../components/ScreenFrame';
import { useAct, useGame, useT } from '../../session/SessionContext';
import { BoatCard } from './BoatCard';
import styles from './Boat.module.css';
import { BOAT } from './strings';

export function BoatScreen() {
  const { game, content } = useGame();
  const act = useAct();
  const t = useT(BOAT);
  return (
    <ScreenFrame screen="boat" title={t('title')} subtitle={t('subtitle', { eur: game.resources.moneyEur })}>
      <div className={styles.grid}>
        {boatOffers(game, content).map(({ boat, affordable }) => (
          <BoatCard key={boat.id} boat={boat} affordable={affordable} onTake={() => act({ type: 'choose_boat', boatId: boat.id })} />
        ))}
      </div>
    </ScreenFrame>
  );
}
```

`src/ui/screens/boat/Boat.module.css`:

```css
.grid { display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.card { display: grid; gap: var(--space-3); align-content: start; background: var(--panel); border-radius: var(--radius); padding: var(--space-4); box-shadow: var(--shadow); }
.card[data-affordable='false'] { opacity: 0.6; }
.name { margin: 0; font-size: var(--text-xl); }
.shiny { margin: 0; padding-left: var(--space-4); font-size: var(--text-lg); line-height: 1.35; }
.price { margin: 0; font-family: var(--font-mono); font-size: var(--text-sm); }
.small { font-size: 0.75rem; color: var(--fg-soft); line-height: 1.4; }
.small summary { cursor: pointer; }
.small ul { margin: var(--space-1) 0 0; padding-left: var(--space-4); }
.over { margin: 0; color: var(--bad); font-size: var(--text-sm); }
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/ui/screens/CaptainScreen.test.tsx tests/ui/screens/BoatScreen.test.tsx tests/ui/i18n.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/captain src/ui/screens/boat tests/ui/screens/CaptainScreen.test.tsx tests/ui/screens/BoatScreen.test.tsx
git commit -m "feat: add captain creation and boat choice screens"
```

---

### Task 7: Приёмка лодки и брифинг экипажа

**Files:**
- Modify (заменить заглушки): `src/ui/screens/checkin/CheckinScreen.tsx`, `src/ui/screens/briefing/BriefingScreen.tsx`
- Create: `src/ui/screens/checkin/strings.ts`, `src/ui/screens/checkin/YachtCutaway.tsx`, `src/ui/screens/checkin/Checkin.module.css`
- Create: `src/ui/screens/briefing/strings.ts`, `src/ui/screens/briefing/Briefing.module.css`
- Test: `tests/ui/screens/CheckinScreen.test.tsx`, `tests/ui/screens/BriefingScreen.test.tsx`

**Interfaces:**
- Consumes: `CHECKPOINTS, type CheckpointId` из движка; `ScreenFrame, Button`, `useGame, useAct, useT`, `CHECKPOINT_NAMES`, `COMMON` (Task 1).
- Produces: `CheckinScreen` (`data-screen="checkin"`), `YachtCutaway`, `BriefingScreen` (`data-screen="briefing"`).

**Поведение (ТЗ 3 фазы 3–4, ТЗ 4.6, 4.7, 6.1):**
- Приёмка: интерактивный разрез яхты (SVG) с точками проверки. Список кнопок `aria-pressed` дублирует точки для клавиатуры и скринридера; SVG-точки при этом `aria-hidden`. Таймер внимания: «Время на приёмку: X из Y мин» (`balance.checkin.budgetMin`, `costMin`). Точку, которая не влезает в остаток, включить нельзя. «Закончить приёмку» отправляет `checkin`; ноль проверок тоже допустим.
- Брифинг: сверху итог приёмки. Найденные дефекты берутся из записей `checkin:found:*`; скрытые не показываются никогда. Затем экипаж за столом (имена и архетипы), ровно `balance.briefing.slots` тем из 8 и до `maxDialogues` первых реплик (диалоги с контекстом `briefing`). У выбранной реплики пузырь «Экипаж услышал: «…»» и сила ожидания (ТЗ 4.7: игра показывает, что экипаж **услышал**). «Начать неделю» активна при полном наборе тем.

- [ ] **Step 1: Написать падающие тесты**

`tests/ui/screens/CheckinScreen.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CHECKPOINT_NAMES } from '../../../src/ui/i18n/glossary';
import { gameAt } from '../fixtures';
import { renderShell } from '../render';

const point = (id: keyof typeof CHECKPOINT_NAMES) => screen.getByRole('button', { name: new RegExp(CHECKPOINT_NAMES[id].ru) });

describe('CheckinScreen', () => {
  it('spends the attention budget and blocks what does not fit', async () => {
    const r = renderShell(gameAt('checkin'));
    expect(screen.getByText('Время на приёмку: 0 из 90 мин')).toBeInTheDocument();
    for (const id of ['impeller', 'sails', 'electrics', 'anchor', 'gas'] as const) await r.user.click(point(id));
    expect(screen.getByText('Время на приёмку: 90 из 90 мин')).toBeInTheDocument();
    expect(point('toilets')).toBeDisabled();
    expect(point('impeller')).toHaveAttribute('aria-pressed', 'true');
    await r.user.click(point('impeller'));
    expect(point('toilets')).toBeEnabled();
  });

  it('finishes check-in and records the checked points', async () => {
    const r = renderShell(gameAt('checkin'));
    await r.user.click(point('toilets'));
    await r.user.click(screen.getByRole('button', { name: 'Закончить приёмку' }));
    expect(r.currentScreen()).toBe('briefing');
    expect(r.session().game!.flags['checkin.toilets']).toBe(true);
  });
});
```

`tests/ui/screens/BriefingScreen.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { content, gameAt } from '../fixtures';
import { renderShell } from '../render';

const topic = (id: string) => screen.getByRole('button', { name: new RegExp(content.briefing.find((t) => t.id === id)!.title.ru) });
const line = (id: string) => screen.getByRole('button', { name: new RegExp(content.dialogues.find((d) => d.id === id)!.said.ru) });

describe('BriefingScreen', () => {
  it('shows what check-in found and never the hidden defects', () => {
    const game = gameAt('briefing');
    renderShell(game);
    const found = game.log.filter((e) => e.cause.startsWith('checkin:found:')).map((e) => e.cause.split(':')[2]);
    const hidden = game.log.filter((e) => e.cause.startsWith('defect:hidden:')).map((e) => e.cause.split(':')[2]);
    const defects = content.boats.flatMap((b) => b.hiddenDefects);
    for (const id of found) expect(screen.getByText(new RegExp(defects.find((d) => d.id === id)!.description.ru))).toBeInTheDocument();
    for (const id of hidden) expect(screen.queryByText(new RegExp(defects.find((d) => d.id === id)!.description.ru))).toBeNull();
  });

  it('needs exactly four topics and starts the week', async () => {
    const r = renderShell(gameAt('briefing'));
    const start = screen.getByRole('button', { name: 'Начать неделю' });
    for (const id of ['captain_only', 'cleats', 'loaded_lines']) await r.user.click(topic(id));
    expect(start).toBeDisabled();
    await r.user.click(topic('toilet'));
    expect(start).toBeEnabled();
    expect(topic('sails')).toBeDisabled();
    await r.user.click(start);
    expect(r.currentScreen()).toBe('morning');
    expect(r.session().game!.flags['briefing.captain_only']).toBe(true);
  });

  it('shows what the crew heard and limits first lines to two', async () => {
    const r = renderShell(gameAt('briefing'));
    await r.user.click(line('early_try'));
    expect(screen.getByText(/Экипаж услышал: «Выходим в 8»/)).toBeInTheDocument();
    await r.user.click(line('ten_bonus'));
    expect(line('decide_morning')).toBeDisabled();
  });
});
```

Run: `npx vitest run tests/ui/screens/CheckinScreen.test.tsx tests/ui/screens/BriefingScreen.test.tsx`
Expected: FAIL (заглушки).

- [ ] **Step 2: Приёмка**

`src/ui/screens/checkin/strings.ts`:

```ts
import { dict } from '../../i18n/t';

export const CHECKIN = dict({
  title: { ru: 'Приёмка лодки', en: 'Boat check-in' },
  subtitle: { ru: 'Базовый менеджер торопится. Что проверите сами? Непроверенное останется сюрпризом.', en: 'The base manager is in a hurry. What will you check yourself? Whatever you skip stays a surprise.' },
  budget: { ru: 'Время на приёмку: {used} из {total} мин', en: 'Check-in time: {used} of {total} min' },
  cost: { ru: '{n} мин', en: '{n} min' },
  finish: { ru: 'Закончить приёмку', en: 'Finish check-in' },
  cutaway: { ru: 'Разрез яхты с точками проверки', en: 'Yacht cutaway with checkpoints' },
});
```

`src/ui/screens/checkin/YachtCutaway.tsx`:

```tsx
import type { CheckpointId } from '../../../engine';
import styles from './Checkin.module.css';

/** Hotspot positions on the 600×220 side cutaway, bow to the right. */
const SPOTS: Readonly<Record<CheckpointId, { x: number; y: number }>> = {
  anchor: { x: 540, y: 118 },
  sails: { x: 330, y: 40 },
  toilets: { x: 450, y: 150 },
  electrics: { x: 370, y: 152 },
  impeller: { x: 270, y: 168 },
  gas: { x: 120, y: 120 },
  damage_photos: { x: 200, y: 186 },
};

export interface YachtCutawayProps {
  checked: ReadonlySet<CheckpointId>;
  disabled: ReadonlySet<CheckpointId>;
  onToggle: (id: CheckpointId) => void;
  label: string;
}

/** Decorative and clickable; the accessible controls are the buttons next to it. */
export function YachtCutaway({ checked, disabled, onToggle, label }: YachtCutawayProps) {
  return (
    <svg className={styles.cutaway} viewBox="0 0 600 220" role="img" aria-label={label}>
      <path className={styles.hull} d="M40 130 L560 120 Q 520 200 420 205 L130 205 Q 60 200 40 130 Z" />
      <line className={styles.mast} x1="330" y1="10" x2="330" y2="125" />
      <path className={styles.sail} d="M334 18 L334 118 L470 118 Z" />
      <line className={styles.deck} x1="40" y1="130" x2="560" y2="120" />
      {(Object.keys(SPOTS) as CheckpointId[]).map((id) => (
        <g
          key={id}
          aria-hidden="true"
          className={styles.spot}
          data-checked={checked.has(id)}
          data-disabled={disabled.has(id)}
          onClick={() => !disabled.has(id) && onToggle(id)}
        >
          <circle cx={SPOTS[id].x} cy={SPOTS[id].y} r="13" />
          <circle className={styles.dot} cx={SPOTS[id].x} cy={SPOTS[id].y} r="4" />
        </g>
      ))}
    </svg>
  );
}
```

`src/ui/screens/checkin/CheckinScreen.tsx`:

```tsx
import { useState } from 'react';
import { CHECKPOINTS, type CheckpointId } from '../../../engine';
import { Button } from '../../components/Button';
import { ScreenFrame } from '../../components/ScreenFrame';
import { CHECKPOINT_NAMES } from '../../i18n/glossary';
import { useAct, useGame, useT } from '../../session/SessionContext';
import styles from './Checkin.module.css';
import { CHECKIN } from './strings';
import { YachtCutaway } from './YachtCutaway';

export function CheckinScreen() {
  const { content, lang } = useGame();
  const act = useAct();
  const t = useT(CHECKIN);
  const { budgetMin, costMin } = content.balance.checkin;
  const [checked, setChecked] = useState<ReadonlySet<CheckpointId>>(new Set());
  const used = [...checked].reduce((sum, id) => sum + costMin[id], 0);
  const disabled = new Set(CHECKPOINTS.filter((id) => !checked.has(id) && used + costMin[id] > budgetMin));
  const toggle = (id: CheckpointId): void => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <ScreenFrame
      screen="checkin"
      title={t('title')}
      subtitle={t('subtitle')}
      actions={<Button onClick={() => act({ type: 'checkin', checkpoints: [...checked] })}>{t('finish')}</Button>}
    >
      <p className={styles.budget}>{t('budget', { used, total: budgetMin })}</p>
      <div className={styles.meter} aria-hidden="true"><span style={{ width: `${(used / budgetMin) * 100}%` }} /></div>
      <YachtCutaway checked={checked} disabled={disabled} onToggle={toggle} label={t('cutaway')} />
      <ul className={styles.points}>
        {CHECKPOINTS.map((id) => (
          <li key={id}>
            <Button variant={checked.has(id) ? 'primary' : 'secondary'} aria-pressed={checked.has(id)} disabled={disabled.has(id)} onClick={() => toggle(id)}>
              {CHECKPOINT_NAMES[id][lang]} · <span className="mono">{t('cost', { n: costMin[id] })}</span>
            </Button>
          </li>
        ))}
      </ul>
    </ScreenFrame>
  );
}
```

`src/ui/screens/checkin/Checkin.module.css`:

```css
.budget { font-family: var(--font-hand); font-size: var(--text-xl); margin: 0; }
.meter { height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; margin: var(--space-2) 0 var(--space-4); }
.meter span { display: block; height: 100%; background: var(--warn); transition: width var(--duration); }
.cutaway { width: 100%; max-width: 720px; display: block; margin-bottom: var(--space-4); }
.hull { fill: var(--panel); stroke: var(--fg); stroke-width: 2; }
.deck { stroke: var(--fg-soft); stroke-width: 1; stroke-dasharray: 4 4; }
.mast { stroke: var(--fg); stroke-width: 3; }
.sail { fill: var(--paper-dark); stroke: var(--fg-soft); }
.spot { cursor: pointer; }
.spot circle { fill: var(--panel); stroke: var(--accent); stroke-width: 2; transition: fill var(--duration); }
.spot .dot { fill: var(--accent); stroke: none; }
.spot[data-checked='true'] circle { fill: var(--accent); }
.spot[data-checked='true'] .dot { fill: var(--accent-fg); }
.spot[data-disabled='true'] { opacity: 0.35; cursor: not-allowed; }
.points { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
```

- [ ] **Step 3: Брифинг**

`src/ui/screens/briefing/strings.ts`:

```ts
import { dict } from '../../i18n/t';

export const BRIEFING = dict({
  title: { ru: 'Брифинг в кокпите', en: 'Cockpit briefing' },
  subtitle: { ru: 'Вечер перед выходом. Экипаж за столом слушает. Времени на {n} темы.', en: 'The evening before you sail. The crew is listening. There is time for {n} topics.' },
  checkinFound: { ru: 'На приёмке нашли: {list}', en: 'Found at check-in: {list}' },
  checkinNothing: { ru: 'На приёмке ничего не нашли.', en: 'Check-in found nothing.' },
  crew: { ru: 'Экипаж', en: 'Crew' },
  topics: { ru: 'Темы брифинга · выбрано {n} из {max}', en: 'Briefing topics · {n} of {max} chosen' },
  lines: { ru: 'Первые слова экипажу · не больше {max}', en: 'First words to the crew · up to {max}' },
  heard: { ru: 'Экипаж услышал: «{heard}»', en: 'The crew heard: "{heard}"' },
  strength: { ru: 'Сила ожидания {n}', en: 'Expectation strength {n}' },
  start: { ru: 'Начать неделю', en: 'Start the week' },
});
```

`src/ui/screens/briefing/BriefingScreen.tsx`:

```tsx
import { useState } from 'react';
import { Button } from '../../components/Button';
import { ScreenFrame } from '../../components/ScreenFrame';
import { useAct, useGame, useT } from '../../session/SessionContext';
import styles from './Briefing.module.css';
import { BRIEFING } from './strings';

const toggleIn = (list: readonly string[], id: string): string[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export function BriefingScreen() {
  const { game, content, lang } = useGame();
  const act = useAct();
  const t = useT(BRIEFING);
  const { slots, maxDialogues } = content.balance.briefing;
  const [topics, setTopics] = useState<string[]>([]);
  const [lines, setLines] = useState<string[]>([]);
  const defects = content.boats.flatMap((b) => b.hiddenDefects);
  const found = game.log
    .filter((e) => e.cause.startsWith('checkin:found:'))
    .map((e) => defects.find((d) => d.id === e.cause.split(':')[2])?.description[lang])
    .filter((d): d is string => Boolean(d));
  const dialogues = content.dialogues.filter((d) => d.contexts.includes('briefing'));

  return (
    <ScreenFrame
      screen="briefing"
      title={t('title')}
      subtitle={t('subtitle', { n: slots })}
      actions={<Button disabled={topics.length !== slots} onClick={() => act({ type: 'briefing', topicIds: topics, dialogueIds: lines })}>{t('start')}</Button>}
    >
      <p className={styles.found}>{found.length ? t('checkinFound', { list: found.join('; ') }) : t('checkinNothing')}</p>
      <section className={styles.table}>
        <h2>{t('crew')}</h2>
        <ul className={styles.crew}>
          {game.crew.map((m) => (
            <li key={m.id}>{m.name[lang]} · <em>{content.crew.find((a) => a.id === m.archetypeId)?.name[lang]}</em></li>
          ))}
        </ul>
      </section>
      <h2>{t('topics', { n: topics.length, max: slots })}</h2>
      <ul className={styles.topics}>
        {content.briefing.map((topic) => {
          const on = topics.includes(topic.id);
          return (
            <li key={topic.id}>
              <Button variant={on ? 'primary' : 'secondary'} aria-pressed={on} disabled={!on && topics.length >= slots} onClick={() => setTopics((l) => toggleIn(l, topic.id))} className={styles.topic}>
                <strong>{topic.title[lang]}</strong>
                <span className={styles.desc}>{topic.description[lang]}</span>
              </Button>
            </li>
          );
        })}
      </ul>
      <h2>{t('lines', { max: maxDialogues })}</h2>
      <ul className={styles.lines}>
        {dialogues.map((d) => {
          const on = lines.includes(d.id);
          return (
            <li key={d.id}>
              <Button variant={on ? 'primary' : 'ghost'} aria-pressed={on} disabled={!on && lines.length >= maxDialogues} onClick={() => setLines((l) => toggleIn(l, d.id))}>
                «{d.said[lang]}»
              </Button>
              {on && <p className={styles.bubble}>{t('heard', { heard: d.heard[lang] })} · <span className="mono">{t('strength', { n: d.strength })}</span></p>}
            </li>
          );
        })}
      </ul>
    </ScreenFrame>
  );
}
```

`src/ui/screens/briefing/Briefing.module.css`:

```css
.found { font-family: var(--font-hand); font-size: var(--text-lg); margin: 0 0 var(--space-4); }
.table { background: var(--panel); border-radius: var(--radius); padding: var(--space-3) var(--space-4); box-shadow: var(--shadow); }
.table h2 { margin: 0 0 var(--space-2); font-size: var(--text-lg); }
.crew { margin: 0; padding-left: var(--space-4); }
.topics { list-style: none; padding: 0; display: grid; gap: var(--space-2); grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
.topic { display: grid; gap: var(--space-1); width: 100%; text-align: left; }
.desc { font-size: var(--text-sm); opacity: 0.85; }
.lines { list-style: none; padding: 0; display: grid; gap: var(--space-2); }
.bubble {
  position: relative; margin: var(--space-1) 0 0 var(--space-6); padding: var(--space-2) var(--space-3);
  background: var(--ochre-200); color: var(--ink); border-radius: 12px; font-family: var(--font-hand); font-size: var(--text-lg);
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/ui/screens/CheckinScreen.test.tsx tests/ui/screens/BriefingScreen.test.tsx tests/ui/i18n.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/checkin src/ui/screens/briefing tests/ui/screens/CheckinScreen.test.tsx tests/ui/screens/BriefingScreen.test.tsx
git commit -m "feat: add check-in cutaway and crew briefing screens"
```

---

### Task 8: Морская карта `ChartMap` (SVG)

**Files:**
- Create: `src/ui/components/chart/ChartMap.tsx`, `src/ui/components/chart/symbols.tsx`, `src/ui/components/chart/ChartMap.module.css`, `src/ui/components/chart/strings.ts`
- Test: `tests/ui/components/ChartMap.test.tsx`

**Interfaces:**
- Consumes: `mapBounds, projection, routeBetween` (Task 3), `WindRose`, `useReducedMotion` (Task 4), `useSession, useLang, useT` (Task 1), типы `Dir8, MapPoint, PointKind, RouteFeature`.
- Produces:
  ```ts
  export interface ChartMapProps {
    locationId: string;                       // где сейчас лодка (фишка)
    trail?: readonly string[];                // точки маршрута по порядку: [откуда, ..., куда]
    animateTrail?: boolean;                   // фишка плывёт по trail (сводка перехода)
    reachableIds?: readonly string[];         // точки, куда можно добавить переход
    onPointClick?: (pointId: string) => void;
    wind?: { dir: Dir8; kn: number; gustKn?: number } | null;
  }
  export function ChartMap(props: ChartMapProps): JSX.Element
  export function trailPath(points: readonly { x: number; y: number }[]): string   // "M x y L x y ..."
  ```

**Поведение (ТЗ 6.1 «Карта», 6.2):** вся карта — один SVG с `viewBox` из `projection`, ширина 100 %. Внутри:
- сетка каждые 5 миль;
- маршруты тонкой линией: пунктир у пролива, мыса и залива, подпись особенности курсивом посередине;
- точки со значком по типу (база — звезда, марина — квадрат-причал, бухта — якорь, причал — штрих) и подписью;
- фишка лодки и роза ветров в углу.

Точка из `reachableIds` — это `<g role="button" tabIndex={0}>` с `aria-label` по имени точки; Enter или пробел работают как клик. Остальные точки не интерактивны. Маршруты между соседними точками `trail` подсвечены (`data-highlight="true"`). При `animateTrail` (и без reduced motion) фишка двигается по `trail` через `<animateMotion>`. Стиль «от руки» (бумага, береговая линия, анимированная вода) добавит Task 16, не здесь.

- [ ] **Step 1: Написать падающий тест**

`tests/ui/components/ChartMap.test.tsx`:

```tsx
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChartMap, trailPath } from '../../../src/ui/components/chart/ChartMap';
import { content } from '../fixtures';
import { renderWithSession } from '../render';

describe('ChartMap', () => {
  it('draws every point name and every route', () => {
    const { container } = renderWithSession(<ChartMap locationId="base_marina" />);
    for (const p of content.map) expect(screen.getByText(p.name.ru)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-route]')).toHaveLength(content.routes.length);
  });

  it('only reachable points are buttons, and they work by click and keyboard', () => {
    const onPointClick = vi.fn();
    renderWithSession(<ChartMap locationId="base_marina" reachableIds={['cala_azzurra']} onPointClick={onPointClick} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    fireEvent.keyDown(buttons[0]!, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalledTimes(2);
    expect(onPointClick).toHaveBeenCalledWith('cala_azzurra');
  });

  it('highlights the routes along the trail', () => {
    const { container } = renderWithSession(<ChartMap locationId="base_marina" trail={['base_marina', 'cala_azzurra', 'kastri_marina']} />);
    const lit = [...container.querySelectorAll('[data-highlight="true"]')].map((n) => n.getAttribute('data-route'));
    expect(lit.sort()).toEqual(['r_base_marina_cala_azzurra', 'r_cala_azzurra_kastri_marina']);
  });

  it('shows the wind rose when wind is given', () => {
    renderWithSession(<ChartMap locationId="base_marina" wind={{ dir: 'N', kn: 14 }} />);
    expect(screen.getByRole('img', { name: /N.*14/ })).toBeInTheDocument();
  });

  it('builds an SVG path through trail points', () => {
    expect(trailPath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe('M 0 0 L 10 5');
  });
});
```

Run: `npx vitest run tests/ui/components/ChartMap.test.tsx`
Expected: FAIL — модуль не найден.

- [ ] **Step 2: Строки и значки**

`src/ui/components/chart/strings.ts`:

```ts
import type { LocalizedText, RouteFeature } from '../../../engine';
import { dict } from '../../i18n/t';

export const CHART = dict({
  title: { ru: 'Морская карта архипелага', en: 'Chart of the archipelago' },
  you: { ru: 'Вы здесь', en: 'You are here' },
});

export const FEATURE_NAMES: Readonly<Record<RouteFeature, LocalizedText>> = {
  strait: { ru: 'пролив', en: 'strait' },
  cape: { ru: 'мыс', en: 'cape' },
  gulf: { ru: 'залив', en: 'gulf' },
  open: { ru: 'открытая вода', en: 'open water' },
};
```

`src/ui/components/chart/symbols.tsx`:

```tsx
import type { PointKind } from '../../../engine';

/** Chart symbols centred on (0,0), about 16px. */
export function PointSymbol({ kind }: { kind: PointKind }) {
  switch (kind) {
    case 'base':
      return <path d="M0 -9 L2.6 -2.8 L9 -2.8 L3.8 1.2 L5.8 8 L0 4 L-5.8 8 L-3.8 1.2 L-9 -2.8 L-2.6 -2.8 Z" />;
    case 'marina':
      return <rect x="-6" y="-6" width="12" height="12" rx="2" />;
    case 'bay':
      return <path d="M0 -8 V7 M-6 2 Q0 10 6 2 M-4 -4 H4" fill="none" strokeWidth="2" />;
    case 'quay':
      return <path d="M-8 4 H8 M-6 4 V-4 M6 4 V-4" fill="none" strokeWidth="2.5" />;
  }
}

export function BoatToken() {
  return <path d="M0 -10 Q6 -2 5 8 L-5 8 Q-6 -2 0 -10 Z" />;
}
```

- [ ] **Step 3: Карта**

`src/ui/components/chart/ChartMap.tsx`:

```tsx
import type { KeyboardEvent } from 'react';
import type { Dir8 } from '../../../engine';
import { useSession, useT } from '../../session/SessionContext';
import { mapBounds, projection, routeBetween } from '../../view/map';
import { useReducedMotion } from '../motion';
import { WindRose } from '../WindRose';
import styles from './ChartMap.module.css';
import { CHART, FEATURE_NAMES } from './strings';
import { BoatToken, PointSymbol } from './symbols';

const PX_PER_NM = 24;
const GRID_NM = 5;
const SAIL_SECONDS_PER_LEG = 2.5;

export interface ChartMapProps {
  locationId: string;
  trail?: readonly string[];
  animateTrail?: boolean;
  reachableIds?: readonly string[];
  onPointClick?: (pointId: string) => void;
  wind?: { dir: Dir8; kn: number; gustKn?: number } | null;
}

export function trailPath(points: readonly { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(p.x)} ${Math.round(p.y)}`).join(' ');
}

export function ChartMap({ locationId, trail = [], animateTrail = false, reachableIds = [], onPointClick, wind }: ChartMapProps) {
  const { session } = useSession();
  const { content, lang } = session;
  const t = useT(CHART);
  const reduced = useReducedMotion();
  const proj = projection(mapBounds(content.map), PX_PER_NM);
  const at = (id: string) => proj.toSvg(content.map.find((p) => p.id === id) ?? { x: 0, y: 0 });
  const lit = new Set(trail.slice(1).map((id, i) => routeBetween(content, trail[i]!, id)?.id).filter(Boolean));
  const trailPoints = trail.map(at);
  const here = at(locationId);
  const animate = animateTrail && !reduced && trailPoints.length > 1;
  const press = (id: string) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPointClick?.(id); }
  };

  return (
    <figure className={styles.chart}>
      <svg className={styles.svg} viewBox={`0 0 ${proj.width} ${proj.height}`} role="group" aria-label={t('title')}>
        <rect className={styles.paper} width={proj.width} height={proj.height} />
        <g className={styles.grid}>
          {Array.from({ length: Math.floor(proj.width / (GRID_NM * PX_PER_NM)) + 1 }, (_, i) => (
            <line key={`v${i}`} x1={i * GRID_NM * PX_PER_NM} y1={0} x2={i * GRID_NM * PX_PER_NM} y2={proj.height} />
          ))}
          {Array.from({ length: Math.floor(proj.height / (GRID_NM * PX_PER_NM)) + 1 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i * GRID_NM * PX_PER_NM} x2={proj.width} y2={i * GRID_NM * PX_PER_NM} />
          ))}
        </g>
        {content.routes.map((r) => {
          const a = at(r.from);
          const b = at(r.to);
          const special = r.features.find((f) => f !== 'open');
          return (
            <g key={r.id} data-route={r.id} data-highlight={lit.has(r.id) ? 'true' : 'false'} className={styles.route}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeDasharray={special ? '6 5' : undefined} />
              {special && <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} className={styles.feature}>{FEATURE_NAMES[special][lang]}</text>}
            </g>
          );
        })}
        {content.map.map((p) => {
          const s = proj.toSvg(p);
          const clickable = reachableIds.includes(p.id);
          return (
            <g
              key={p.id}
              transform={`translate(${s.x} ${s.y})`}
              className={styles.point}
              data-kind={p.kind}
              data-reachable={clickable}
              {...(clickable ? { role: 'button', tabIndex: 0, 'aria-label': p.name[lang], onClick: () => onPointClick?.(p.id), onKeyDown: press(p.id) } : {})}
            >
              {clickable && <circle className={styles.halo} r="16" />}
              <PointSymbol kind={p.kind} />
              <text className={styles.label} x="12" y="4">{p.name[lang]}</text>
            </g>
          );
        })}
        {trailPoints.length > 1 && <path className={styles.trail} d={trailPath(trailPoints)} />}
        <g className={styles.boat} aria-label={t('you')} transform={animate ? undefined : `translate(${here.x} ${here.y - 14})`}>
          <BoatToken />
          {animate && <animateMotion dur={`${SAIL_SECONDS_PER_LEG * (trailPoints.length - 1)}s`} fill="freeze" path={trailPath(trailPoints.map((p) => ({ x: p.x, y: p.y - 14 })))} />}
        </g>
      </svg>
      {wind && <div className={styles.rose}><WindRose dir={wind.dir} kn={wind.kn} gustKn={wind.gustKn} size={80} /></div>}
    </figure>
  );
}
```

`src/ui/components/chart/ChartMap.module.css`:

```css
.chart { position: relative; margin: 0; }
.svg { display: block; width: 100%; height: auto; border-radius: var(--radius); box-shadow: var(--shadow); }
.paper { fill: var(--chart-paper, var(--panel)); }
.grid line { stroke: var(--line); stroke-width: 0.5; }
.route line { stroke: var(--fg-soft); stroke-width: 1.2; opacity: 0.55; }
.route[data-highlight='true'] line { stroke: var(--accent); stroke-width: 3; opacity: 1; }
.feature { font-family: var(--font-hand); font-size: 14px; fill: var(--fg-soft); text-anchor: middle; }
.point { fill: var(--accent); stroke: var(--accent); }
.point[data-kind='bay'] { fill: none; }
.point[data-reachable='true'] { cursor: pointer; }
.point[data-reachable='true']:focus-visible .halo, .point[data-reachable='true']:hover .halo { stroke-width: 3; }
.halo { fill: none; stroke: var(--focus); stroke-width: 1.5; stroke-dasharray: 3 3; }
.label { font-family: var(--font-serif); font-size: 13px; fill: var(--fg); stroke: none; paint-order: stroke; }
.trail { fill: none; stroke: var(--accent); stroke-width: 2; stroke-dasharray: 2 6; stroke-linecap: round; }
.boat { fill: var(--red-500); stroke: var(--paper); stroke-width: 1; }
.rose { position: absolute; right: var(--space-2); top: var(--space-2); }
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/ui/components/ChartMap.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/chart tests/ui/components/ChartMap.test.tsx
git commit -m "feat: add SVG nautical chart component"
```

---

### Task 9: Утро, вечер и сдача лодки

**Files:**
- Modify (заменить заглушки): `src/ui/screens/morning/MorningScreen.tsx`, `src/ui/screens/evening/EveningScreen.tsx`, `src/ui/screens/return/ReturnScreen.tsx`
- Create: `src/ui/screens/morning/strings.ts`, `src/ui/screens/evening/strings.ts`, `src/ui/screens/return/strings.ts`, `src/ui/screens/day.module.css` (общий стиль трёх экранов дня), `src/ui/screens/morning/Expectations.tsx`
- Test: `tests/ui/screens/MorningScreen.test.tsx`, `tests/ui/screens/EveningScreen.test.tsx`, `tests/ui/screens/ReturnScreen.test.tsx`

**Interfaces:**
- Consumes: `tavernaOpen, requirePoint, formatClock` из движка (Task 2); `ResourcePanel`, `formatHour`, `pointName` (Task 3); `VoiceLine` (Task 4); `ScreenFrame, Button`, `useGame, useAct, useT`, `DAMAGE_NAMES, label` (Task 1).
- Produces: `MorningScreen`, `EveningScreen`, `ReturnScreen`, `<Expectations />` (открытые ожидания экипажа: «что услышали»). Последний используют утро и вечер.

**Поведение:**
- **Утро** (ТЗ 3 «Дневной цикл», 4.3, 4.7): заголовок «Утро, день N», место. Открытые ожидания экипажа («Экипаж ждёт: «Выходим в 8»»). Чекбокс «Посмотреть на барометр и небо». Если Морское чутьё ≥ `seaSenseSignalLevel`, под ним реплика голоса: «Я и так чувствую погоду». Реплика экипажу (диалоги с контекстом `morning`) или «Ничего не обещать»; у выбранной пузырь «услышали». В последний день — напоминание о сроке возврата. «Начать день» отправляет `start_day`.
- **Вечер** (ТЗ 4.1, 4.5): «Вечер, день N · место · часы». Итог дня из `dayFacts`: время прихода или «остались на месте», якорь или причал. Ужин: «Готовим на борту» (при газе ниже `gas.pctPerDay` — предупреждение о холодном ужине) или «Таверна, X €». Таверна неактивна, если её нет в точке или уже `≥ tavernaCloseHour`; причина пишется рядом. Ожидания и реплика на завтра (контекст `evening`). «Отбой» отправляет `end_day`.
- **Сдача** (ТЗ 3 фаза 6): вернулись ли к `returnDeadlineHour` (иначе штраф `lateFeeEur`), список повреждений, кнопка «Сдать лодку» (`finish_week`). Скрытые дефекты здесь не раскрываются: их покажет разбор.

- [ ] **Step 1: Написать падающие тесты**

`tests/ui/screens/MorningScreen.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { content, gameAt } from '../fixtures';
import { renderShell } from '../render';

describe('MorningScreen', () => {
  it('shows open expectations as the crew heard them', () => {
    const game = gameAt('morning');
    renderShell(game);
    const open = game.expectations.filter((e) => e.status === 'open');
    expect(open.length).toBeGreaterThan(0);
    for (const e of open) {
      expect(screen.getByText(new RegExp(content.dialogues.find((d) => d.id === e.dialogueId)!.heard.ru))).toBeInTheDocument();
    }
  });

  it('starts the day with the barometer and a promise', async () => {
    const r = renderShell(gameAt('morning'));
    await r.user.click(screen.getByLabelText('Посмотреть на барометр и небо'));
    await r.user.click(screen.getByLabelText(/Постараемся выйти пораньше/));
    expect(screen.getByText(/услышал: «Выходим в 8»/)).toBeInTheDocument();
    await r.user.click(screen.getByRole('button', { name: 'Начать день' }));
    expect(['planning', 'event']).toContain(r.currentScreen());
    const today = r.session().game!.log.filter((e) => e.day === 1).map((e) => e.cause);
    expect(today).toContain('barometer:open');
    expect(today).toContain('dialogue:early_try');
  });
});
```

`tests/ui/screens/EveningScreen.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { gameAt } from '../fixtures';
import { renderShell } from '../render';

describe('EveningScreen', () => {
  it('disables the taverna where there is none', () => {
    renderShell({ ...gameAt('evening'), locationId: 'cala_azzurra' });
    expect(screen.getByLabelText(/^\s*Таверна ·/)).toBeDisabled();
    expect(screen.getByText('Таверны здесь нет')).toBeInTheDocument();
  });

  it('disables the taverna after closing time', () => {
    renderShell({ ...gameAt('evening'), locationId: 'base_marina', clockMin: 23 * 60 + 30 });
    expect(screen.getByLabelText(/^\s*Таверна ·/)).toBeDisabled();
    expect(screen.getByText(/Таверна уже закрыта/)).toBeInTheDocument();
  });

  it('ends the day and opens the next morning', async () => {
    const r = renderShell(gameAt('evening'));
    await r.user.click(screen.getByRole('button', { name: 'Отбой' }));
    expect(r.currentScreen()).toBe('morning');
    expect(r.session().game!.day).toBe(2);
  });
});
```

`tests/ui/screens/ReturnScreen.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { gameAt } from '../fixtures';
import { renderShell } from '../render';

describe('ReturnScreen', () => {
  it('reports whether the boat came back on time and hands it over', async () => {
    const game = gameAt('return');
    const r = renderShell(game);
    expect(screen.getByText(game.returnedOnTime ? /Вернулись на базу к 17:00/ : /Опоздали/)).toBeInTheDocument();
    await r.user.click(screen.getByRole('button', { name: 'Сдать лодку' }));
    expect(r.currentScreen()).toBe('debrief');
  });

  it('shows a late return and its fee', () => {
    renderShell({ ...gameAt('return'), returnedOnTime: false });
    expect(screen.getByText(/Опоздали.*400 €/)).toBeInTheDocument();
  });
});
```

Run: `npx vitest run tests/ui/screens/MorningScreen.test.tsx tests/ui/screens/EveningScreen.test.tsx tests/ui/screens/ReturnScreen.test.tsx`
Expected: FAIL (заглушки).

- [ ] **Step 2: Строки**

`src/ui/screens/morning/strings.ts`:

```ts
import { dict } from '../../i18n/t';

export const MORNING = dict({
  title: { ru: 'Утро, день {n}', en: 'Morning, day {n}' },
  expecting: { ru: 'Экипаж ждёт', en: 'The crew expects' },
  nothingExpected: { ru: 'Экипаж ничего особенного не ждёт.', en: 'The crew expects nothing in particular.' },
  barometer: { ru: 'Посмотреть на барометр и небо', en: 'Check the barometer and the sky' },
  seaSense: { ru: 'Я и так чувствую погоду. Но лишний взгляд на барометр не повредит.', en: 'I can feel the weather anyway. Still, a glance at the barometer never hurts.' },
  say: { ru: 'Что сказать экипажу за завтраком', en: 'What to tell the crew over breakfast' },
  sayNothing: { ru: 'Ничего не обещать', en: 'Promise nothing' },
  heard: { ru: 'Экипаж услышал: «{heard}»', en: 'The crew heard: "{heard}"' },
  lastDay: { ru: 'Сегодня последний день: лодку нужно вернуть на базу до {time}.', en: 'Last day: the boat must be back at base by {time}.' },
  start: { ru: 'Начать день', en: 'Start the day' },
});
```

`src/ui/screens/evening/strings.ts`:

```ts
import { dict } from '../../i18n/t';

export const EVENING = dict({
  title: { ru: 'Вечер, день {n}', en: 'Evening, day {n}' },
  subtitle: { ru: '{place} · {clock}', en: '{place} · {clock}' },
  arrived: { ru: 'Пришли в {time}', en: 'Arrived at {time}' },
  stayed: { ru: 'День провели на месте', en: 'Spent the day in place' },
  atAnchor: { ru: 'стоим на якоре', en: 'at anchor' },
  atBerth: { ru: 'стоим у причала', en: 'alongside' },
  dinner: { ru: 'Ужин', en: 'Dinner' },
  cook: { ru: 'Готовим на борту', en: 'Cook on board' },
  noGas: { ru: 'Газа почти нет: ужин будет холодным', en: 'Almost out of gas: dinner will be cold' },
  taverna: { ru: 'Таверна · {eur} €', en: 'Taverna · €{eur}' },
  noTaverna: { ru: 'Таверны здесь нет', en: 'No taverna here' },
  tavernaClosed: { ru: 'Таверна уже закрыта (до {time})', en: 'The taverna has closed (open until {time})' },
  say: { ru: 'Что сказать на завтра', en: 'What to say about tomorrow' },
  sayNothing: { ru: 'Ничего не обещать', en: 'Promise nothing' },
  heard: { ru: 'Экипаж услышал: «{heard}»', en: 'The crew heard: "{heard}"' },
  sleep: { ru: 'Отбой', en: 'Lights out' },
});
```

`src/ui/screens/return/strings.ts`:

```ts
import { dict } from '../../i18n/t';

export const RETURN = dict({
  title: { ru: 'Сдача лодки', en: 'Handing the boat back' },
  onTime: { ru: 'Вернулись на базу к {time}. Базовый менеджер доволен.', en: 'Back at base by {time}. The base manager is pleased.' },
  late: { ru: 'Опоздали к {time}. Штраф {eur} €.', en: 'Missed the {time} deadline. Fine: €{eur}.' },
  damages: { ru: 'Повреждения при сдаче', en: 'Damage at handover' },
  noDamage: { ru: 'Видимых повреждений нет.', en: 'No visible damage.' },
  handover: { ru: 'Сдать лодку', en: 'Hand over the boat' },
});
```

- [ ] **Step 3: Ожидания, утро, вечер, сдача**

`src/ui/screens/morning/Expectations.tsx`:

```tsx
import { useGame, useT } from '../../session/SessionContext';
import styles from '../day.module.css';
import { MORNING } from './strings';

/** Open expectations as the crew heard them (ТЗ 4.7). */
export function Expectations() {
  const { game, content, lang } = useGame();
  const t = useT(MORNING);
  const open = game.expectations.filter((e) => e.status === 'open');
  if (open.length === 0) return <p className={styles.muted}>{t('nothingExpected')}</p>;
  return (
    <section className={styles.expect}>
      <h2>{t('expecting')}</h2>
      <ul>
        {open.map((e) => <li key={e.id} className={styles.bubble}>«{content.dialogues.find((d) => d.id === e.dialogueId)?.heard[lang] ?? e.dialogueId}»</li>)}
      </ul>
    </section>
  );
}
```

`src/ui/screens/morning/MorningScreen.tsx`:

```tsx
import { useState } from 'react';
import { Button } from '../../components/Button';
import { ResourcePanel } from '../../components/ResourcePanel';
import { ScreenFrame } from '../../components/ScreenFrame';
import { VoiceLine } from '../../components/voices/VoiceLine';
import { useAct, useGame, useT } from '../../session/SessionContext';
import { formatHour } from '../../view/format';
import { pointName } from '../../view/map';
import styles from '../day.module.css';
import { Expectations } from './Expectations';
import { MORNING } from './strings';

export function MorningScreen() {
  const { game, content, lang } = useGame();
  const act = useAct();
  const t = useT(MORNING);
  const [barometer, setBarometer] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const b = content.balance;
  const dialogues = content.dialogues.filter((d) => d.contexts.includes('morning'));
  const chosen = dialogues.find((d) => d.id === line);

  return (
    <ScreenFrame
      screen="morning"
      title={t('title', { n: game.day })}
      subtitle={pointName(content, game.locationId, lang)}
      side={<ResourcePanel />}
      actions={<Button onClick={() => act({ type: 'start_day', choice: { openBarometer: barometer, dialogueId: line } })}>{t('start')}</Button>}
    >
      {game.day === b.schedule.days && <p className={styles.warning}>{t('lastDay', { time: formatHour(b.schedule.returnDeadlineHour) })}</p>}
      <Expectations />
      <label className={styles.check}>
        <input type="checkbox" checked={barometer} onChange={(e) => setBarometer(e.target.checked)} />
        {t('barometer')}
      </label>
      {game.voices.sea_sense >= b.voices.seaSenseSignalLevel && <VoiceLine voice="sea_sense" text={t('seaSense')} />}
      <fieldset className={styles.say}>
        <legend>{t('say')}</legend>
        <label><input type="radio" name="say" checked={line === null} onChange={() => setLine(null)} /> {t('sayNothing')}</label>
        {dialogues.map((d) => (
          <label key={d.id}><input type="radio" name="say" checked={line === d.id} onChange={() => setLine(d.id)} /> «{d.said[lang]}»</label>
        ))}
      </fieldset>
      {chosen && <p className={styles.bubble}>{t('heard', { heard: chosen.heard[lang] })}</p>}
    </ScreenFrame>
  );
}
```

`src/ui/screens/evening/EveningScreen.tsx`:

```tsx
import { useState } from 'react';
import { formatClock, requirePoint, tavernaOpen } from '../../../engine';
import { Button } from '../../components/Button';
import { ResourcePanel } from '../../components/ResourcePanel';
import { ScreenFrame } from '../../components/ScreenFrame';
import { useAct, useGame, useT } from '../../session/SessionContext';
import { formatHour } from '../../view/format';
import styles from '../day.module.css';
import { Expectations } from '../morning/Expectations';
import { EVENING } from './strings';

export function EveningScreen() {
  const { game, content, lang } = useGame();
  const act = useAct();
  const t = useT(EVENING);
  const b = content.balance;
  const point = requirePoint(content, game.locationId);
  const facts = game.dayFacts;
  const open = tavernaOpen(game.clockMin, b);
  const tavernaReason = !point.services.taverna ? t('noTaverna') : !open ? t('tavernaClosed', { time: formatHour(b.time.tavernaCloseHour) }) : null;
  const [dinner, setDinner] = useState<'cook' | 'taverna'>('cook');
  const [line, setLine] = useState<string | null>(null);
  const dialogues = content.dialogues.filter((d) => d.contexts.includes('evening'));
  const chosen = dialogues.find((d) => d.id === line);
  const summary = facts?.arrivalHour != null ? t('arrived', { time: formatHour(facts.arrivalHour) }) : t('stayed');
  const mooring = facts?.mooring === 'anchor' ? t('atAnchor') : t('atBerth');

  return (
    <ScreenFrame
      screen="evening"
      title={t('title', { n: game.day })}
      subtitle={t('subtitle', { place: point.name[lang], clock: formatClock(game.clockMin) })}
      side={<ResourcePanel />}
      actions={<Button onClick={() => act({ type: 'end_day', choice: { dinner, dialogueId: line } })}>{t('sleep')}</Button>}
    >
      <p className={styles.summary}>{summary}, {mooring}.</p>
      <Expectations />
      <fieldset className={styles.say}>
        <legend>{t('dinner')}</legend>
        <label><input type="radio" name="dinner" checked={dinner === 'cook'} onChange={() => setDinner('cook')} /> {t('cook')}</label>
        {game.resources.gasPct < b.gas.pctPerDay && <p className={styles.warning}>{t('noGas')}</p>}
        <label>
          <input type="radio" name="dinner" checked={dinner === 'taverna'} disabled={tavernaReason !== null} onChange={() => setDinner('taverna')} />{' '}
          {t('taverna', { eur: game.crew.length * b.mood.tavernaEurPerPerson })}
        </label>
        {tavernaReason && <p className={styles.muted}>{tavernaReason}</p>}
      </fieldset>
      <fieldset className={styles.say}>
        <legend>{t('say')}</legend>
        <label><input type="radio" name="say" checked={line === null} onChange={() => setLine(null)} /> {t('sayNothing')}</label>
        {dialogues.map((d) => (
          <label key={d.id}><input type="radio" name="say" checked={line === d.id} onChange={() => setLine(d.id)} /> «{d.said[lang]}»</label>
        ))}
      </fieldset>
      {chosen && <p className={styles.bubble}>{t('heard', { heard: chosen.heard[lang] })}</p>}
    </ScreenFrame>
  );
}
```

`src/ui/screens/return/ReturnScreen.tsx`:

```tsx
import { Button } from '../../components/Button';
import { ResourcePanel } from '../../components/ResourcePanel';
import { ScreenFrame } from '../../components/ScreenFrame';
import { DAMAGE_NAMES, label } from '../../i18n/glossary';
import { useAct, useGame, useT } from '../../session/SessionContext';
import { formatHour } from '../../view/format';
import styles from '../day.module.css';
import { RETURN } from './strings';

export function ReturnScreen() {
  const { game, content, lang } = useGame();
  const act = useAct();
  const t = useT(RETURN);
  const { returnDeadlineHour, lateFeeEur } = content.balance.schedule;
  const time = formatHour(returnDeadlineHour);
  return (
    <ScreenFrame screen="return" title={t('title')} side={<ResourcePanel />} actions={<Button onClick={() => act({ type: 'finish_week' })}>{t('handover')}</Button>}>
      <p className={game.returnedOnTime ? styles.summary : styles.warning}>
        {game.returnedOnTime ? t('onTime', { time }) : t('late', { time, eur: lateFeeEur })}
      </p>
      <h2>{t('damages')}</h2>
      {game.damages.length === 0 ? <p className={styles.muted}>{t('noDamage')}</p> : (
        <ul>{game.damages.map((d) => <li key={d}>{label(DAMAGE_NAMES, d, lang)}</li>)}</ul>
      )}
    </ScreenFrame>
  );
}
```

`src/ui/screens/day.module.css`:

```css
.summary { font-size: var(--text-lg); margin: 0 0 var(--space-4); }
.warning { color: var(--bad); font-weight: 700; margin: var(--space-2) 0; }
.muted { color: var(--fg-soft); margin: var(--space-1) 0; }
.check { display: flex; gap: var(--space-2); align-items: center; margin: var(--space-4) 0 var(--space-2); font-size: var(--text-lg); min-height: 44px; }
.say { border: 1px solid var(--line); border-radius: var(--radius); margin: var(--space-4) 0; padding: var(--space-3) var(--space-4); display: grid; gap: var(--space-2); }
.say legend { padding: 0 var(--space-2); color: var(--fg-soft); }
.say label { display: flex; gap: var(--space-2); align-items: center; min-height: 36px; }
.expect h2 { font-size: var(--text-lg); margin: 0 0 var(--space-2); }
.expect ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
.bubble { display: inline-block; padding: var(--space-2) var(--space-3); background: var(--ochre-200); color: var(--ink); border-radius: 12px; font-family: var(--font-hand); font-size: var(--text-lg); }
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/ui/screens/MorningScreen.test.tsx tests/ui/screens/EveningScreen.test.tsx tests/ui/screens/ReturnScreen.test.tsx tests/ui/i18n.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/morning src/ui/screens/evening src/ui/screens/return src/ui/screens/day.module.css tests/ui/screens/MorningScreen.test.tsx tests/ui/screens/EveningScreen.test.tsx tests/ui/screens/ReturnScreen.test.tsx
git commit -m "feat: add morning, evening and boat handover screens"
```

---

### Task 10: Сцена события и итог выбора

**Files:**
- Modify (заменить заглушки): `src/ui/screens/event/EventScreen.tsx`, `src/ui/screens/event/OutcomeScreen.tsx`
- Create: `src/ui/screens/event/strings.ts`, `src/ui/screens/event/Event.module.css`, `src/ui/screens/event/deltas.ts`
- Test: `tests/ui/screens/EventScreen.test.tsx`, `tests/ui/screens/event-deltas.test.ts`

**Interfaces:**
- Consumes: `presentEvent, buildConditionContext, requireEvent, formatClock` из движка; `SceneArt, ScreenFrame, Button`, `useGame, useSession, useAct, useT`, `PILLAR_NAMES, VOICE_NAMES` (Task 1); `describeEntry, isNoise`, `RESOURCE_NAMES`, `signed` (Task 3); `Typewriter`, `VoiceLine` (Task 4).
- Produces: `EventScreen` (`data-screen="event"`), `OutcomeScreen` (`data-screen="outcome"`), `sumDeltas(entries): Partial<Record<keyof Resources, number>>`, `timeSpentHours(entries): number` (`deltas.ts`).

**Поведение (ТЗ 6.1 «Сцена события»):** иллюстрация слева (`SceneArt`, заменяемый слой), панель текста справа: столп, день и время, текст построчно, голоса как реплики диалога (только услышанные — это уже отфильтровал `presentEvent`), варианты. Вариант с проверкой показывает голос и шанс: «[Механик · 55%]». Недоступный вариант неактивен с пометкой «недоступно». Итог показывает: выбранный вариант, результат проверки, строки бортжурнала из `ui.outcome.entries` (без шума), сумму изменений ресурсов и потраченное время. Кнопка «Дальше» → `outcome_seen`.

- [ ] **Step 1: Написать падающие тесты**

`tests/ui/screens/event-deltas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../../../src/engine';
import { sumDeltas, timeSpentHours } from '../../../src/ui/screens/event/deltas';

const e = (delta: LogEntry['delta'], data?: LogEntry['data']): LogEntry => ({ day: 1, clockMin: 0, kind: 'effect', cause: 'x', ...(delta ? { delta } : {}), ...(data ? { data } : {}) });

describe('outcome deltas', () => {
  it('sums resource changes across entries and drops zeros', () => {
    expect(sumDeltas([e({ mood: -10, fatigue: 5 }), e({ mood: 4 }), e({ moneyEur: 0 })])).toEqual({ mood: -6, fatigue: 5 });
  });

  it('adds up time spent', () => {
    expect(timeSpentHours([e(undefined, { time_hours: 1.5 }), e(undefined, { time_hours: 2 }), e({ mood: 1 })])).toBe(3.5);
  });
});
```

`tests/ui/screens/EventScreen.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { content, gameAt, withEvent } from '../fixtures';
import { renderShell } from '../render';

const checkEvent = content.events.find((e) => e.trigger.phase === 'evening' && e.options.some((o) => o.check && !o.requires))!;
const plainEvent = content.events.find((e) => e.id !== checkEvent.id && e.trigger.phase === 'evening' && e.options.some((o) => !o.requires))!;

describe('EventScreen', () => {
  it('shows the scene, the text and each option, with check odds', () => {
    renderShell(withEvent(gameAt('evening'), checkEvent.id));
    expect(document.querySelector(`[data-scene="${checkEvent.scene}"]`)).not.toBeNull();
    expect(screen.getByText(checkEvent.text.ru.split(/(?<=[.!?…])\s/)[0]!.trim(), { exact: false })).toBeInTheDocument();
    for (const o of checkEvent.options) expect(screen.getByRole('button', { name: new RegExp(o.text.ru.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeInTheDocument();
    expect(screen.getAllByText(/\d+%/).length).toBeGreaterThan(0);
  });

  it('resolves a choice, shows its outcome, then returns to the evening', async () => {
    const option = plainEvent.options.find((o) => !o.requires)!;
    const r = renderShell(withEvent(gameAt('evening'), plainEvent.id));
    await r.user.click(screen.getByRole('button', { name: new RegExp(option.text.ru.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }));
    expect(r.currentScreen()).toBe('outcome');
    expect(screen.getAllByText(new RegExp(option.text.ru.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).length).toBeGreaterThan(0);
    await r.user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(r.currentScreen()).toBe('evening');
  });

  it('a double click resolves only the first of two queued events', async () => {
    const option = plainEvent.options.find((o) => !o.requires)!;
    const game = withEvent(withEvent(gameAt('evening'), checkEvent.id), plainEvent.id);
    const r = renderShell(game);
    await r.user.dblClick(screen.getByRole('button', { name: new RegExp(option.text.ru.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }));
    expect(r.session().game!.eventQueue).toEqual([checkEvent.id]);
    expect(r.currentScreen()).toBe('outcome');
  });
});
```

Run: `npx vitest run tests/ui/screens/EventScreen.test.tsx tests/ui/screens/event-deltas.test.ts`
Expected: FAIL.

- [ ] **Step 2: Строки и подсчёт изменений**

`src/ui/screens/event/strings.ts`:

```ts
import { dict } from '../../i18n/t';

export const EVENT = dict({
  when: { ru: 'День {day} · {clock}', en: 'Day {day} · {clock}' },
  check: { ru: '[{voice} · {pct}%]', en: '[{voice} · {pct}%]' },
  unavailable: { ru: '(недоступно)', en: '(not available)' },
  outcomeTitle: { ru: 'Последствия', en: 'What came of it' },
  changes: { ru: 'Изменения', en: 'Changes' },
  noChanges: { ru: 'Ресурсы не изменились.', en: 'No change to resources.' },
  timeSpent: { ru: 'Ушло времени: {h} ч', en: 'Time spent: {h} h' },
});
```

`src/ui/screens/event/deltas.ts`:

```ts
import type { LogEntry, Resources } from '../../../engine';

export function sumDeltas(entries: readonly LogEntry[]): Partial<Record<keyof Resources, number>> {
  const sum: Partial<Record<keyof Resources, number>> = {};
  for (const e of entries) {
    for (const [k, v] of Object.entries(e.delta ?? {}) as [keyof Resources, number][]) sum[k] = (sum[k] ?? 0) + v;
  }
  return Object.fromEntries(Object.entries(sum).filter(([, v]) => Math.round(v * 10) !== 0));
}

export function timeSpentHours(entries: readonly LogEntry[]): number {
  return entries.reduce((h, e) => h + Number(e.data?.time_hours ?? 0), 0);
}
```

- [ ] **Step 3: Экраны**

`src/ui/screens/event/EventScreen.tsx`:

```tsx
import { buildConditionContext, formatClock, presentEvent, requireEvent } from '../../../engine';
import { Button } from '../../components/Button';
import { SceneArt } from '../../components/SceneArt';
import { ScreenFrame } from '../../components/ScreenFrame';
import { Typewriter } from '../../components/Typewriter';
import { VoiceLine } from '../../components/voices/VoiceLine';
import { PILLAR_NAMES, VOICE_NAMES } from '../../i18n/glossary';
import { useAct, useGame, useT } from '../../session/SessionContext';
import styles from './Event.module.css';
import { EVENT } from './strings';

export function EventScreen() {
  const { game, content, lang } = useGame();
  const act = useAct();
  const t = useT(EVENT);
  const event = requireEvent(content, game.eventQueue[0] ?? '');
  const view = presentEvent(event, game, buildConditionContext(game, content), content.balance);
  return (
    <ScreenFrame screen="event" title={PILLAR_NAMES[event.pillar][lang]} subtitle={t('when', { day: game.day, clock: formatClock(game.clockMin) })}>
      <div className={styles.layout}>
        <SceneArt scene={view.scene} className={styles.scene} />
        <div className={styles.panel}>
          <Typewriter text={view.text} />
          <div className={styles.voices}>
            {view.voices.map((v) => <VoiceLine key={v.voice} voice={v.voice} text={v.text} />)}
          </div>
          <ol className={styles.options}>
            {view.options.map((o, i) => {
              const check = event.options[i]?.check;
              return (
                <li key={o.id}>
                  <Button variant="secondary" className={styles.option} disabled={!o.available} onClick={() => act({ type: 'resolve_event', optionId: o.id })}>
                    {o.text}
                    {check && o.chance !== null && <span className={`${styles.odds} mono`}> {t('check', { voice: VOICE_NAMES[check.voice][lang], pct: Math.round(o.chance * 100) })}</span>}
                    {!o.available && <span className={styles.na}> {t('unavailable')}</span>}
                  </Button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </ScreenFrame>
  );
}
```

`src/ui/screens/event/OutcomeScreen.tsx`:

```tsx
import type { Resources } from '../../../engine';
import { Button } from '../../components/Button';
import { SceneArt } from '../../components/SceneArt';
import { ScreenFrame } from '../../components/ScreenFrame';
import { COMMON } from '../../i18n/common';
import { useAct, useGame, useSession, useT } from '../../session/SessionContext';
import { signed } from '../../view/format';
import { describeEntry, isNoise } from '../../view/logbook';
import { RESOURCE_NAMES } from '../../view/strings';
import { sumDeltas, timeSpentHours } from './deltas';
import styles from './Event.module.css';
import { EVENT } from './strings';

export function OutcomeScreen() {
  const { content, lang } = useGame();
  const { session } = useSession();
  const act = useAct();
  const t = useT(EVENT);
  const tc = useT(COMMON);
  const outcome = session.ui.outcome;
  if (!outcome) return null;
  const event = content.events.find((e) => e.id === outcome.eventId);
  const option = event?.options.find((o) => o.id === outcome.optionId);
  const lines = outcome.entries.filter((e) => !isNoise(e)).flatMap((e) => describeEntry(e, content, lang) ?? []);
  const deltas = Object.entries(sumDeltas(outcome.entries)) as [keyof Resources, number][];
  const hours = timeSpentHours(outcome.entries);
  return (
    <ScreenFrame screen="outcome" title={t('outcomeTitle')} subtitle={option?.text[lang]} actions={<Button onClick={() => act({ type: 'outcome_seen' })}>{tc('next')}</Button>}>
      <div className={styles.layout}>
        {event && <SceneArt scene={event.scene} className={styles.scene} />}
        <div className={styles.panel}>
          <ul className={styles.lines}>
            {lines.map((l, i) => <li key={i} data-tone={l.tone}>{l.text}</li>)}
          </ul>
          <h2 className={styles.h2}>{t('changes')}</h2>
          {deltas.length === 0 ? <p>{t('noChanges')}</p> : (
            <ul className={styles.chips}>
              {deltas.map(([k, v]) => <li key={k} data-sign={v > 0 ? 'plus' : 'minus'}>{RESOURCE_NAMES[k][lang]} <span className="mono">{signed(v)}</span></li>)}
            </ul>
          )}
          {hours > 0 && <p className="mono">{t('timeSpent', { h: hours })}</p>}
        </div>
      </div>
    </ScreenFrame>
  );
}
```

`src/ui/screens/event/Event.module.css`:

```css
.layout { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: var(--space-6); align-items: start; }
.scene { position: sticky; top: var(--space-4); }
.panel { display: grid; gap: var(--space-4); }
.voices { display: grid; gap: var(--space-2); }
.options { margin: 0; padding-left: var(--space-6); display: grid; gap: var(--space-2); }
.option { width: 100%; text-align: left; }
.odds { color: var(--fg-soft); font-size: var(--text-sm); }
.na { font-style: italic; }
.lines { margin: 0; padding-left: var(--space-4); display: grid; gap: var(--space-1); }
.lines li[data-tone='good'] { color: var(--ok); }
.lines li[data-tone='bad'] { color: var(--bad); }
.h2 { font-size: var(--text-lg); margin: 0; }
.chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
.chips li { padding: var(--space-1) var(--space-3); border-radius: 999px; background: var(--panel); border: 1px solid var(--line); }
.chips li[data-sign='minus'] { border-color: var(--bad); }
.chips li[data-sign='plus'] { border-color: var(--ok); }
```

- [ ] **Step 4: Запустить тесты**

Run: `npx vitest run tests/ui/screens/EventScreen.test.tsx tests/ui/screens/event-deltas.test.ts tests/ui/i18n.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/event tests/ui/screens/EventScreen.test.tsx tests/ui/screens/event-deltas.test.ts
git commit -m "feat: add event scene and choice outcome screens"
```

---

### Task 11: Разбор недели и бортжурнал

**Files:**
- Modify (заменить заглушки): `src/ui/screens/debrief/DebriefScreen.tsx`, `src/ui/components/logbook/LogbookDrawer.tsx`
- Create: `src/ui/screens/debrief/strings.ts`, `src/ui/screens/debrief/GradeMark.tsx`, `src/ui/screens/debrief/LinkCard.tsx`, `src/ui/screens/debrief/Debrief.module.css`, `src/ui/components/logbook/strings.ts`, `src/ui/components/logbook/Logbook.module.css`
- Test: `tests/ui/screens/DebriefScreen.test.tsx`, `tests/ui/components/LogbookDrawer.test.tsx`

**Interfaces:**
- Consumes: `buildDebrief, formatClock, type DebriefLink, type Grade` из движка; `describeEntry, logbookDays` (Task 3); `ScreenFrame, Button`, `useGame, useSession, useAct, useT`, `PILLAR_NAMES`, `COMMON`, `clearSave` (Task 1).
- Produces: `DebriefScreen` (`data-screen="debrief"`), `GradeMark`, `LinkCard`, `LogbookDrawer` (кнопка «Бортжурнал» плюс панель `role="dialog"`).

**Поведение:**
- **Разбор** (ТЗ 4.9, 6.1): «страница бортжурнала с пометками наставника».
  - Четыре шкалы (безопасность, экипаж, лодка, расписание), у каждой отметка ✓ / ~ / ✗ (`aria-label` с оценкой словами) и деталь: число травм, итоговое настроение, возврат депозита, вовремя ли.
  - Связи «решение → последствие → сигнал»: текст правила рукописным шрифтом, под ним три строки с днём и временем из `describeEntry`.
  - Затем заметки по событиям.
  - Кнопки: «Сыграть ту же неделю» (`new_game` с `game.seed`), «Новая неделя» (случайный seed), «В меню».
  - При показе разбора слот сохранения очищается (неделя окончена; иначе «Продолжить» вернул бы в утро 6-го дня).
- **Бортжурнал** (ТЗ 6.1 «Бортжурнал»): плавающая кнопка в углу, пока идёт игра. Панель с записями по дням (`logbookDays`), время моноширинным, тон строки цветом. Закрывается кнопкой и клавишей Escape.

- [ ] **Step 1: Написать падающие тесты**

`tests/ui/screens/DebriefScreen.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildDebrief } from '../../../src/engine';
import { memoryStorage, readSave, writeSave } from '../../../src/ui/session/save';
import { content, gameAt } from '../fixtures';
import { renderShell } from '../render';

describe('DebriefScreen', () => {
  it('shows the four scales and every debrief link', () => {
    const game = gameAt('debrief');
    renderShell(game);
    for (const name of ['Безопасность', 'Экипаж', 'Лодка', 'Расписание']) expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    const d = buildDebrief(game, content);
    for (const l of d.links) expect(screen.getByText(l.text.ru)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Оценка:/)).toHaveLength(4);
  });

  it('clears the save slot and replays the same week', async () => {
    const storage = memoryStorage();
    writeSave(storage, gameAt('morning'), new Date());
    const game = gameAt('debrief', 99);
    const r = renderShell(game, { storage });
    expect(readSave(storage, content).kind).toBe('none');
    await r.user.click(screen.getByRole('button', { name: 'Сыграть ту же неделю' }));
    expect(r.currentScreen()).toBe('captain');
    expect(r.session().game!.seed).toBe(99);
  });

  it('goes back to the menu', async () => {
    const r = renderShell(gameAt('debrief'));
    await r.user.click(screen.getByRole('button', { name: 'В меню' }));
    expect(r.currentScreen()).toBe('menu');
  });
});
```

`tests/ui/components/LogbookDrawer.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { gameAt } from '../fixtures';
import { renderShell } from '../render';

describe('LogbookDrawer', () => {
  it('opens the logbook with entries by day and closes on Escape', async () => {
    const r = renderShell(gameAt('evening'));
    await r.user.click(screen.getByRole('button', { name: 'Бортжурнал' }));
    const dialog = screen.getByRole('dialog', { name: 'Бортжурнал' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'День 1' })).toBeInTheDocument();
    expect(screen.getByText(/Взяли лодку/)).toBeInTheDocument();
    await r.user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is absent in the menu', () => {
    renderShell(null);
    expect(screen.queryByRole('button', { name: 'Бортжурнал' })).toBeNull();
  });
});
```

Run: `npx vitest run tests/ui/screens/DebriefScreen.test.tsx tests/ui/components/LogbookDrawer.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Строки**

`src/ui/screens/debrief/strings.ts`:

```ts
import { dict } from '../../i18n/t';

export const DEBRIEF = dict({
  title: { ru: 'Разбор недели', en: 'Week debrief' },
  subtitle: { ru: 'Бортжурнал с пометками капитана-наставника', en: 'The logbook, annotated by a mentor skipper' },
  safety: { ru: 'Безопасность', en: 'Safety' },
  crew: { ru: 'Экипаж', en: 'Crew' },
  boat: { ru: 'Лодка', en: 'Boat' },
  schedule: { ru: 'Расписание', en: 'Schedule' },
  gradeGood: { ru: 'Оценка: хорошо', en: 'Grade: good' },
  gradeOk: { ru: 'Оценка: так себе', en: 'Grade: so-so' },
  gradeBad: { ru: 'Оценка: плохо', en: 'Grade: bad' },
  noInjuries: { ru: 'Никто не пострадал', en: 'Nobody got hurt' },
  injuries: { ru: 'Травм: {n}', en: 'Injuries: {n}' },
  mood: { ru: 'Настроение в конце: {n}/100', en: 'Final mood: {n}/100' },
  deposit: { ru: 'Депозит: вернули {returned} €, удержали {loss} €', en: 'Deposit: €{returned} back, €{loss} kept' },
  onTime: { ru: 'Вернулись вовремя', en: 'Back on time' },
  late: { ru: 'Опоздали к сдаче', en: 'Late for handover' },
  links: { ru: 'Что решило неделю', en: 'What decided the week' },
  decision: { ru: 'Решение', en: 'Decision' },
  consequence: { ru: 'Последствие', en: 'Consequence' },
  signal: { ru: 'Сигнал, который был', en: 'The sign that was there' },
  stamp: { ru: 'день {day}, {clock}', en: 'day {day}, {clock}' },
  notes: { ru: 'Ещё заметки на полях', en: 'More notes in the margin' },
  replay: { ru: 'Сыграть ту же неделю', en: 'Replay the same week' },
  newWeek: { ru: 'Новая неделя', en: 'New week' },
});
```

`src/ui/components/logbook/strings.ts`:

```ts
import { dict } from '../../i18n/t';

export const LOGBOOK = dict({
  dayZero: { ru: 'Вечер перед выходом', en: 'The evening before departure' },
  empty: { ru: 'Записей пока нет.', en: 'No entries yet.' },
});
```

- [ ] **Step 3: Разбор**

`src/ui/screens/debrief/GradeMark.tsx`:

```tsx
import type { Grade } from '../../../engine';
import { useT } from '../../session/SessionContext';
import styles from './Debrief.module.css';
import { DEBRIEF } from './strings';

const MARK: Readonly<Record<Grade, string>> = { good: '✓', ok: '~', bad: '✗' };
const KEY = { good: 'gradeGood', ok: 'gradeOk', bad: 'gradeBad' } as const;

export function GradeMark({ grade }: { grade: Grade }) {
  const t = useT(DEBRIEF);
  return <span className={styles.mark} data-grade={grade} role="img" aria-label={t(KEY[grade])}>{MARK[grade]}</span>;
}
```

`src/ui/screens/debrief/LinkCard.tsx`:

```tsx
import { formatClock, type DebriefLink, type LogEntry } from '../../../engine';
import { PILLAR_NAMES } from '../../i18n/glossary';
import { useGame, useT } from '../../session/SessionContext';
import { describeEntry } from '../../view/logbook';
import styles from './Debrief.module.css';
import { DEBRIEF } from './strings';

export function LinkCard({ link }: { link: DebriefLink }) {
  const { content, lang } = useGame();
  const t = useT(DEBRIEF);
  const row = (title: string, e: LogEntry) => (
    <p className={styles.step}>
      <strong>{title}:</strong> {describeEntry(e, content, lang)?.text ?? e.cause}{' '}
      <span className={`${styles.stamp} mono`}>({t('stamp', { day: e.day, clock: formatClock(e.clockMin) })})</span>
    </p>
  );
  return (
    <article className={styles.link} data-pillar={link.pillar}>
      <span className={styles.pillar}>{PILLAR_NAMES[link.pillar][lang]}</span>
      <p className={styles.note}>{link.text[lang]}</p>
      {row(t('decision'), link.decision)}
      {row(t('consequence'), link.consequence)}
      {link.signal && row(t('signal'), link.signal)}
    </article>
  );
}
```

`src/ui/screens/debrief/DebriefScreen.tsx`:

```tsx
import { useEffect } from 'react';
import { buildDebrief, type Grade } from '../../../engine';
import { Button } from '../../components/Button';
import { ScreenFrame } from '../../components/ScreenFrame';
import { COMMON } from '../../i18n/common';
import { clearSave } from '../../session/save';
import { useAct, useGame, useSession, useT } from '../../session/SessionContext';
import styles from './Debrief.module.css';
import { GradeMark } from './GradeMark';
import { LinkCard } from './LinkCard';
import { DEBRIEF } from './strings';

const SEED_RANGE = 2 ** 31;

export function DebriefScreen() {
  const { game, content, lang } = useGame();
  const { storage } = useSession();
  const act = useAct();
  const t = useT(DEBRIEF);
  const tc = useT(COMMON);
  useEffect(() => clearSave(storage), [storage]);
  const d = buildDebrief(game, content);
  const scales: Array<[keyof typeof d.scales, Grade, string]> = [
    ['safety', d.scales.safety, game.injuries > 0 ? t('injuries', { n: game.injuries }) : t('noInjuries')],
    ['crew', d.scales.crew, t('mood', { n: Math.round(game.resources.mood) })],
    ['boat', d.scales.boat, t('deposit', { returned: d.depositReturnedEur, loss: d.depositLossEur })],
    ['schedule', d.scales.schedule, game.returnedOnTime ? t('onTime') : t('late')],
  ];
  return (
    <ScreenFrame
      screen="debrief"
      title={t('title')}
      subtitle={t('subtitle')}
      actions={(
        <>
          <Button variant="ghost" onClick={() => act({ type: 'to_menu' })}>{tc('menu')}</Button>
          <Button variant="secondary" onClick={() => act({ type: 'new_game', seed: Math.floor(Math.random() * SEED_RANGE) })}>{t('newWeek')}</Button>
          <Button onClick={() => act({ type: 'new_game', seed: game.seed })}>{t('replay')}</Button>
        </>
      )}
    >
      <div className={styles.scales}>
        {scales.map(([key, grade, detail]) => (
          <section key={key} className={styles.scale} data-grade={grade}>
            <h2>{t(key)}</h2>
            <GradeMark grade={grade} />
            <p>{detail}</p>
          </section>
        ))}
      </div>
      <h2 className={styles.h2}>{t('links')}</h2>
      <div className={styles.links}>{d.links.map((l) => <LinkCard key={l.ruleId} link={l} />)}</div>
      {d.eventNotes.length > 0 && (
        <>
          <h2 className={styles.h2}>{t('notes')}</h2>
          <ul className={styles.notes}>{d.eventNotes.map((n) => <li key={n.en}>{n[lang]}</li>)}</ul>
        </>
      )}
    </ScreenFrame>
  );
}
```

`src/ui/screens/debrief/Debrief.module.css`:

```css
.scales { display: grid; gap: var(--space-3); grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.scale { background: var(--panel); border-radius: var(--radius); padding: var(--space-3) var(--space-4); box-shadow: var(--shadow); display: grid; gap: var(--space-1); }
.scale h2 { margin: 0; font-size: var(--text-lg); }
.scale p { margin: 0; color: var(--fg-soft); font-size: var(--text-sm); }
.mark { font-family: var(--font-hand); font-size: 2.5rem; line-height: 1; }
.mark[data-grade='good'] { color: var(--ok); }
.mark[data-grade='ok'] { color: var(--warn); }
.mark[data-grade='bad'] { color: var(--bad); }
.h2 { margin: var(--space-8) 0 var(--space-3); }
.links { display: grid; gap: var(--space-4); }
.link { position: relative; padding: var(--space-4); background: var(--panel); border-left: 4px solid var(--accent); border-radius: var(--radius); }
.pillar { font-variant: small-caps; letter-spacing: 0.05em; color: var(--fg-soft); }
.note { font-family: var(--font-hand); font-size: var(--text-xl); color: var(--red-500); margin: var(--space-1) 0 var(--space-2); transform: rotate(-0.4deg); }
.step { margin: var(--space-1) 0; }
.stamp { color: var(--fg-soft); font-size: var(--text-sm); }
.notes { padding-left: var(--space-4); font-family: var(--font-hand); font-size: var(--text-lg); }
```

- [ ] **Step 4: Бортжурнал**

`src/ui/components/logbook/LogbookDrawer.tsx` (заменить заглушку):

```tsx
import { useState, type KeyboardEvent } from 'react';
import { COMMON } from '../../i18n/common';
import { useSession, useT } from '../../session/SessionContext';
import { logbookDays } from '../../view/logbook';
import { Button } from '../Button';
import styles from './Logbook.module.css';
import { LOGBOOK } from './strings';

export function LogbookDrawer() {
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const t = useT(LOGBOOK);
  const tc = useT(COMMON);
  const game = session.game;
  if (!game) return null;
  const days = open ? logbookDays(game.log, session.content, session.lang) : [];
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => { if (e.key === 'Escape') setOpen(false); };
  return (
    <>
      <Button variant="secondary" className={styles.toggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{tc('logbook')}</Button>
      {open && (
        <div role="dialog" aria-label={tc('logbook')} className={styles.drawer} onKeyDown={onKey} tabIndex={-1} ref={(el) => el?.focus()}>
          <header className={styles.head}>
            <h2>{tc('logbook')}</h2>
            <Button variant="ghost" onClick={() => setOpen(false)}>{tc('dismiss')}</Button>
          </header>
          {days.length === 0 && <p>{t('empty')}</p>}
          {days.map((d) => (
            <section key={d.day}>
              <h3 className={styles.day}>{d.day === 0 ? t('dayZero') : tc('day', { n: d.day })}</h3>
              <ol className={styles.lines}>
                {d.lines.map((l, i) => (
                  <li key={i} data-tone={l.tone}><span className="mono">{l.clock}</span> {l.text}</li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
```

`src/ui/components/logbook/Logbook.module.css`:

```css
.toggle { position: fixed; right: var(--space-4); bottom: var(--space-4); z-index: 30; box-shadow: var(--shadow); background: var(--panel); }
.drawer {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 40; width: min(420px, 100vw); overflow-y: auto;
  padding: var(--space-4) var(--space-6); background: var(--paper); color: var(--ink); box-shadow: -4px 0 16px rgb(0 0 0 / 0.2);
  font-family: var(--font-hand); font-size: var(--text-lg);
}
.drawer:focus { outline: none; }
.head { display: flex; justify-content: space-between; align-items: center; }
.head h2 { margin: 0; font-family: var(--font-serif); }
.day { margin: var(--space-4) 0 var(--space-1); border-bottom: 1px solid var(--line); }
.lines { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--space-1); }
.lines li[data-tone='good'] { color: var(--ok); }
.lines li[data-tone='bad'] { color: var(--bad); }
```

- [ ] **Step 5: Запустить тесты**

Run: `npx vitest run tests/ui/screens/DebriefScreen.test.tsx tests/ui/components/LogbookDrawer.test.tsx tests/ui/i18n.test.ts && npm run typecheck`
Expected: PASS. Если разбор в тесте не нашёл связей (`d.links` пуст), тест всё равно проходит: проверяются шкалы. Полноту связей уже гарантируют приёмочные тесты Этапа 1.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens/debrief src/ui/components/logbook tests/ui/screens/DebriefScreen.test.tsx tests/ui/components/LogbookDrawer.test.tsx
git commit -m "feat: add week debrief and logbook drawer"
```

---

### Task 12: Планировщик дня (главный экран: карта, прогноз, план, предпросмотр)

**Files:**
- Modify (заменить заглушку): `src/ui/screens/planning/PlanningScreen.tsx`
- Create: `src/ui/screens/planning/planDraft.ts`, `src/ui/screens/planning/LegEditor.tsx`, `src/ui/screens/planning/ForecastPanel.tsx`, `src/ui/screens/planning/PreviewPanel.tsx`, `src/ui/screens/planning/DaySettings.tsx`, `src/ui/screens/planning/strings.ts`, `src/ui/screens/planning/Planning.module.css`
- Test: `tests/ui/screens/planDraft.test.ts`, `tests/ui/screens/PlanningScreen.test.tsx`

**Interfaces:**
- Consumes: `previewPlan, formatClock, requireRoute, type LegPlan, type DayPlan, type ShowerDiscipline, type PlanPreview` из движка (Task 2); `ChartMap` (Task 8); `ResourcePanel`, `routesFrom, routeBetween, pointName`, `formatHour`, `SHOWER_NAMES, MODE_NAMES` (Task 3); `WindRose`, `VoiceLine` (Task 4); `FEATURE_NAMES` (Task 8); `ScreenFrame, Button`, `useGame, useAct, useT`, `COMMON` (Task 1).
- Produces:
  - `Draft`, `departureOptions(game, content): number[]`, `initialDraft(game, content): Draft`, `trailOf(content, from, legs): string[]`, `reachableFrom(content, game, draft): string[]`, `addLeg(content, game, draft, toId): Draft`, `removeLastLeg(draft)`, `updateLeg(draft, i, patch)`, `toDayPlan(draft): DayPlan` (`planDraft.ts`)
  - `PlanningScreen` (`data-screen="planning"`), `LegEditor`, `ForecastPanel`, `PreviewPanel`, `DaySettings`

**Поведение (ТЗ 4.3–4.5, 6.1 «Карта (главный экран)»):**
- Карта: лодка-фишка в текущей точке, пунктир плана (`trail`). Соседние точки последней точки маршрута — кнопки: клик добавляет переход. Роза ветров показывает прогноз.
- Прогноз (`ForecastPanel`): средний ветер, порывы, направление, барометр. Если `weather.signalsVisible`: тренд барометра, а при фронте — реплика Морского чутья «На западе собираются тучи, барометр падает». Иначе пометка «На барометр сегодня не смотрели».
- Переходы (`LegEditor`): «A → B · N миль · особенность». Мотор или парус. Под парусом: рифы 0/1/2, генуя полная или частичная, курс напрямую или полным курсом. «Убрать последний переход».
- День (`DaySettings`): час выхода (только из `departureOptions`: с шагом 30 мин, не раньше текущих часов и не позже заката), купания 0..`maxSwimStops`, душ (строгий, обычный, свободный), автопилот (только когда есть переходы).
- Предпросмотр (`PreviewPanel`, только `previewPlan`):
  - выход и приход, ожидаемый ветер по участку (с пометкой «с учётом местного усиления», если его видит Морское чутьё), ход и часы, риск перепарусения или рифа на ходу;
  - предупреждения: приход после заката; места в марине могут кончиться; в последний день точка назначения не база или приход позже срока; топлива может не хватить;
  - сколько часов останется на отдых.
- Кнопки: без переходов — «Провести день здесь» (`draft_plan` с пустыми `legs`), с переходами — «К манёврам». Если `departureOptions` пуст (уже закат), переходы добавить нельзя: показано «Сегодня уже поздно выходить».

- [ ] **Step 1: Написать падающие тесты**

`tests/ui/screens/planDraft.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addLeg, departureOptions, initialDraft, reachableFrom, removeLastLeg, toDayPlan, trailOf, updateLeg } from '../../../src/ui/screens/planning/planDraft';
import { content, gameAt } from '../fixtures';

describe('planDraft', () => {
  const game = { ...gameAt('planning'), locationId: 'base_marina', clockMin: 8 * 60 };

  it('offers half-hour departures from now until sunset', () => {
    const opts = departureOptions({ ...game, clockMin: 11 * 60 + 10 }, content);
    expect(opts[0]).toBe(11.5);
    expect(opts.at(-1)).toBeLessThan(content.balance.time.sunsetHour);
    expect(departureOptions({ ...game, clockMin: content.balance.time.sunsetHour * 60 }, content)).toEqual([]);
  });

  it('chains legs from the current point and lists the next reachable points', () => {
    let d = initialDraft(game, content);
    expect(reachableFrom(content, game, d)).toContain('cala_azzurra');
    d = addLeg(content, game, d, 'cala_azzurra');
    d = addLeg(content, game, d, 'kastri_marina');
    expect(trailOf(content, game.locationId, d.legs)).toEqual(['base_marina', 'cala_azzurra', 'kastri_marina']);
    expect(addLeg(content, game, d, 'blue_lagoon')).toBe(d);
    expect(removeLastLeg(d).legs).toHaveLength(1);
  });

  it('edits a leg immutably and builds a DayPlan', () => {
    const d = addLeg(content, game, initialDraft(game, content), 'cala_azzurra');
    const sail = updateLeg(d, 0, { mode: 'sail', reefs: 1 });
    expect(d.legs[0]!.mode).toBe('motor');
    expect(toDayPlan(sail)).toMatchObject({ legs: [{ routeId: 'r_base_marina_cala_azzurra', mode: 'sail', reefs: 1 }], shower: 'normal' });
  });
});
```

`tests/ui/screens/PlanningScreen.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { gameAt } from '../fixtures';
import { renderShell } from '../render';

const atBase = () => ({ ...gameAt('planning'), locationId: 'base_marina', clockMin: 8 * 60 });

describe('PlanningScreen', () => {
  it('shows the forecast and lets you add and remove a leg on the chart', async () => {
    const r = renderShell(atBase());
    expect(screen.getAllByRole('img', { name: /уз/ }).length).toBeGreaterThan(0);
    await r.user.click(screen.getByRole('button', { name: 'Кала-Адзурра' }));
    expect(screen.getByText(/Марина Порто-Кало \(база\) → Кала-Адзурра/)).toBeInTheDocument();
    expect(screen.getByText(/Приход около/)).toBeInTheDocument();
    await r.user.click(screen.getByRole('button', { name: 'Убрать последний переход' }));
    expect(screen.queryByText(/Приход около/)).toBeNull();
  });

  it('a stay day goes straight to the evening', async () => {
    const r = renderShell(atBase());
    await r.user.click(screen.getByRole('button', { name: 'Провести день здесь' }));
    expect(['evening', 'event']).toContain(r.currentScreen());
  });

  it('a sailing day goes to the maneuvers with the plan as drafted', async () => {
    const r = renderShell(atBase());
    await r.user.click(screen.getByRole('button', { name: 'Кала-Адзурра' }));
    await r.user.click(screen.getByLabelText('Под парусом'));
    await r.user.click(screen.getByRole('button', { name: 'К манёврам' }));
    expect(r.currentScreen()).toBe('maneuvers');
    expect(r.session().ui.draftPlan?.legs[0]).toMatchObject({ routeId: 'r_base_marina_cala_azzurra', mode: 'sail' });
  });

  it('after sunset only offers to stay', () => {
    renderShell({ ...atBase(), clockMin: 20 * 60 + 30 });
    expect(screen.getByText('Сегодня уже поздно выходить')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Кала-Адзурра' })).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Провести день здесь' })).toBeEnabled();
  });

  it('an engine rejection shows a localized banner and keeps the screen', () => {
    const r = renderShell(atBase());
    r.dispatch({ type: 'draft_plan', plan: { departureHour: 3, legs: [], swimStops: 0, shower: 'normal', autopilot: false } });
    expect(screen.getByRole('alert')).toHaveTextContent(/^Не получилось:/);
    expect(r.currentScreen()).toBe('planning');
  });
});
```

Run: `npx vitest run tests/ui/screens/planDraft.test.ts tests/ui/screens/PlanningScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Черновик плана**

`src/ui/screens/planning/planDraft.ts`:

```ts
import type { Content, DayPlan, GameState, LegPlan, ShowerDiscipline } from '../../../engine';
import { routeBetween, routesFrom } from '../../view/map';

export interface Draft { legs: LegPlan[]; departureHour: number; swimStops: number; shower: ShowerDiscipline; autopilot: boolean }

const STEP_HOURS = 0.5;
const MIN_PER_HOUR = 60;

/** Half-hour slots from max(earliest, now) up to (not including) sunset. Empty = too late to leave. */
export function departureOptions(game: GameState, content: Content): number[] {
  const t = content.balance.time;
  const now = Math.ceil(game.clockMin / MIN_PER_HOUR / STEP_HOURS) * STEP_HOURS;
  const out: number[] = [];
  for (let h = Math.max(t.earliestDepartureHour, now); h < t.sunsetHour; h += STEP_HOURS) out.push(h);
  return out;
}

export function initialDraft(game: GameState, content: Content): Draft {
  return { legs: [], departureHour: departureOptions(game, content)[0] ?? content.balance.time.earliestDepartureHour, swimStops: 0, shower: 'normal', autopilot: false };
}

export function trailOf(content: Content, from: string, legs: readonly LegPlan[]): string[] {
  const out = [from];
  for (const leg of legs) {
    const at = out[out.length - 1]!;
    const r = content.routes.find((x) => x.id === leg.routeId);
    const next = r ? (r.from === at ? r.to : r.to === at ? r.from : null) : null;
    if (!next) break;
    out.push(next);
  }
  return out;
}

export function reachableFrom(content: Content, game: GameState, draft: Draft): string[] {
  const trail = trailOf(content, game.locationId, draft.legs);
  return routesFrom(content, trail[trail.length - 1]!).map((r) => r.to.id);
}

export function addLeg(content: Content, game: GameState, draft: Draft, toId: string): Draft {
  const trail = trailOf(content, game.locationId, draft.legs);
  const route = routeBetween(content, trail[trail.length - 1]!, toId);
  if (!route) return draft;
  return { ...draft, legs: [...draft.legs, { routeId: route.id, mode: 'motor', reefs: 0, genoa: 'full', course: 'direct' }] };
}

export const removeLastLeg = (d: Draft): Draft => ({ ...d, legs: d.legs.slice(0, -1) });

export const updateLeg = (d: Draft, i: number, patch: Partial<LegPlan>): Draft =>
  ({ ...d, legs: d.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

export const toDayPlan = (d: Draft): DayPlan =>
  ({ departureHour: d.departureHour, legs: d.legs, swimStops: d.swimStops, shower: d.shower, autopilot: d.legs.length > 0 && d.autopilot });
```

- [ ] **Step 3: Строки**

`src/ui/screens/planning/strings.ts`:

```ts
import { dict } from '../../i18n/t';

export const PLANNING = dict({
  title: { ru: 'План дня {n}', en: 'Plan for day {n}' },
  subtitle: { ru: 'Нажмите на соседнюю точку на карте, чтобы добавить переход.', en: 'Tap a neighbouring point on the chart to add a leg.' },
  forecast: { ru: 'Прогноз', en: 'Forecast' },
  forecastWind: { ru: 'Ветер {kn} уз, порывы {gust} уз, {dir}', en: 'Wind {kn} kn, gusts {gust} kn, {dir}' },
  barometer: { ru: 'Барометр {hpa} гПа', en: 'Barometer {hpa} hPa' },
  trend: { ru: 'Барометр {hpa} гПа ({trend} за ночь)', en: 'Barometer {hpa} hPa ({trend} overnight)' },
  frontSigns: { ru: 'На западе собираются тучи, барометр падает. После обеда задует сильнее прогноза.', en: 'Clouds are gathering in the west and the barometer is falling. It will blow harder than forecast after lunch.' },
  noBarometer: { ru: 'На барометр сегодня не смотрели.', en: 'Nobody checked the barometer today.' },
  legs: { ru: 'Переходы', en: 'Legs' },
  noLegs: { ru: 'Переходов нет: день на месте.', en: 'No legs: a day in place.' },
  leg: { ru: '{from} → {to} · {nm} миль', en: '{from} → {to} · {nm} nm' },
  motor: { ru: 'На моторе', en: 'Under engine' },
  sail: { ru: 'Под парусом', en: 'Under sail' },
  reefs: { ru: 'Рифы', en: 'Reefs' },
  genoaFull: { ru: 'Генуя полностью', en: 'Full genoa' },
  genoaPartial: { ru: 'Генуя частично', en: 'Part-furled genoa' },
  direct: { ru: 'Напрямую', en: 'Direct' },
  detour: { ru: 'Крюк полным курсом', en: 'Detour on a broad reach' },
  removeLeg: { ru: 'Убрать последний переход', en: 'Remove last leg' },
  day: { ru: 'День', en: 'Day' },
  departure: { ru: 'Выход', en: 'Departure' },
  swims: { ru: 'Остановок на купание', en: 'Swim stops' },
  shower: { ru: 'Душ', en: 'Showers' },
  autopilot: { ru: 'Автопилот', en: 'Autopilot' },
  preview: { ru: 'Оценка капитана', en: "Skipper's estimate" },
  times: { ru: 'Выход в {dep}. Приход около {arr}.', en: 'Leave at {dep}. Arrive around {arr}.' },
  legPreview: { ru: '{to}: ветер ~{wind} уз, ход {speed} уз, {hours} ч', en: '{to}: wind ~{wind} kn, speed {speed} kn, {hours} h' },
  localKnown: { ru: '(с учётом местного усиления)', en: '(local effect included)' },
  overpowered: { ru: 'Парусов слишком много для такого ветра: крен и укачивание.', en: 'Too much sail for this wind: heeling and seasickness.' },
  forcedReef: { ru: 'Придётся рифиться на ходу.', en: 'You will have to reef underway.' },
  afterSunset: { ru: 'Придёте после заката.', en: 'You will arrive after sunset.' },
  marinaLate: { ru: 'К этому часу места в марине могут кончиться.', en: 'The marina may be full by then.' },
  mustReturn: { ru: 'Сегодня нужно вернуться на базу.', en: 'You need to be back at base today.' },
  tooLateForBase: { ru: 'Не успеваете на базу к {time}.', en: 'You will not make base by {time}.' },
  fuelShort: { ru: 'Топлива может не хватить: нужно ~{need} л.', en: 'Fuel may run short: about {need} L needed.' },
  rest: { ru: 'На отдых останется около {h} ч.', en: 'About {h} h left for rest.' },
  stayRest: { ru: 'День на месте: отдых и купание.', en: 'A day in place: rest and swimming.' },
  tooLate: { ru: 'Сегодня уже поздно выходить', en: 'Too late to leave today' },
  stay: { ru: 'Провести день здесь', en: 'Spend the day here' },
  toManeuvers: { ru: 'К манёврам', en: 'On to maneuvers' },
});
```

- [ ] **Step 4: Панели**

`src/ui/screens/planning/ForecastPanel.tsx`:

```tsx
import { WindRose } from '../../components/WindRose';
import { VoiceLine } from '../../components/voices/VoiceLine';
import { useGame, useT } from '../../session/SessionContext';
import { signed } from '../../view/format';
import styles from './Planning.module.css';
import { PLANNING } from './strings';

export function ForecastPanel() {
  const { game } = useGame();
  const t = useT(PLANNING);
  const w = game.weather;
  if (!w) return null;
  return (
    <section className={styles.forecast}>
      <h2>{t('forecast')}</h2>
      <WindRose dir={w.forecastDir} kn={w.forecastKn} gustKn={w.forecastGustKn} />
      <p>{t('forecastWind', { kn: w.forecastKn, gust: w.forecastGustKn, dir: w.forecastDir })}</p>
      {w.signalsVisible ? (
        <>
          <p className="mono">{t('trend', { hpa: w.barometerHpa, trend: signed(w.barometerTrendHpa) })}</p>
          {w.front && <VoiceLine voice="sea_sense" text={t('frontSigns')} />}
        </>
      ) : (
        <>
          <p className="mono">{t('barometer', { hpa: w.barometerHpa })}</p>
          <p className={styles.muted}>{t('noBarometer')}</p>
        </>
      )}
    </section>
  );
}
```

`src/ui/screens/planning/LegEditor.tsx`:

```tsx
import { requireRoute, type LegPlan } from '../../../engine';
import { Button } from '../../components/Button';
import { FEATURE_NAMES } from '../../components/chart/strings';
import { useGame, useT } from '../../session/SessionContext';
import { pointName } from '../../view/map';
import styles from './Planning.module.css';
import { PLANNING } from './strings';

export interface LegEditorProps { legs: readonly LegPlan[]; trail: readonly string[]; onChange: (i: number, patch: Partial<LegPlan>) => void; onRemoveLast: () => void }

export function LegEditor({ legs, trail, onChange, onRemoveLast }: LegEditorProps) {
  const { content, lang } = useGame();
  const t = useT(PLANNING);
  if (legs.length === 0) return <p className={styles.muted}>{t('noLegs')}</p>;
  return (
    <section className={styles.legs}>
      <h2>{t('legs')}</h2>
      <ol>
        {legs.map((leg, i) => {
          const route = requireRoute(content, leg.routeId);
          const features = route.features.filter((f) => f !== 'open').map((f) => FEATURE_NAMES[f][lang]).join(', ');
          const name = `leg-${i}`;
          return (
            <li key={`${leg.routeId}-${i}`} className={styles.leg}>
              <p className={styles.legTitle}>
                {t('leg', { from: pointName(content, trail[i]!, lang), to: pointName(content, trail[i + 1]!, lang), nm: route.distanceNm })}
                {features && <em> · {features}</em>}
              </p>
              <div className={styles.row}>
                <label><input type="radio" name={`${name}-mode`} checked={leg.mode === 'motor'} onChange={() => onChange(i, { mode: 'motor' })} /> {t('motor')}</label>
                <label><input type="radio" name={`${name}-mode`} checked={leg.mode === 'sail'} onChange={() => onChange(i, { mode: 'sail' })} /> {t('sail')}</label>
              </div>
              {leg.mode === 'sail' && (
                <div className={styles.row}>
                  <label>{t('reefs')}{' '}
                    <select value={leg.reefs} onChange={(e) => onChange(i, { reefs: Number(e.target.value) as 0 | 1 | 2 })}>
                      {[0, 1, 2].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <select aria-label={t('genoaFull')} value={leg.genoa} onChange={(e) => onChange(i, { genoa: e.target.value as LegPlan['genoa'] })}>
                    <option value="full">{t('genoaFull')}</option>
                    <option value="partial">{t('genoaPartial')}</option>
                  </select>
                  <select aria-label={t('direct')} value={leg.course} onChange={(e) => onChange(i, { course: e.target.value as LegPlan['course'] })}>
                    <option value="direct">{t('direct')}</option>
                    <option value="detour">{t('detour')}</option>
                  </select>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <Button variant="ghost" onClick={onRemoveLast}>{t('removeLeg')}</Button>
    </section>
  );
}
```

`src/ui/screens/planning/DaySettings.tsx`:

```tsx
import type { ShowerDiscipline } from '../../../engine';
import { useGame, useT } from '../../session/SessionContext';
import { formatHour } from '../../view/format';
import { SHOWER_NAMES } from '../../view/strings';
import type { Draft } from './planDraft';
import styles from './Planning.module.css';
import { PLANNING } from './strings';

const SHOWERS: readonly ShowerDiscipline[] = ['strict', 'normal', 'loose'];

export interface DaySettingsProps { draft: Draft; departures: readonly number[]; onChange: (patch: Partial<Draft>) => void }

export function DaySettings({ draft, departures, onChange }: DaySettingsProps) {
  const { content, lang } = useGame();
  const t = useT(PLANNING);
  const maxSwims = content.balance.time.maxSwimStops;
  return (
    <section className={styles.settings}>
      <h2>{t('day')}</h2>
      {draft.legs.length > 0 && (
        <label>{t('departure')}{' '}
          <select value={draft.departureHour} onChange={(e) => onChange({ departureHour: Number(e.target.value) })}>
            {departures.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
          </select>
        </label>
      )}
      <label>{t('swims')}{' '}
        <select value={draft.swimStops} onChange={(e) => onChange({ swimStops: Number(e.target.value) })}>
          {Array.from({ length: maxSwims + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <fieldset className={styles.row}>
        <legend>{t('shower')}</legend>
        {SHOWERS.map((s) => (
          <label key={s}><input type="radio" name="shower" checked={draft.shower === s} onChange={() => onChange({ shower: s })} /> {SHOWER_NAMES[s][lang]}</label>
        ))}
      </fieldset>
      {draft.legs.length > 0 && (
        <label><input type="checkbox" checked={draft.autopilot} onChange={(e) => onChange({ autopilot: e.target.checked })} /> {t('autopilot')}</label>
      )}
    </section>
  );
}
```

`src/ui/screens/planning/PreviewPanel.tsx`:

```tsx
import { formatClock, type PlanPreview } from '../../../engine';
import { useGame, useT } from '../../session/SessionContext';
import { formatHour } from '../../view/format';
import { pointName } from '../../view/map';
import styles from './Planning.module.css';
import { PLANNING } from './strings';

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function PreviewPanel({ preview }: { preview: PlanPreview }) {
  const { game, content, lang } = useGame();
  const t = useT(PLANNING);
  const b = content.balance;
  const lastDay = game.day === b.schedule.days;
  const warnings: string[] = [];
  if (preview.arrivalAfterSunset) warnings.push(t('afterSunset'));
  if (preview.marinaLate) warnings.push(t('marinaLate'));
  if (lastDay && content.map.find((p) => p.id === preview.destinationId)?.kind !== 'base') warnings.push(t('mustReturn'));
  if (lastDay && preview.arrivalMin !== null && preview.arrivalMin > b.schedule.returnDeadlineHour * 60) warnings.push(t('tooLateForBase', { time: formatHour(b.schedule.returnDeadlineHour) }));
  if (preview.fuelNeededL > game.resources.fuelL) warnings.push(t('fuelShort', { need: Math.ceil(preview.fuelNeededL) }));
  return (
    <section className={styles.preview} aria-live="polite">
      <h2>{t('preview')}</h2>
      {preview.departureMin === null || preview.arrivalMin === null ? <p>{t('stayRest')}</p> : (
        <>
          <p className={styles.times}>{t('times', { dep: formatClock(preview.departureMin), arr: formatClock(preview.arrivalMin) })}</p>
          <ul className={styles.legPreviews}>
            {preview.legs.map((l, i) => (
              <li key={`${l.routeId}-${i}`}>
                {t('legPreview', { to: pointName(content, l.to, lang), wind: l.windKn, speed: l.speedKn, hours: round1(l.hours) })}
                {l.localEffectKnown && <em> {t('localKnown')}</em>}
                {l.overpowered && <p className={styles.warn}>{t('overpowered')}</p>}
                {l.forcedReef && <p className={styles.warn}>{t('forcedReef')}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
      {warnings.map((w) => <p key={w} className={styles.warn}>{w}</p>)}
      <p className={styles.muted}>{t('rest', { h: round1(preview.restHours) })}</p>
    </section>
  );
}
```

- [ ] **Step 5: Экран**

`src/ui/screens/planning/PlanningScreen.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { previewPlan, type PlanPreview } from '../../../engine';
import { Button } from '../../components/Button';
import { ChartMap } from '../../components/chart/ChartMap';
import { ResourcePanel } from '../../components/ResourcePanel';
import { ScreenFrame } from '../../components/ScreenFrame';
import { useAct, useGame, useT } from '../../session/SessionContext';
import { DaySettings } from './DaySettings';
import { ForecastPanel } from './ForecastPanel';
import { LegEditor } from './LegEditor';
import { addLeg, departureOptions, initialDraft, reachableFrom, removeLastLeg, toDayPlan, trailOf, updateLeg, type Draft } from './planDraft';
import { PreviewPanel } from './PreviewPanel';
import styles from './Planning.module.css';
import { PLANNING } from './strings';

export function PlanningScreen() {
  const { game, content } = useGame();
  const act = useAct();
  const t = useT(PLANNING);
  const departures = departureOptions(game, content);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(game, content));
  const trail = trailOf(content, game.locationId, draft.legs);
  const canSail = departures.length > 0;
  const preview = useMemo<PlanPreview | null>(() => {
    try { return previewPlan(game, content, toDayPlan(draft)); } catch { return null; }
  }, [game, content, draft]);
  const w = game.weather;

  return (
    <ScreenFrame
      screen="planning"
      title={t('title', { n: game.day })}
      subtitle={canSail ? t('subtitle') : t('tooLate')}
      side={<><ForecastPanel /><ResourcePanel /></>}
      actions={draft.legs.length === 0
        ? <Button onClick={() => act({ type: 'draft_plan', plan: toDayPlan(draft) })}>{t('stay')}</Button>
        : <Button disabled={!canSail} onClick={() => act({ type: 'draft_plan', plan: toDayPlan(draft) })}>{t('toManeuvers')}</Button>}
    >
      <ChartMap
        locationId={game.locationId}
        trail={trail}
        reachableIds={canSail ? reachableFrom(content, game, draft) : []}
        onPointClick={(id) => setDraft((d) => addLeg(content, game, d, id))}
        wind={w ? { dir: w.forecastDir, kn: w.forecastKn, gustKn: w.forecastGustKn } : null}
      />
      <div className={styles.columns}>
        <LegEditor legs={draft.legs} trail={trail} onChange={(i, patch) => setDraft((d) => updateLeg(d, i, patch))} onRemoveLast={() => setDraft(removeLastLeg)} />
        <DaySettings draft={draft} departures={departures} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
      </div>
      {preview && <PreviewPanel preview={preview} />}
    </ScreenFrame>
  );
}
```

`src/ui/screens/planning/Planning.module.css`:

```css
.columns { display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); margin-top: var(--space-4); }
.forecast { display: grid; gap: var(--space-1); justify-items: start; margin-bottom: var(--space-4); padding-bottom: var(--space-4); border-bottom: 1px solid var(--line); }
.forecast h2, .legs h2, .settings h2, .preview h2 { font-size: var(--text-lg); margin: 0 0 var(--space-2); }
.forecast p { margin: 0; }
.legs ol { margin: 0; padding-left: var(--space-4); display: grid; gap: var(--space-3); }
.leg { display: grid; gap: var(--space-1); }
.legTitle { margin: 0; font-weight: 700; }
.row { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; border: none; padding: 0; margin: 0; }
.row label, .settings label { display: inline-flex; gap: var(--space-1); align-items: center; min-height: 36px; }
.settings { display: grid; gap: var(--space-2); align-content: start; }
.settings select, .row select { font: inherit; padding: var(--space-1) var(--space-2); background: var(--panel); color: var(--fg); border: 1px solid var(--line); border-radius: var(--radius); }
.preview { margin-top: var(--space-4); padding: var(--space-4); background: var(--panel); border-radius: var(--radius); box-shadow: var(--shadow); }
.times { font-family: var(--font-mono); font-size: var(--text-lg); margin: 0 0 var(--space-2); }
.legPreviews { margin: 0; padding-left: var(--space-4); }
.warn { color: var(--bad); margin: var(--space-1) 0; font-weight: 700; }
.muted { color: var(--fg-soft); margin: var(--space-1) 0; }
```

- [ ] **Step 6: Запустить тесты**

Run: `npx vitest run tests/ui/screens/planDraft.test.ts tests/ui/screens/PlanningScreen.test.tsx tests/ui/i18n.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens/planning tests/ui/screens/planDraft.test.ts tests/ui/screens/PlanningScreen.test.tsx
git commit -m "feat: add day planner with chart, forecast and plan preview"
```

---

### Task 13: Эпизоды манёвров и сводка перехода

**Files:**
- Modify (заменить заглушки): `src/ui/screens/maneuvers/ManeuversScreen.tsx`, `src/ui/screens/passage/PassageScreen.tsx`
- Create: `src/ui/screens/maneuvers/kinds.ts`, `src/ui/screens/maneuvers/OrderPicker.tsx`, `src/ui/screens/maneuvers/ManeuverSketch.tsx`, `src/ui/screens/maneuvers/strings.ts`, `src/ui/screens/maneuvers/Maneuvers.module.css`
- Create: `src/ui/screens/passage/timeline.ts`, `src/ui/screens/passage/strings.ts`, `src/ui/screens/passage/Passage.module.css`
- Test: `tests/ui/screens/maneuver-kinds.test.ts`, `tests/ui/screens/ManeuversScreen.test.tsx`, `tests/ui/screens/PassageScreen.test.tsx`

**Interfaces:**
- Consumes: `maneuverForKind, correctOrder, requirePoint, requireRoute, otherEnd, formatClock, type Maneuver, type ManeuverKind, type DayPlan` из движка (Task 2); `ChartMap` (Task 8); `describeEntry, isNoise, pointName, formatHour` (Task 3); `ScreenFrame, Button`, `useGame, useSession, useAct, useT`, `COMMON` (Task 1). Из `planning/` ничего не импортируется: Task 12 идёт параллельно.
- Produces:
  - `ManeuverSpec { kind; maneuver; fallback }`, `maneuversFor(game, content, plan): ManeuverSpec[]`, `shuffledStepIds(m, seed): string[]` (`kinds.ts`)
  - `<OrderPicker maneuver pool order onChange lastOrder? />`, `<ManeuverSketch kind />`
  - `todayTrail(game, content): string[]`, `passageLines(game, content, lang): LogLine[]` (`timeline.ts`)
  - `ManeuversScreen` (`data-screen="maneuvers"`), `PassageScreen` (`data-screen="passage"`)

**Поведение:**
- **Манёвры** (ТЗ 4.8, 6.1 «Эпизод манёвра»). Нужные эпизоды дня:
  - отход: `anchor_up`, если стоим в бухте, иначе `departure`;
  - приход: `anchoring` в бухту, `mooring` к причалу; плюс `anchoring` с пометкой «Если в марине не будет мест», если у точки есть `placesGoneHour`.
  
  Шаги перемешаны детерминированно (seed недели + день) и никогда не стоят сразу в правильном порядке. Игрок нажимает шаги по порядку, нажатый шаг уходит в нумерованный список; нажатие в списке возвращает шаг обратно. Если в `ui.lastOrders` есть порядок для этого вида, доступна кнопка «Как в прошлый раз». У каждого эпизода маленькая схема (причал, корма, якорь). «Готово» активна, когда все эпизоды собраны, и отправляет `commit_plan`. «Назад к плану» отправляет `cancel_draft`.
- **Переход** (ТЗ 6.1 «Карта», «Бортжурнал»). Карта с маршрутом дня, лодка плывёт по нему (`animateTrail`). Хронология дня: записи лога после решений плана, без шума и без записей `event:*`, чтобы не выдать события, которые ещё впереди. Итог: время прихода и якорь или причал. «Дальше» отправляет `passage_seen`.

- [ ] **Step 1: Написать падающие тесты**

`tests/ui/screens/maneuver-kinds.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { correctOrder } from '../../../src/engine';
import { maneuversFor, shuffledStepIds } from '../../../src/ui/screens/maneuvers/kinds';
import { content, gameAt } from '../fixtures';

const leg = (routeId: string) => ({ routeId, mode: 'motor' as const, reefs: 0 as const, genoa: 'full' as const, course: 'direct' as const });
const plan = (...routeIds: string[]) => ({ departureHour: 9, legs: routeIds.map(leg), swimStops: 0, shower: 'normal' as const, autopilot: false });

describe('maneuver kinds', () => {
  it('base to a bay: departure, then anchoring', () => {
    const game = { ...gameAt('planning'), locationId: 'base_marina' };
    expect(maneuversFor(game, content, plan('r_base_marina_cala_azzurra')).map((s) => [s.kind, s.fallback])).toEqual([['departure', false], ['anchoring', false]]);
  });

  it('a bay to a marina: anchor up, mooring, and anchoring as a fallback', () => {
    const game = { ...gameAt('planning'), locationId: 'cala_azzurra' };
    expect(maneuversFor(game, content, plan('r_cala_azzurra_kastri_marina')).map((s) => [s.kind, s.fallback])).toEqual([
      ['anchor_up', false], ['mooring', false], ['anchoring', true],
    ]);
  });

  it('shuffles deterministically and never starts in the correct order', () => {
    for (const m of content.maneuvers) {
      for (const seed of [1, 2, 3, 42, 99]) {
        const a = shuffledStepIds(m, seed);
        expect(a).toEqual(shuffledStepIds(m, seed));
        expect([...a].sort()).toEqual([...correctOrder(m)].sort());
        if (m.steps.length > 1) expect(a).not.toEqual(correctOrder(m));
      }
    }
  });
});
```

`tests/ui/screens/ManeuversScreen.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrderPicker } from '../../../src/ui/screens/maneuvers/OrderPicker';
import { content, gameAt } from '../fixtures';
import { renderShell, renderWithSession } from '../render';

const leg = { routeId: 'r_base_marina_cala_azzurra', mode: 'motor' as const, reefs: 0 as const, genoa: 'full' as const, course: 'direct' as const };
const toBay = { departureHour: 9, legs: [leg], swimStops: 0, shower: 'normal' as const, autopilot: false };

function startManeuvers() {
  const r = renderShell({ ...gameAt('planning'), locationId: 'base_marina', clockMin: 8 * 60 });
  r.dispatch({ type: 'draft_plan', plan: toBay });
  return r;
}

describe('ManeuversScreen', () => {
  it('orders every maneuver correctly and sets sail', async () => {
    const r = startManeuvers();
    expect(r.currentScreen()).toBe('maneuvers');
    const done = screen.getByRole('button', { name: 'Готово' });
    expect(done).toBeDisabled();
    for (const kind of ['departure', 'anchoring'] as const) {
      const m = content.maneuvers.find((x) => x.kind === kind)!;
      for (const step of m.steps) await r.user.click(screen.getByRole('button', { name: step.text.ru }));
    }
    expect(done).toBeEnabled();
    await r.user.click(done);
    expect(r.currentScreen()).toBe('passage');
    const orders = r.session().game!.log.filter((e) => e.cause.startsWith('order:')).map((e) => e.cause.split(':')[1]);
    expect(orders).toEqual(['ok', 'ok']);
  });

  it('a step can be taken back', async () => {
    const r = startManeuvers();
    const step = content.maneuvers.find((x) => x.kind === 'departure')!.steps[0]!;
    await r.user.click(screen.getByRole('button', { name: step.text.ru }));
    await r.user.click(screen.getByRole('button', { name: `Убрать: ${step.text.ru}` }));
    expect(screen.getByRole('button', { name: step.text.ru })).toBeInTheDocument();
  });

  it('goes back to the plan', async () => {
    const r = startManeuvers();
    await r.user.click(screen.getByRole('button', { name: 'Назад к плану' }));
    expect(r.currentScreen()).toBe('planning');
  });

  it('offers the last order again', async () => {
    const m = content.maneuvers.find((x) => x.kind === 'departure')!;
    const last = m.steps.map((s) => s.id).reverse();
    const onChange = vi.fn();
    const { user } = renderWithSession(<OrderPicker maneuver={m} pool={m.steps.map((s) => s.id)} order={[]} onChange={onChange} lastOrder={last} />, gameAt('planning'));
    await user.click(screen.getByRole('button', { name: 'Как в прошлый раз' }));
    expect(onChange).toHaveBeenCalledWith(last);
  });
});
```

`tests/ui/screens/PassageScreen.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { todayTrail } from '../../../src/ui/screens/passage/timeline';
import { content, gameAt } from '../fixtures';
import { renderShell } from '../render';

const leg = { routeId: 'r_base_marina_cala_azzurra', mode: 'motor' as const, reefs: 0 as const, genoa: 'full' as const, course: 'direct' as const };

describe('PassageScreen', () => {
  it('replays the day on the chart and in the log, then moves on', async () => {
    const r = renderShell({ ...gameAt('planning'), locationId: 'base_marina', clockMin: 8 * 60 });
    r.dispatch({ type: 'draft_plan', plan: { departureHour: 9, legs: [leg], swimStops: 0, shower: 'normal', autopilot: false } });
    r.dispatch({ type: 'commit_plan', orders: {} });
    expect(r.currentScreen()).toBe('passage');
    expect(todayTrail(r.session().game!, content)).toEqual(['base_marina', 'cala_azzurra']);
    expect(screen.getByText(/Марина Порто-Кало \(база\) — Кала-Адзурра, на моторе/)).toBeInTheDocument();
    expect(screen.queryByText(/^Событие:/)).toBeNull();
    await r.user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(['evening', 'event']).toContain(r.currentScreen());
  });
});
```

Run: `npx vitest run tests/ui/screens/maneuver-kinds.test.ts tests/ui/screens/ManeuversScreen.test.tsx tests/ui/screens/PassageScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Какие манёвры и перемешивание**

`src/ui/screens/maneuvers/kinds.ts`:

```ts
import { correctOrder, maneuverForKind, otherEnd, requirePoint, requireRoute, type Content, type DayPlan, type GameState, type Maneuver, type ManeuverKind } from '../../../engine';

export interface ManeuverSpec { kind: ManeuverKind; maneuver: Maneuver; fallback: boolean }

/** The maneuvers the engine may run today, in order. Mirrors day/passage.ts and day/arrival.ts. */
export function maneuversFor(game: GameState, content: Content, plan: DayPlan): ManeuverSpec[] {
  const origin = requirePoint(content, game.locationId);
  const destId = plan.legs.reduce((at, l) => otherEnd(requireRoute(content, l.routeId), at) ?? at, game.locationId);
  const dest = requirePoint(content, destId);
  const kinds: Array<[ManeuverKind, boolean]> = [[origin.kind === 'bay' ? 'anchor_up' : 'departure', false]];
  if (dest.kind === 'bay') kinds.push(['anchoring', false]);
  else {
    kinds.push(['mooring', false]);
    if (dest.placesGoneHour !== null) kinds.push(['anchoring', true]);
  }
  return kinds.flatMap(([kind, fallback]) => {
    const maneuver = maneuverForKind(content, kind);
    return maneuver ? [{ kind, maneuver, fallback }] : [];
  });
}

/** Tiny deterministic PRNG (mulberry32) for UI shuffles; the engine RNG stays untouched. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffledStepIds(m: Maneuver, seed: number): string[] {
  const ids = correctOrder(m);
  const rnd = prng(seed);
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  const unchanged = out.every((id, i) => id === ids[i]);
  return unchanged && out.length > 1 ? [...out.slice(1), out[0]!] : out;
}
```

- [ ] **Step 3: Строки, выбор порядка, схема**

`src/ui/screens/maneuvers/strings.ts`:

```ts
import { dict } from '../../i18n/t';

export const MANEUVERS = dict({
  title: { ru: 'Команды на манёвры', en: 'Commands for the maneuvers' },
  subtitle: { ru: 'В каком порядке вы отдадите команды? Нажимайте шаги по очереди.', en: 'In what order will you give the commands? Tap the steps one by one.' },
  fallback: { ru: 'Если в марине не будет мест', en: 'If the marina has no berths' },
  pool: { ru: 'Шаги', en: 'Steps' },
  order: { ru: 'Ваш порядок', en: 'Your order' },
  remove: { ru: 'Убрать: {step}', en: 'Remove: {step}' },
  last: { ru: 'Как в прошлый раз', en: 'Same as last time' },
  back: { ru: 'Назад к плану', en: 'Back to the plan' },
  done: { ru: 'Готово', en: 'Done' },
});
```

`src/ui/screens/maneuvers/OrderPicker.tsx`:

```tsx
import type { Maneuver } from '../../../engine';
import { Button } from '../../components/Button';
import { useLang, useT } from '../../session/SessionContext';
import styles from './Maneuvers.module.css';
import { MANEUVERS } from './strings';

export interface OrderPickerProps {
  maneuver: Maneuver;
  pool: readonly string[];
  order: readonly string[];
  onChange: (order: string[]) => void;
  lastOrder?: readonly string[];
}

export function OrderPicker({ maneuver, pool, order, onChange, lastOrder }: OrderPickerProps) {
  const lang = useLang();
  const t = useT(MANEUVERS);
  const text = (id: string): string => maneuver.steps.find((s) => s.id === id)?.text[lang] ?? id;
  const remaining = pool.filter((id) => !order.includes(id));
  return (
    <div className={styles.picker}>
      <div>
        <h3>{t('pool')}</h3>
        <ul className={styles.pool}>
          {remaining.map((id) => <li key={id}><Button variant="secondary" onClick={() => onChange([...order, id])}>{text(id)}</Button></li>)}
        </ul>
        {lastOrder && lastOrder.length === maneuver.steps.length && order.length === 0 && (
          <Button variant="ghost" onClick={() => onChange([...lastOrder])}>{t('last')}</Button>
        )}
      </div>
      <div>
        <h3>{t('order')}</h3>
        <ol className={styles.order}>
          {order.map((id) => (
            <li key={id}>
              <Button variant="ghost" aria-label={t('remove', { step: text(id) })} onClick={() => onChange(order.filter((x) => x !== id))}>{text(id)}</Button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
```

`src/ui/screens/maneuvers/ManeuverSketch.tsx`:

```tsx
import type { ManeuverKind } from '../../../engine';
import styles from './Maneuvers.module.css';

/** A small schematic per maneuver kind: quay and boat stern-to, or boat and anchor. Decorative. */
export function ManeuverSketch({ kind }: { kind: ManeuverKind }) {
  const atQuay = kind === 'departure' || kind === 'mooring';
  return (
    <svg className={styles.sketch} viewBox="0 0 160 80" aria-hidden="true">
      <path className={styles.water} d="M0 60 Q 20 55 40 60 T 80 60 T 120 60 T 160 60 V80 H0 Z" />
      {atQuay ? (
        <>
          <rect className={styles.quay} x="0" y="10" width="160" height="12" />
          <path className={styles.hull} d="M70 22 L90 22 L94 52 Q80 66 66 52 Z" />
          <line className={styles.line} x1="72" y1="24" x2="58" y2="14" />
          <line className={styles.line} x1="88" y1="24" x2="102" y2="14" />
        </>
      ) : (
        <>
          <path className={styles.hull} d="M40 40 L100 34 Q118 40 100 48 L40 44 Z" />
          <line className={styles.line} x1="104" y1="40" x2="140" y2="70" />
          <path className={styles.anchor} d="M140 62 V74 M134 70 Q140 78 146 70" />
        </>
      )}
    </svg>
  );
}
```

- [ ] **Step 4: Экран манёвров**

`src/ui/screens/maneuvers/ManeuversScreen.tsx`:

```tsx
import { useState } from 'react';
import type { ManeuverKind } from '../../../engine';
import { Button } from '../../components/Button';
import { ScreenFrame } from '../../components/ScreenFrame';
import { useAct, useGame, useSession, useT } from '../../session/SessionContext';
import type { ManeuverOrders } from '../../session/types';
import { maneuversFor, shuffledStepIds } from './kinds';
import { ManeuverSketch } from './ManeuverSketch';
import styles from './Maneuvers.module.css';
import { OrderPicker } from './OrderPicker';
import { MANEUVERS } from './strings';

const SEED_DAY_STRIDE = 101;

export function ManeuversScreen() {
  const { game, content, lang } = useGame();
  const { session } = useSession();
  const act = useAct();
  const t = useT(MANEUVERS);
  const [orders, setOrders] = useState<ManeuverOrders>({});
  const plan = session.ui.draftPlan;
  if (!plan) return null;
  const specs = maneuversFor(game, content, plan);
  const complete = specs.every((s) => (orders[s.kind]?.length ?? 0) === s.maneuver.steps.length);
  const set = (kind: ManeuverKind) => (order: string[]) => setOrders((o) => ({ ...o, [kind]: order }));

  return (
    <ScreenFrame
      screen="maneuvers"
      title={t('title')}
      subtitle={t('subtitle')}
      actions={(
        <>
          <Button variant="ghost" onClick={() => act({ type: 'cancel_draft' })}>{t('back')}</Button>
          <Button disabled={!complete} onClick={() => act({ type: 'commit_plan', orders })}>{t('done')}</Button>
        </>
      )}
    >
      {specs.map((s, i) => (
        <section key={s.kind} className={styles.episode} data-kind={s.kind}>
          <header className={styles.head}>
            <ManeuverSketch kind={s.kind} />
            <div>
              <h2>{s.maneuver.title[lang]}</h2>
              {s.fallback && <p className={styles.fallback}>{t('fallback')}</p>}
            </div>
          </header>
          <OrderPicker
            maneuver={s.maneuver}
            pool={shuffledStepIds(s.maneuver, game.seed + game.day * SEED_DAY_STRIDE + i)}
            order={orders[s.kind] ?? []}
            onChange={set(s.kind)}
            {...(session.ui.lastOrders[s.kind] ? { lastOrder: session.ui.lastOrders[s.kind] } : {})}
          />
        </section>
      ))}
    </ScreenFrame>
  );
}
```

`src/ui/screens/maneuvers/Maneuvers.module.css`:

```css
.episode { background: var(--panel); border-radius: var(--radius); padding: var(--space-4); box-shadow: var(--shadow); margin-bottom: var(--space-4); }
.head { display: flex; gap: var(--space-4); align-items: center; }
.head h2 { margin: 0; font-size: var(--text-lg); }
.fallback { margin: var(--space-1) 0 0; color: var(--fg-soft); font-style: italic; }
.picker { display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); margin-top: var(--space-3); }
.picker h3 { font-size: var(--text-md); margin: 0 0 var(--space-2); color: var(--fg-soft); }
.pool { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
.pool button, .order button { width: 100%; text-align: left; }
.order { margin: 0; padding-left: var(--space-6); display: grid; gap: var(--space-2); font-family: var(--font-hand); font-size: var(--text-lg); }
.sketch { width: 160px; height: 80px; flex: none; }
.water { fill: var(--sea-200); }
.quay { fill: var(--paper-dark); stroke: var(--fg-soft); }
.hull { fill: var(--paper); stroke: var(--fg); stroke-width: 1.5; }
.line { stroke: var(--ochre-500); stroke-width: 2; }
.anchor { fill: none; stroke: var(--fg); stroke-width: 2; }
```

- [ ] **Step 5: Сводка перехода**

`src/ui/screens/passage/timeline.ts`:

```ts
import { otherEnd, type Content, type GameState, type Lang } from '../../../engine';
import { describeEntry, isNoise, type LogLine } from '../../view/logbook';

/** Points sailed today, origin first, rebuilt backwards from today's `leg:` entries. */
export function todayTrail(game: GameState, content: Content): string[] {
  const legs = game.log.filter((e) => e.day === game.day && e.cause.startsWith('leg:')).map((e) => e.cause.slice('leg:'.length));
  const back = [game.locationId];
  for (const id of [...legs].reverse()) {
    const r = content.routes.find((x) => x.id === id);
    const prev = r ? otherEnd(r, back[back.length - 1]!) : null;
    if (!prev) break;
    back.push(prev);
  }
  return back.reverse();
}

/** What happened since the plan was made, minus noise and queued events (they come next). */
export function passageLines(game: GameState, content: Content, lang: Lang): LogLine[] {
  const today = game.log.filter((e) => e.day === game.day);
  const start = Math.max(0, today.findIndex((e) => e.cause.startsWith('plan:')));
  return today
    .slice(start)
    .filter((e) => !isNoise(e) && e.kind !== 'event' && !e.cause.startsWith('plan:'))
    .flatMap((e) => describeEntry(e, content, lang) ?? []);
}
```

`src/ui/screens/passage/strings.ts`:

```ts
import { dict } from '../../i18n/t';

export const PASSAGE = dict({
  title: { ru: 'Переход', en: 'Passage' },
  route: { ru: '{from} → {to}', en: '{from} → {to}' },
  arrived: { ru: 'Пришли в {time}, {mooring}.', en: 'Arrived at {time}, {mooring}.' },
  anchor: { ru: 'на якоре', en: 'at anchor' },
  berth: { ru: 'у причала', en: 'alongside' },
});
```

`src/ui/screens/passage/PassageScreen.tsx`:

```tsx
import { Button } from '../../components/Button';
import { ChartMap } from '../../components/chart/ChartMap';
import { ResourcePanel } from '../../components/ResourcePanel';
import { ScreenFrame } from '../../components/ScreenFrame';
import { COMMON } from '../../i18n/common';
import { useAct, useGame, useT } from '../../session/SessionContext';
import { formatHour } from '../../view/format';
import { pointName } from '../../view/map';
import styles from './Passage.module.css';
import { PASSAGE } from './strings';
import { passageLines, todayTrail } from './timeline';

export function PassageScreen() {
  const { game, content, lang } = useGame();
  const act = useAct();
  const t = useT(PASSAGE);
  const tc = useT(COMMON);
  const trail = todayTrail(game, content);
  const facts = game.dayFacts;
  return (
    <ScreenFrame
      screen="passage"
      title={t('title')}
      subtitle={t('route', { from: pointName(content, trail[0]!, lang), to: pointName(content, trail[trail.length - 1]!, lang) })}
      side={<ResourcePanel />}
      actions={<Button onClick={() => act({ type: 'passage_seen' })}>{tc('next')}</Button>}
    >
      <ChartMap locationId={game.locationId} trail={trail} animateTrail />
      <ol className={styles.timeline}>
        {passageLines(game, content, lang).map((l, i) => (
          <li key={i} data-tone={l.tone}><span className="mono">{l.clock}</span> {l.text}</li>
        ))}
      </ol>
      {facts?.arrivalHour != null && (
        <p className={styles.arrived}>{t('arrived', { time: formatHour(facts.arrivalHour), mooring: facts.mooring === 'anchor' ? t('anchor') : t('berth') })}</p>
      )}
    </ScreenFrame>
  );
}
```

`src/ui/screens/passage/Passage.module.css`:

```css
.timeline { margin: var(--space-4) 0 0; padding: 0; list-style: none; display: grid; gap: var(--space-1); font-family: var(--font-hand); font-size: var(--text-lg); }
.timeline li[data-tone='good'] { color: var(--ok); }
.timeline li[data-tone='bad'] { color: var(--bad); }
.arrived { font-size: var(--text-lg); font-weight: 700; margin-top: var(--space-4); }
```

- [ ] **Step 6: Запустить тесты**

Run: `npx vitest run tests/ui/screens/maneuver-kinds.test.ts tests/ui/screens/ManeuversScreen.test.tsx tests/ui/screens/PassageScreen.test.tsx tests/ui/i18n.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens/maneuvers src/ui/screens/passage tests/ui/screens/maneuver-kinds.test.ts tests/ui/screens/ManeuversScreen.test.tsx tests/ui/screens/PassageScreen.test.tsx
git commit -m "feat: add maneuver order episodes and passage summary"
```

---

### Task 14: Неделя целиком в браузере (RU и EN), сборка, CI, деплой

**Files:**
- Create: `tests/ui/week.test.tsx`
- Create: `.github/workflows/ci.yml`, `.github/workflows/pages.yml`
- Create: `README.md`
- Modify (только если неделя-тест найдёт тупик): файлы экрана, где тупик. Каждую такую правку описать в отчёте.

**Interfaces:**
- Consumes: всё из Волн 0–3; словари экранов (`MENU, CAPTAIN, BOAT, CHECKIN, BRIEFING, MORNING, PLANNING, MANEUVERS, EVENING, RETURN, DEBRIEF, COMMON`), чтобы бот нажимал кнопки по тем же строкам, что видит игрок.
- Produces: приёмочный тест «неделю можно пройти от меню до разбора без ошибок и тупиков» на обоих языках (ТЗ 7.4 #1 и #5 для UI); CI; деплой статики на GitHub Pages.

**Бот недели.** Он нажимает кнопки, как игрок. Капитан: по 2 очка на каждый голос. Лодка: «Мельтеми 40». Приёмка: ничего. Брифинг: первые 4 темы. Каждый день идёт «база ↔ Кала-Адзурра»; если выходить уже поздно — «Провести день здесь». В манёврах шаги нажимаются в показанном порядке. В событиях — первый доступный вариант. Бот ограничен 400 шагами. На каждом шаге проверяется: есть активная основная кнопка (нет тупика), нет баннера ошибки, в тексте страницы нет `{плейсхолдеров}`, `undefined`, `NaN`. В EN-прогоне на странице нет кириллицы.

- [ ] **Step 1: Написать тест недели**

`tests/ui/week.test.tsx`:

```tsx
import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRAINABLE_VOICES, type Lang } from '../../src/engine';
import { COMMON } from '../../src/ui/i18n/common';
import { VOICE_NAMES } from '../../src/ui/i18n/glossary';
import { fmt } from '../../src/ui/i18n/t';
import { BOAT } from '../../src/ui/screens/boat/strings';
import { BRIEFING } from '../../src/ui/screens/briefing/strings';
import { CAPTAIN } from '../../src/ui/screens/captain/strings';
import { CHECKIN } from '../../src/ui/screens/checkin/strings';
import { EVENING } from '../../src/ui/screens/evening/strings';
import { MANEUVERS } from '../../src/ui/screens/maneuvers/strings';
import { MENU } from '../../src/ui/screens/menu/strings';
import { MORNING } from '../../src/ui/screens/morning/strings';
import { PLANNING } from '../../src/ui/screens/planning/strings';
import { RETURN } from '../../src/ui/screens/return/strings';
import { content } from './fixtures';
import { renderShell } from './render';

const MAX_STEPS = 400;
const name = (id: string, lang: Lang) => content.map.find((p) => p.id === id)!.name[lang];
const button = (label: string) => screen.getByRole('button', { name: label });

function assertHealthy(lang: Lang): void {
  const text = document.body.textContent ?? '';
  expect(screen.queryByRole('alert')).toBeNull();
  expect(text).not.toMatch(/\{\w+\}|undefined|NaN/);
  if (lang === 'en') expect(text).not.toMatch(/[А-Яа-яЁё]/);
}

async function playWeek(lang: Lang): Promise<ReturnType<typeof renderShell>> {
  vi.spyOn(Math, 'random').mockReturnValue(0.123);
  const r = renderShell(null, { lang });
  const { user } = r;
  await user.click(button(MENU.newWeek[lang]));
  for (const v of TRAINABLE_VOICES) {
    const raise = button(fmt(CAPTAIN.raise[lang], { voice: VOICE_NAMES[v][lang] }));
    await user.click(raise);
    await user.click(raise);
  }
  await user.click(button(COMMON.next[lang]));
  await user.click(button(fmt(BOAT.take[lang], { name: content.boats.find((b) => b.id === 'meltemi_40')!.name[lang] })));
  await user.click(button(CHECKIN.finish[lang]));
  for (const topic of content.briefing.slice(0, content.balance.briefing.slots)) {
    await user.click(screen.getByRole('button', { name: new RegExp(topic.title[lang]) }));
  }
  await user.click(button(BRIEFING.start[lang]));

  for (let step = 0; step < MAX_STEPS && r.currentScreen() !== 'debrief'; step++) {
    assertHealthy(lang);
    const game = r.session().game!;
    switch (r.currentScreen()) {
      case 'morning': await user.click(button(MORNING.start[lang])); break;
      case 'planning': {
        const target = game.locationId === 'base_marina' ? 'cala_azzurra' : 'base_marina';
        const point = screen.queryByRole('button', { name: name(target, lang) });
        if (point) {
          await user.click(point);
          await user.click(button(PLANNING.toManeuvers[lang]));
        } else {
          await user.click(button(PLANNING.stay[lang]));
        }
        break;
      }
      case 'maneuvers': {
        const done = button(MANEUVERS.done[lang]);
        for (const section of document.querySelectorAll<HTMLElement>('section[data-kind]')) {
          const pool = () => within(section).queryAllByRole('listitem').flatMap((li) => li.closest('ol') ? [] : within(li).queryAllByRole('button'));
          for (let b = pool()[0]; b; b = pool()[0]) await user.click(b);
        }
        expect(done).toBeEnabled();
        await user.click(done);
        break;
      }
      case 'passage':
      case 'outcome': await user.click(button(COMMON.next[lang])); break;
      case 'event': {
        const option = screen.getAllByRole('button').find((b) => !b.hasAttribute('disabled') && b.closest('ol'));
        expect(option, 'an event must offer at least one available option').toBeDefined();
        await user.click(option!);
        break;
      }
      case 'evening': await user.click(button(EVENING.sleep[lang])); break;
      case 'return': await user.click(button(RETURN.handover[lang])); break;
      default: throw new Error(`Dead end on screen ${r.currentScreen()}`);
    }
  }
  return r;
}

describe('a whole week in the browser UI', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['ru', 'en'] as const)('plays from the menu to the debrief without dead ends (%s)', async (lang) => {
    const r = await playWeek(lang);
    expect(r.currentScreen()).toBe('debrief');
    expect(screen.getAllByLabelText(/^(Оценка|Grade):/)).toHaveLength(4);
    expect(r.session().game!.phase).toBe('debrief');
    assertHealthy(lang);
  }, 120_000);
});
```

Run: `npx vitest run tests/ui/week.test.tsx`
Expected: PASS на обоих языках. Если бот упал на «Dead end», баннере ошибки или кириллице в EN, исправь экран-виновник, а не тест. В отчёте напиши: какой экран, что было не так, что изменил.

- [ ] **Step 2: Полная проверка и сборка**

Run: `npm run typecheck && npm test && npm run validate-content && npm run build`
Expected: tsc чистый; все тесты (Этап 1 и UI) PASS; `Content OK`; `dist/` собран. Запиши в отчёт размер `dist/assets/*.js` (gzip, из вывода Vite).

- [ ] **Step 3: CI и деплой на GitHub Pages**

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run validate-content
      - run: npm run build
```

`.github/workflows/pages.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: README**

`README.md`:

````markdown
# Симулятор шкипера · Skipper Simulator

Нарративный симулятор решений шкипера чартерной яхты на одну неделю. ТЗ: `Симулятор шкипера — ТЗ v0.1.md`.

## Запуск

```bash
npm install
npm run dev          # игра в браузере: http://localhost:5173
npm test             # движок + UI
npm run build        # статическая сборка в dist/
npm run simulate -- --seed 42 --strategy newbie   # неделя в консоли
npm run validate-content                          # проверка content/*.json
```

## Устройство

- `src/engine/` — правила игры, чистые функции, без DOM. Публичный API: `src/engine/index.ts`.
- `src/content/` + `content/*.json` — данные и их валидатор. Новое событие добавляется правкой JSON.
- `src/ui/` — React-интерфейс: `session/` (состояние и сохранение), `screens/` (экран = папка со своими строками RU/EN), `components/`, `view/` (подготовка данных для экранов).
- Иллюстрации сцен: положите картинку в `public/scenes/` и добавьте её в `src/ui/scenes/manifest.ts`. Без картинки показывается заглушка.

## Деплой

`main` автоматически публикуется на GitHub Pages (`.github/workflows/pages.yml`). Один раз включите Pages: **Settings → Pages → Source: GitHub Actions**.
````

- [ ] **Step 5: Commit**

```bash
git add tests/ui/week.test.tsx .github README.md
git commit -m "test: play a whole week through the UI in both languages; add CI and Pages deploy"
```

---

## Волна 5 — стиль (ТЗ 6.2, Этап 4 из 7.3)

Цель волны: игра выглядит как задумано на десктопе и телефоне — «бортовой журнал в духе Disco Elysium». Иллюстрации не входят: слой `SceneArt` уже готов их принять. Порядок: T15 → (T16 ∥ T17) → T18. В этой волне правка чужих файлов разрешена, но только в пределах, перечисленных в задаче.

### Task 15: День и ночь — тон всего интерфейса по часам игры

**Files:**
- Create: `src/ui/theme/daytime.ts`
- Modify: `src/ui/App.tsx` (одна строка: `data-daytime` вычисляется), `src/ui/styles/tokens.css` (палитры рассвета, сумерек, ночи)
- Test: `tests/ui/theme/daytime.test.ts`, дополнение в `tests/ui/shell.test.tsx`

**Interfaces:**
- Consumes: `Balance, GameState` из движка; `Screen`, `screenFor` (Task 1).
- Produces: `Daytime = 'dawn' | 'day' | 'dusk' | 'night'`, `daytimeFor(game, balance, screen): Daytime`, `DUSK_BEFORE_SUNSET_H`, `NIGHT_AFTER_SUNSET_H`.

**Правило:**
- Нет игры (меню) и экран `debrief` → `dawn`.
- Фазы `captain`, `boat_select` → `day`; `checkin`, `briefing` → `dusk` (вечер 0).
- `morning` → `dawn`.
- Остальное — по часам `game.clockMin`: от `sunsetHour + NIGHT_AFTER_SUNSET_H` → `night`; от `sunsetHour − DUSK_BEFORE_SUNSET_H` → `dusk`; иначе `day`.

Константы — UI, не баланс: `DUSK_BEFORE_SUNSET_H = 1.5`, `NIGHT_AFTER_SUNSET_H = 0.5`.

- [ ] **Step 1: Написать падающий тест**

`tests/ui/theme/daytime.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { daytimeFor } from '../../../src/ui/theme/daytime';
import { content, gameAt } from '../fixtures';

const b = content.balance;
const at = (h: number) => ({ ...gameAt('evening'), clockMin: Math.round(h * 60) });

describe('daytimeFor', () => {
  it('menu and debrief are dawn, setup phases follow evening 0', () => {
    expect(daytimeFor(null, b, 'menu')).toBe('dawn');
    expect(daytimeFor(gameAt('debrief'), b, 'debrief')).toBe('dawn');
    expect(daytimeFor(gameAt('captain'), b, 'captain')).toBe('day');
    expect(daytimeFor(gameAt('briefing'), b, 'briefing')).toBe('dusk');
    expect(daytimeFor(gameAt('morning'), b, 'morning')).toBe('dawn');
  });

  it('follows the clock around sunset', () => {
    expect(daytimeFor(at(14), b, 'evening')).toBe('day');
    expect(daytimeFor(at(b.time.sunsetHour - 1), b, 'evening')).toBe('dusk');
    expect(daytimeFor(at(b.time.sunsetHour + 1), b, 'evening')).toBe('night');
    expect(daytimeFor(at(25), b, 'event')).toBe('night');
  });
});
```

Добавить в `tests/ui/shell.test.tsx`:

```tsx
  it('tints the whole app by the game clock', () => {
    const { container } = renderShell({ ...gameAt('evening'), clockMin: 22 * 60 });
    expect(container.querySelector('.app')?.getAttribute('data-daytime')).toBe('night');
  });
```

Run: `npx vitest run tests/ui/theme tests/ui/shell.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Реализация**

`src/ui/theme/daytime.ts`:

```ts
import type { Balance, GameState } from '../../engine';
import type { Screen } from '../session/types';

export type Daytime = 'dawn' | 'day' | 'dusk' | 'night';

/** UI tint thresholds around balance.time.sunsetHour. Presentation only, not game balance. */
export const DUSK_BEFORE_SUNSET_H = 1.5;
export const NIGHT_AFTER_SUNSET_H = 0.5;
const MIN_PER_HOUR = 60;

export function daytimeFor(game: GameState | null, b: Balance, screen: Screen): Daytime {
  if (!game || screen === 'debrief') return 'dawn';
  if (game.phase === 'captain' || game.phase === 'boat_select') return 'day';
  if (game.phase === 'checkin' || game.phase === 'briefing') return 'dusk';
  if (game.phase === 'morning') return 'dawn';
  const h = game.clockMin / MIN_PER_HOUR;
  if (h >= b.time.sunsetHour + NIGHT_AFTER_SUNSET_H) return 'night';
  return h >= b.time.sunsetHour - DUSK_BEFORE_SUNSET_H ? 'dusk' : 'day';
}
```

`src/ui/App.tsx`: в `Shell` заменить `data-daytime="day"` на `data-daytime={daytimeFor(session.game, session.content.balance, screenFor(session))}` и добавить импорт `import { daytimeFor } from './theme/daytime';`.

`src/ui/styles/tokens.css`, дописать в конец:

```css
/* ТЗ 6.2: day and night change the tone of the whole interface. */
.app[data-daytime='dawn'] {
  --bg: #f1e2cf;
  --panel: #f9efe1;
  --line: #e2cdb0;
  --accent: #2d5f7c;
}
.app[data-daytime='dusk'] {
  --bg: #e6c9a4;
  --panel: #f1dcbd;
  --line: #d4b48b;
  --fg-soft: #6a4e3a;
  --accent: #8a4a33;
  --accent-strong: #6b3423;
  --chart-paper: #efd9b6;
}
.app[data-daytime='night'] {
  --bg: #13212d;
  --fg: #e9e1cf;
  --fg-soft: #a99f8a;
  --panel: #1c2f3e;
  --line: #2c4456;
  --accent: #d9a441;
  --accent-strong: #ecd9a8;
  --accent-fg: #13212d;
  --focus: #ecd9a8;
  --chart-paper: #22384a;
  --shadow: 0 2px 10px rgb(0 0 0 / 0.45);
}
```

- [ ] **Step 3: Проверить и закоммитить**

Run: `npx vitest run tests/ui && npm run typecheck`
Expected: PASS.

Ручная проверка: `npm run dev`. Пройти до вечера с поздним приходом: фон плавно (1.2 с) уходит в ночную палитру, текст читается.

```bash
git add src/ui/theme src/ui/App.tsx src/ui/styles/tokens.css tests/ui/theme tests/ui/shell.test.tsx
git commit -m "style: tint the interface by the time of day"
```

---

### Task 16: Карта от руки — бумага, береговая линия, изобаты, вода, облака, поле ветра

**Files:**
- Create: `src/ui/components/chart/decor.tsx`
- Modify: `src/ui/components/chart/ChartMap.tsx` (вставить слои декора, фильтр «от руки» для маршрутов и берегов), `src/ui/components/chart/ChartMap.module.css`
- Test: `tests/ui/components/chart-decor.test.tsx`

**Interfaces:**
- Consumes: `MapPoint, DIRS, Dir8` из движка; `Projection` (Task 3); `useReducedMotion` (Task 4).
- Produces:
  - `hashId(id): number`
  - `landOffset(point): { dx; dy }` — суша лежит с защищённой стороны: сумма `shelter[dir]` × единичный вектор `dir`, нормированная
  - `islandPath(id, cx, cy, r): string` — детерминированная «клякса» из 10 вершин со сглаживанием
  - `<ChartDefs />` — `<defs>`: `#paper` (feTurbulence-зерно), `#hand` (feDisplacementMap, дрожание линии), `#waves` (паттерн волн)
  - `<Coastlines points proj />` — суша плюс две изобаты (1.25× и 1.5× контура, пунктир)
  - `<WaterLayer width height animate />`, `<Clouds width height animate />`
  - `<WindField width height dir />` — сетка бледных стрелок по ветру

**Поведение (ТЗ 6.2 «Карта»):** бумага с текстурой, изобаты, тонкие рукописные подписи (`--font-hand` для названий точек), анимированная вода и облака, стрелки ветра. Без reduced motion вода медленно дрейфует (`<animateTransform>` в паттерне), облака проплывают за 60–90 с. С reduced motion оба слоя статичны: элементов `animate*` нет. Порядок слоёв: бумага → вода → поле ветра → берега и изобаты → сетка → маршруты → точки → облака → лодка.

- [ ] **Step 1: Написать падающий тест**

`tests/ui/components/chart-decor.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { ChartMap } from '../../../src/ui/components/chart/ChartMap';
import { hashId, islandPath, landOffset } from '../../../src/ui/components/chart/decor';
import { content } from '../fixtures';
import { renderWithSession } from '../render';

describe('chart decor', () => {
  it('islands are deterministic per point and differ between points', () => {
    expect(islandPath('vela_bay', 100, 100, 30)).toBe(islandPath('vela_bay', 100, 100, 30));
    expect(islandPath('vela_bay', 100, 100, 30)).not.toBe(islandPath('fjord_bay', 100, 100, 30));
    expect(hashId('a')).not.toBe(hashId('b'));
  });

  it('puts land on the sheltered side', () => {
    const vela = content.map.find((p) => p.id === 'vela_bay')!;
    const o = landOffset(vela);
    expect(o.dx).toBeGreaterThan(0);
    expect(Math.hypot(o.dx, o.dy)).toBeCloseTo(1, 5);
  });

  it('draws defs, one coastline per point and animated water', () => {
    const { container } = renderWithSession(<ChartMap locationId="base_marina" wind={{ dir: 'NW', kn: 15 }} />);
    expect(container.querySelector('filter#hand')).not.toBeNull();
    expect(container.querySelectorAll('[data-coast]')).toHaveLength(content.map.length);
    expect(container.querySelector('animateTransform')).not.toBeNull();
    expect(container.querySelectorAll('[data-wind-arrow]').length).toBeGreaterThan(4);
  });

  it('keeps everything still with reduced motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener: () => {}, removeEventListener: () => {} }));
    const { container } = renderWithSession(<ChartMap locationId="base_marina" />);
    expect(container.querySelector('animateTransform, animateMotion, animate')).toBeNull();
    vi.unstubAllGlobals();
  });
});
```

Run: `npx vitest run tests/ui/components/chart-decor.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Декор**

`src/ui/components/chart/decor.tsx`:

```tsx
import { DIRS, type Dir8, type MapPoint } from '../../../engine';
import type { Projection } from '../../view/map';
import styles from './ChartMap.module.css';

const VERTICES = 10;
const STEP_DEG = 360 / DIRS.length;
const ISOBATHS = [1.25, 1.5];
const WIND_GRID_PX = 140;

/** FNV-1a: stable small hash so the same point always gets the same coastline. */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Unit vector (SVG axes: x east, y down) towards the sheltered side, where the land is. */
export function landOffset(p: MapPoint): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  for (const d of DIRS) {
    const rad = (DIRS.indexOf(d) * STEP_DEG * Math.PI) / 180;
    dx += p.shelter[d] * Math.sin(rad);
    dy -= p.shelter[d] * Math.cos(rad);
  }
  const len = Math.hypot(dx, dy) || 1;
  return { dx: dx / len, dy: dy / len };
}

export function islandPath(id: string, cx: number, cy: number, r: number): string {
  let seed = hashId(id);
  const rnd = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const pts = Array.from({ length: VERTICES }, (_, i) => {
    const a = (i / VERTICES) * Math.PI * 2;
    const k = 0.7 + rnd() * 0.6;
    return { x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k };
  });
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(pts[VERTICES - 1]!, pts[0]!);
  const segs = pts.map((p, i) => { const m = mid(p, pts[(i + 1) % VERTICES]!); return `Q ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${m.x.toFixed(1)} ${m.y.toFixed(1)}`; });
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} ${segs.join(' ')} Z`;
}

export function ChartDefs() {
  return (
    <defs>
      <filter id="paper" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
        <feColorMatrix in="noise" type="saturate" values="0" result="grain" />
        <feComponentTransfer in="grain"><feFuncA type="linear" slope="0.08" /></feComponentTransfer>
        <feBlend in="SourceGraphic" mode="multiply" />
      </filter>
      <filter id="hand">
        <feTurbulence type="turbulence" baseFrequency="0.03" numOctaves="2" seed="3" result="t" />
        <feDisplacementMap in="SourceGraphic" in2="t" scale="2.2" />
      </filter>
      <pattern id="waves" width="48" height="24" patternUnits="userSpaceOnUse">
        <path className={styles.wave} d="M0 12 Q 12 4 24 12 T 48 12" />
      </pattern>
    </defs>
  );
}

export function Coastlines({ points, proj, r }: { points: readonly MapPoint[]; proj: Projection; r: number }) {
  return (
    <g filter="url(#hand)">
      {points.map((p) => {
        const s = proj.toSvg(p);
        const o = landOffset(p);
        const cx = s.x + o.dx * r * 0.9;
        const cy = s.y + o.dy * r * 0.9;
        return (
          <g key={p.id} data-coast={p.id}>
            {ISOBATHS.map((k) => <path key={k} className={styles.isobath} d={islandPath(p.id, cx, cy, r * k)} />)}
            <path className={styles.land} d={islandPath(p.id, cx, cy, r)} />
          </g>
        );
      })}
    </g>
  );
}

export function WaterLayer({ width, height, animate }: { width: number; height: number; animate: boolean }) {
  return (
    <g className={styles.water}>
      <rect width={width} height={height} fill="url(#waves)">
        {animate && <animateTransform attributeName="transform" type="translate" from="0 0" to="48 0" dur="18s" repeatCount="indefinite" />}
      </rect>
    </g>
  );
}

export function Clouds({ width, height, animate }: { width: number; height: number; animate: boolean }) {
  const clouds = [{ y: 0.18, rx: 0.16, dur: 70 }, { y: 0.55, rx: 0.12, dur: 90 }, { y: 0.8, rx: 0.1, dur: 60 }];
  return (
    <g className={styles.clouds} aria-hidden="true">
      {clouds.map((c, i) => (
        <ellipse key={i} cx={-width * c.rx} cy={height * c.y} rx={width * c.rx} ry={height * 0.05}>
          {animate && <animateTransform attributeName="transform" type="translate" from="0 0" to={`${width * (1 + 2 * c.rx)} 0`} dur={`${c.dur}s`} begin={`-${i * 20}s`} repeatCount="indefinite" />}
        </ellipse>
      ))}
    </g>
  );
}

export function WindField({ width, height, dir }: { width: number; height: number; dir: Dir8 }) {
  const rot = (DIRS.indexOf(dir) * STEP_DEG + 180) % 360;
  const cols = Math.ceil(width / WIND_GRID_PX);
  const rows = Math.ceil(height / WIND_GRID_PX);
  return (
    <g className={styles.windField} aria-hidden="true">
      {Array.from({ length: cols * rows }, (_, i) => {
        const x = (i % cols) * WIND_GRID_PX + WIND_GRID_PX / 2;
        const y = Math.floor(i / cols) * WIND_GRID_PX + WIND_GRID_PX / 2;
        return <path key={i} data-wind-arrow="" transform={`translate(${x} ${y}) rotate(${rot})`} d="M0 -14 V12 M-4 6 L0 12 L4 6" />;
      })}
    </g>
  );
}
```

- [ ] **Step 3: Встроить в карту**

В `src/ui/components/chart/ChartMap.tsx`:
1. Импорт: `import { ChartDefs, Clouds, Coastlines, WaterLayer, WindField } from './decor';`.
2. Константа `const COAST_RADIUS_NM = 1.6;`.
3. Сразу после открывающего `<svg …>` вставить `<ChartDefs />`.
4. Заменить `<rect className={styles.paper} … />` на:

```tsx
        <rect className={styles.paper} width={proj.width} height={proj.height} filter="url(#paper)" />
        <WaterLayer width={proj.width} height={proj.height} animate={!reduced} />
        {wind && <WindField width={proj.width} height={proj.height} dir={wind.dir} />}
        <Coastlines points={content.map} proj={proj} r={COAST_RADIUS_NM * PX_PER_NM} />
```

5. Группе маршрутов добавить `filter="url(#hand)"`: обернуть `content.routes.map(...)` в `<g filter="url(#hand)">…</g>`.
6. Перед `<g className={styles.boat} …>` вставить `<Clouds width={proj.width} height={proj.height} animate={!reduced} />`.

В `src/ui/components/chart/ChartMap.module.css` дописать и изменить `.label`:

```css
.label { font-family: var(--font-hand); font-size: 17px; fill: var(--fg); stroke: var(--chart-paper, var(--panel)); stroke-width: 3px; paint-order: stroke; }
.wave { fill: none; stroke: var(--sea-500); stroke-width: 0.8; opacity: 0.25; }
.land { fill: var(--ochre-200); stroke: var(--ink-soft); stroke-width: 1.2; }
.isobath { fill: none; stroke: var(--sea-500); stroke-width: 0.7; stroke-dasharray: 3 4; opacity: 0.45; }
.clouds ellipse { fill: var(--paper); opacity: 0.22; filter: blur(6px); }
.windField path { fill: none; stroke: var(--sea-700); stroke-width: 1; opacity: 0.25; }
```

- [ ] **Step 4: Проверить и закоммитить**

Run: `npx vitest run tests/ui/components && npm run typecheck`
Expected: PASS (включая старый `ChartMap.test.tsx`).

Ручная проверка: `npm run dev`, экран плана. Видны бумага с зерном, острова с изобатами, рукописные подписи, вода дрейфует, облака проплывают. Подписи точек читаются поверх суши; в ночной палитре тоже.

```bash
git add src/ui/components/chart tests/ui/components/chart-decor.test.tsx
git commit -m "style: hand-drawn chart with coastlines, isobaths, moving water and clouds"
```

---

### Task 17: Сдержанная анимация — переходы экранов, живые сцены-заглушки, иконки голосов

**Files:**
- Modify: `src/ui/styles/global.css` (вход экрана), `src/ui/components/SceneArt.tsx` + `SceneArt.module.css` (звёзды ночью, дождь в шторм, качка волн), `src/ui/screens/captain/CaptainScreen.tsx` (иконки голосов: Task 6 их не ставил), `src/ui/screens/event/Event.module.css` (появление чипов итога по очереди)
- Test: `tests/ui/components/SceneArt.test.tsx`, дополнение в `tests/ui/screens/CaptainScreen.test.tsx`

**Interfaces:**
- Consumes: `useReducedMotion` (Task 4), `VoiceIcon` (Task 4).
- Produces: `SceneArt` с `data-mood`-слоями: ночью `[data-layer="stars"]`, в шторм `[data-layer="rain"]` (линии с `<animate>` только без reduced motion).

**Поведение (ТЗ 6.2: «сдержанная анимация… приятность стилем и плавностью»):**
- Экран входит за 320 мс: прозрачность 0 → 1 и сдвиг 6 px вверх, через класс `.screen` из Task 1.
- Волны заглушки качаются (CSS keyframes, 8 с). Ночью мерцают звёзды. В шторм косой дождь.
- Чипы изменений на экране итога появляются по одному с шагом 80 мс.
- На экране капитана перед именем голоса стоит иконка.
- Всё отключается при `prefers-reduced-motion` (глобальное правило уже есть, плюс `useReducedMotion` для SVG `<animate>`).

- [ ] **Step 1: Написать падающие тесты**

`tests/ui/components/SceneArt.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SceneArt } from '../../../src/ui/components/SceneArt';
import { renderWithSession } from '../render';

describe('SceneArt placeholder', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adds stars at night and rain in a storm', () => {
    const night = renderWithSession(<SceneArt scene="anchorage_night" />);
    expect(night.container.querySelector('[data-layer="stars"]')).not.toBeNull();
    night.unmount();
    const storm = renderWithSession(<SceneArt scene="deck_squall" />);
    expect(storm.container.querySelector('[data-layer="rain"]')).not.toBeNull();
    expect(storm.container.querySelector('[data-layer="rain"] animate')).not.toBeNull();
  });

  it('keeps the rain still with reduced motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener: () => {}, removeEventListener: () => {} }));
    const { container } = renderWithSession(<SceneArt scene="deck_squall" />);
    expect(container.querySelector('[data-layer="rain"]')).not.toBeNull();
    expect(container.querySelector('animate')).toBeNull();
  });
});
```

Добавить в `tests/ui/screens/CaptainScreen.test.tsx`:

```tsx
  it('shows an icon next to every voice', () => {
    const { container } = renderShell(gameAt('captain'));
    expect(container.querySelectorAll('li svg').length).toBeGreaterThanOrEqual(8);
  });
```

Run: `npx vitest run tests/ui/components/SceneArt.test.tsx tests/ui/screens/CaptainScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Живая заглушка сцены**

В `src/ui/components/SceneArt.tsx`:
1. Импорт: `import { useReducedMotion } from './motion';`.
2. В теле: `const reduced = useReducedMotion(); const mood = sceneMood(scene);`. В `data-mood` использовать `mood`.
3. Внутри `<svg className={styles.stub} …>` после второго `swell` добавить:

```tsx
          {mood === 'night' && (
            <g data-layer="stars" className={styles.stars}>
              {[[40, 30], [90, 60], [150, 25], [210, 50], [260, 20], [330, 45], [370, 70]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" />)}
            </g>
          )}
          {mood === 'storm' && (
            <g data-layer="rain" className={styles.rain}>
              {Array.from({ length: 24 }, (_, i) => (
                <line key={i} x1={i * 17} y1={-10} x2={i * 17 - 18} y2={30}>
                  {!reduced && <animate attributeName="y1" values="-10;250" dur={`${0.6 + (i % 5) * 0.1}s`} repeatCount="indefinite" />}
                  {!reduced && <animate attributeName="y2" values="30;290" dur={`${0.6 + (i % 5) * 0.1}s`} repeatCount="indefinite" />}
                </line>
              ))}
            </g>
          )}
```

В `src/ui/components/SceneArt.module.css` дописать:

```css
.swell { animation: sway 8s ease-in-out infinite alternate; transform-origin: center; }
.swell + .swell { animation-duration: 11s; animation-direction: alternate-reverse; }
.stars circle { fill: var(--paper); animation: twinkle 3.5s ease-in-out infinite alternate; }
.stars circle:nth-child(2n) { animation-delay: 1.2s; }
.rain line { stroke: var(--sea-200); stroke-width: 1; opacity: 0.6; }
@keyframes sway { from { transform: translateX(-12px); } to { transform: translateX(12px); } }
@keyframes twinkle { from { opacity: 0.25; } to { opacity: 1; } }
```

- [ ] **Step 3: Вход экрана, чипы, иконки голосов**

`src/ui/styles/global.css`, дописать:

```css
.screen { animation: screen-in 320ms ease-out both; }
@keyframes screen-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
```

`src/ui/screens/event/Event.module.css`, дописать:

```css
.chips li { animation: chip-in 260ms ease-out both; }
.chips li:nth-child(2) { animation-delay: 80ms; }
.chips li:nth-child(3) { animation-delay: 160ms; }
.chips li:nth-child(4) { animation-delay: 240ms; }
.chips li:nth-child(n + 5) { animation-delay: 320ms; }
@keyframes chip-in { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: none; } }
```

`src/ui/screens/captain/CaptainScreen.tsx`: импорт `import { VoiceIcon } from '../../components/voices/icons';`. В обоих списках заменить `<strong>{VOICE_NAMES[v][lang]}</strong>` на `<strong className={styles.name}><VoiceIcon voice={v} /> {VOICE_NAMES[v][lang]}</strong>`. В `Captain.module.css` добавить `.name { display: inline-flex; gap: var(--space-2); align-items: center; }`.

- [ ] **Step 4: Проверить и закоммитить**

Run: `npx vitest run tests/ui && npm run typecheck`
Expected: PASS.

Ручная проверка: `npm run dev`. Экраны мягко появляются; на событии со шквалом идёт дождь, ночью мерцают звёзды. В DevTools → Rendering → «prefers-reduced-motion: reduce» всё неподвижно.

```bash
git add src/ui/styles/global.css src/ui/components/SceneArt.tsx src/ui/components/SceneArt.module.css src/ui/screens/captain src/ui/screens/event/Event.module.css tests/ui/components/SceneArt.test.tsx tests/ui/screens/CaptainScreen.test.tsx
git commit -m "style: add restrained motion, living scene placeholders and voice icons"
```

---

### Task 18: Адаптив под телефон и визуальная проверка Playwright (375 и 1280 px)

**Files:**
- Modify: `src/ui/components/ScreenFrame.module.css`, `src/ui/screens/event/Event.module.css`, `src/ui/components/logbook/Logbook.module.css`, `src/ui/styles/global.css` (медиазапросы)
- Create: `playwright.config.ts`, `tests-e2e/smoke.spec.ts`
- Modify: `package.json` (скрипт `e2e`, devDependency `@playwright/test`), `.github/workflows/ci.yml` (job `e2e`)

**Interfaces:**
- Consumes: собранное приложение (`npm run build && npm run preview`).
- Produces: `npm run e2e`. На каждом экране от меню до плана в двух вьюпортах проверяется отсутствие горизонтального скролла, плюс скриншоты в `test-results/`.

**Поведение (ТЗ 7.2: «базовая адаптивность»; Review Focus #4):**
- Шире 900 px: боковая панель справа. Уже: под основным блоком.
- Событие: сцена и текст в колонку уже 800 px, сцена сверху.
- Поля страницы 16 px на телефоне.
- Кнопка бортжурнала учитывает `env(safe-area-inset-bottom)`.
- Карта всегда 100 % ширины контейнера.

- [ ] **Step 1: Медиазапросы**

`src/ui/components/ScreenFrame.module.css`, дописать:

```css
@media (max-width: 900px) {
  .withSide { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 600px) {
  .frame { padding: var(--space-4) var(--space-4) calc(var(--space-8) + 56px); }
  .title { font-size: var(--text-xl); }
  .actions { position: sticky; bottom: 0; background: var(--bg); padding: var(--space-3) 0; margin-top: var(--space-4); }
  .actions > * { flex: 1 1 auto; }
}
```

`src/ui/screens/event/Event.module.css`, дописать:

```css
@media (max-width: 800px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .scene { position: static; }
}
```

`src/ui/components/logbook/Logbook.module.css`, в `.toggle` заменить `bottom: var(--space-4);` на `bottom: calc(var(--space-4) + env(safe-area-inset-bottom));`.

`src/ui/styles/global.css`, дописать:

```css
html { -webkit-text-size-adjust: 100%; }
img, svg { max-width: 100%; }
@media (max-width: 600px) { body { font-size: 15px; } }
```

- [ ] **Step 2: Playwright**

```bash
npm i -D @playwright/test@^1.48
npx playwright install chromium
```

В `package.json` `scripts` добавить `"e2e": "playwright test"`.

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests-e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  projects: [
    { name: 'phone', use: { ...devices['iPhone 13'], viewport: { width: 375, height: 812 } } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
});
```

`tests-e2e/smoke.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';

async function noHorizontalScroll(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontal overflow on ${label}`).toBeLessThanOrEqual(0);
}

async function screenName(page: Page): Promise<string | null> {
  return page.locator('[data-screen]').first().getAttribute('data-screen');
}

test('from the menu to the day planner without horizontal scroll', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('skipper.lang', 'ru'));
  await page.goto('/');
  const shot = async (name: string) => {
    await noHorizontalScroll(page, name);
    await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  };
  await shot('menu');
  await page.getByRole('button', { name: 'Новая неделя' }).click();
  await shot('captain');
  for (const voice of ['Морское чутьё', 'Осторожность', 'Порядок', 'Механик', 'Дипломат', 'Экономист']) {
    await page.getByRole('button', { name: `Прибавить: ${voice}` }).click({ clickCount: 1 });
    await page.getByRole('button', { name: `Прибавить: ${voice}` }).click();
  }
  await page.getByRole('button', { name: 'Дальше' }).click();
  await shot('boat');
  await page.getByRole('button', { name: 'Взять «Мельтеми 40»' }).click();
  await shot('checkin');
  await page.getByRole('button', { name: 'Закончить приёмку' }).click();
  const topics = page.locator('[data-screen="briefing"] ul li button');
  for (let i = 0; i < 4; i++) await topics.nth(i).click();
  await shot('briefing');
  await page.getByRole('button', { name: 'Начать неделю' }).click();
  await shot('morning');
  await page.getByRole('button', { name: 'Начать день' }).click();
  for (let i = 0; i < 5 && (await screenName(page)) !== 'planning'; i++) {
    if ((await screenName(page)) === 'event') await page.locator('[data-screen="event"] ol button:not([disabled])').first().click();
    else await page.getByRole('button', { name: 'Дальше' }).click();
  }
  expect(await screenName(page)).toBe('planning');
  await shot('planning');
  const map = await page.locator('[data-screen="planning"] figure svg').first().boundingBox();
  const width = page.viewportSize()!.width;
  expect(map!.width).toBeGreaterThan(width * 0.8);
});
```

`.github/workflows/ci.yml`, добавить job:

```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-screenshots
          path: test-results
```

- [ ] **Step 3: Прогнать и посмотреть скриншоты**

Run: `npm run e2e`
Expected: 2 passed (phone, desktop). Открой `test-results/**/planning.png` для обоих проектов. На телефоне карта во всю ширину, панель ресурсов под ней, кнопки не обрезаны. Если тест нашёл переполнение, исправь CSS виноватого экрана (обычно длинные `select` или `pre`).

Run: `npm test && npm run typecheck`
Expected: PASS (vitest не подхватывает `tests-e2e/`).

- [ ] **Step 4: Commit**

```bash
git add src/ui playwright.config.ts tests-e2e package.json package-lock.json .github/workflows/ci.yml
git commit -m "style: make the UI work on phones; add Playwright visual smoke test"
```

---

## Самопроверка плана (выполнена при написании)

**Покрытие ТЗ:**

| Требование ТЗ | Задача |
|---|---|
| 6.1 Главное меню (новая неделя, продолжить, настройки, язык; сцена марины на рассвете) | T5 |
| 6.1 Создание капитана (портреты-иконки голосов, описания) | T6 + иконки T17 |
| 6.1 Выбор лодки (блестящее крупно, важное мелко) | T6 |
| 6.1 Приёмка (разрез яхты, точки, таймер внимания) | T7 (фото повреждений — точка проверки, отдельной галереи нет) |
| 6.1 Брифинг (экипаж за столом, пузыри «что услышали») | T7 |
| 6.1 Карта — главный экран (фишка, стрелки ветра, роза, ресурсы сбоку) | T8, T12, T16 |
| 6.1 Сцена события (иллюстрация + текст справа, голоса как реплики, проверки) | T10 |
| 6.1 Эпизод манёвра (схема, порядок команд, анимация последствий) | T13 (последствия — в сводке перехода и бортжурнале) |
| 6.1 Бортжурнал (записи, рукописный стиль) | T3, T11 |
| 6.1 Разбор (4 шкалы, связи, пометки наставника) | T11 |
| 6.2 Карта от руки, анимированная вода, облака | T16 |
| 6.2 Типографика: засечки, моно для приборов, построчный текст | T1 (шрифты), T4 (Typewriter) |
| 6.2 Палитра, день и ночь меняют тон интерфейса | T1, T15 |
| 6.3 Сцены — заменяемый слой с заглушкой | T1 (`SceneArt` + `manifest.ts`), T17 |
| 7.1 Сохранение: один слот + автосейв в начале дня | T1, T5 |
| 7.1 Статический хостинг | T14 (GitHub Pages) |
| 7.4 #1 Неделя от лодки до разбора без тупиков (в UI) | T14 |
| 7.4 #5 Все тексты RU и EN (в UI) | T1 (`i18n.test.ts`), T14 (EN-прогон без кириллицы) |
| 7.3 Этап 4: «выглядит как задумано на десктопе и телефоне» | T15–T18 |

**Согласованность типов:** имена `Screen`, `Action`, `useAct`, `screenKey`, `renderShell`, `gameAt`, `withEvent`, `previewPlan`, `PlanPreview`, `ChartMap`/`trail`, `describeEntry`/`isNoise`, `resourceRows` сверены между задачами. Экраны Волны 1 не импортируют компоненты своей же волны (T6 — без `VoiceIcon`, T13 — без `planDraft`).

## Решения, принятые без обсуждения (оспорить до запуска)

1. **React 19, а не Svelte.** ТЗ допускает оба варианта. React надёжнее для параллельной работы многих агентов, плюс зрелый Testing Library. Цена ошибки: смена фреймворка = переписать `src/ui/` (движок не затронут).
2. **Vite 5.4, а не 6:** иначе нужно обновлять Vitest 2 → 3 вместе со всеми тестами Этапа 1. Цена: одна волна апгрейда позже.
3. **Без роутера и без стейт-менеджера.** Экран вычисляется из состояния, редьюсер чистый. Цена: если понадобятся URL-ссылки на экраны, добавить hash-роутер.
4. **Предпросмотр плана в движке (`previewPlan`),** а не прогон `planDay` на копии. Копия выдала бы настоящий ветер, исход якорения и фронт — это убило бы ловушку «верить прогнозу». Морское чутьё и открытый барометр показывают больше.
5. **Манёвры собираются до выхода, на отдельном экране,** а не посреди перехода: движок считает день целиком (`planDay`). Резервное якорение для марин с лимитом мест спрашивается заранее. Цена: при разбиении `planDay` по участкам (отложено) экран переедет внутрь перехода.
6. **Сохранение только утром** (ТЗ 7.1), без сейва на каждый шаг. Перезагрузка посреди дня откатывает к утру. Цена: одна строка в `shouldAutosave`, если плейтест скажет «бесит».
7. **Слот очищается на разборе,** чтобы «Продолжить» не вёл в утро 6-го дня.
8. **Двойной клик гасится ключом экрана** (`useAct`), а не блокировкой кнопок.
9. **Деплой на GitHub Pages** (CLAUDE.md называет Render, но ТЗ просит статику; Pages бесплатен и не требует сервера).
10. **Стиль Этапа 4 включён в этот же план** (Волна 5), кроме иллюстраций: они рисуются вне кода.

## Открытые вопросы к автору

- Название игры (ТЗ 7.5): пока «Симулятор шкипера / Skipper Simulator» в `COMMON.appTitle`.
- Подсказка наставника в первой партии (ТЗ 7.5): не делаем. Разбор и так объясняет; если нужна — отдельная задача после плейтеста.
- Нужна ли галерея «фото повреждений» на приёмке, или хватит точки проверки?
