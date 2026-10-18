# Симулятор шкипера — Этап 1: headless-движок, контент MVP, симуляция. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Движок недели шкипера без UI (состояние, ресурсы, погода, время, паруса, обещания, события, манёвры, разбор), весь контент MVP в JSON с валидатором, и консольная симуляция недели с seed, которая доказывает критерии готовности 7.4.

**Architecture:** Чистые функции на TypeScript, `(state, content, input) → newState`, без мутаций. Случайность только через seeded RNG, состояние которого лежит в `GameState.rng`. Каждое изменение ресурсов пишется в лог с причиной (`cause`), из лога собирается разбор. Контент (11 JSON-файлов) валидируется через zod и кросс-проверки при загрузке. Движок не импортирует DOM и `node:*` (кроме `src/content/load-node.ts` и `scripts/`), чтобы на Этапе 2 его можно было без изменений подключить к браузерному UI.

**Tech Stack:** Node ≥ 20, TypeScript 5 (strict), Vitest 2, zod 3 (pin `^3.23`, не 4), tsx для CLI. Без UI-фреймворка (выбор Svelte/React — в плане Этапа 2).

**Spec:** `Симулятор шкипера — ТЗ v0.1.md` (корень проекта). Исполнители читают ТЗ и этот план.

**Вне этого плана (отдельные планы после мержа Этапа 1):** Этап 2 — минимальный UI; Этап 3 — плейтест-баланс и полировка текстов; Этап 4 — стиль. Контент MVP (25–30 событий, RU+EN) пишется здесь, потому что без него симуляция не может доказать критерии 7.4.

## Global Constraints

- Node ≥ 20, ESM (`"type": "module"`), TypeScript `strict: true` + `noUncheckedIndexedAccess: true`.
- zod строго `^3.23` (API `z.record(enumKey, value)` в v4 другой).
- `src/engine/**` и `src/content/{schema,validate,conditions,parse}.ts` не импортируют `node:*`, DOM, `Math.random`, `Date`.
- Все числа баланса берутся из `content/balance.json` (тип `Balance`). В коде движка допустимы только литералы 0, 1, 100 для клампов и 60 для минут в часе.
- Иммутабельность: функции движка не мутируют аргументы, а возвращают новые объекты. Тесты передают входы через `deepFreeze`.
- Случайность только через `src/engine/rng.ts`. Каждая функция, которая бросает кубик, принимает `rng: number` и возвращает `{ value, next }`. Оркестратор кладёт `next` в `state.rng`.
- Каждое изменение ресурсов/флагов/повреждений идёт через `applyOutcome` (Task 6) и пишет `LogEntry` с `cause` из словаря причин (раздел «Контракты» ниже).
- Все тексты — `LocalizedText { ru, en }`, обе строки непустые. Это проверяет валидатор.
- Ошибки ввода и фазы — только `EngineError(code, message)` из `src/engine/errors.ts`.
- Файл ≤ 400 строк, функция ≤ 50 строк. Если файл растёт, его надо делить.
- `src/engine/types.ts` и `content/balance.json` **заморожены после Task 1**. Изменения проходят только через координатора (см. «Параллельное исполнение»).
- Коммиты: `<type>: <description>` (feat, fix, test, chore, docs), с окончанием `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Состав экипажа по умолчанию — 4 гостя (`balance.start.crewSize`). Открытый вопрос ТЗ 7.5 решается конфигом, а не кодом.

## Review Focus

1. **Опечатка во флаге условия события** (`briefing.toilets` вместо `briefing.toilet`). Префиксные флаги по умолчанию равны `false`, поэтому без проверки опечатка тихо выключит событие навсегда. Ожидаемое поведение: валидатор при загрузке сообщает `Unknown identifier` с путём. Тест в Task 12 (`conditions.test.ts`).
2. **Маршрут дня, который не начинается в текущей точке, или несуществующий `routeId`.** Ожидаемое поведение: `EngineError('INVALID_INPUT')` с понятным текстом, исходный state не изменён. Тест в Task 16.
3. **Ресурс уходит в ноль посреди дня** (топливо кончилось на моторном переходе, вода — ночью). Ожидаемое поведение: значение клампится к 0, никаких `NaN` и отрицательных чисел, логируется `zero:<resource>`, моторный переход превращается в парусный. Тесты в Task 6 и Task 16.
4. **Сохранение/загрузка посреди недели** (Этап 2 положит state в localStorage). Ожидаемое поведение: `JSON.parse(JSON.stringify(state))` продолжает партию идентично оригиналу. Тест в Task 18.
5. **Вызов действия не в своей фазе или при неразобранном событии в очереди.** Ожидаемое поведение: `EngineError('WRONG_PHASE' | 'PENDING_EVENT')`, state не изменён. Тесты в Task 13, 16, 17.

---

## Параллельное исполнение

Работа идёт волнами. Внутри волны задачи независимы: у каждой свои файлы, общие только read-only контракты из Task 1. Каждая задача делается в отдельном git worktree (`superpowers:using-git-worktrees`) и мержится в `main` после ревью. Следующая волна стартует, когда смержена вся предыдущая.

| Волна | Задачи | Параллельно | Зависит от |
|---|---|---|---|
| 0 | T1 Foundation (scaffold, types, rng, log, state helpers, errors, balance.json, fixtures) | 1 агент | — |
| 1 | T2 expr · T3 weather · T4 sailing · T5 time · T6 resources · T7 promises · T8 voices · T9 maneuver · T10 content schema/loader · T11 debrief | 10 агентов | T1 |
| 2 | T12 events + condition validator · T13 setup phases · T14 world content · T15 narrative content | 4 агента | Волна 1 (T15 мержится после T12) |
| 3 | T16 morning + passage · T17 evening + finish | 2 агента | Волна 2 |
| 4 | T18 public API, simulation CLI, acceptance tests | 1 агент | Волна 3 |

**Правило единственного владельца:** каждый файл создаёт ровно одна задача. Если задаче нужен новый тип или поле баланса, агент **не правит** `types.ts`/`balance.json` сам, а останавливается и сообщает координатору. Координатор вносит правку в `main`, и все ветки текущей волны делают rebase.

**Fixtures:** все тесты Волн 1–3 используют `tests/fixtures/` (Task 1): маленький мир из 3 точек, а не реальный контент. Поэтому контент (T14/T15) и логика пишутся параллельно.

## Структура файлов

```
skipper-simulator/
├── package.json, tsconfig.json, vitest.config.ts, .gitignore
├── content/                     # данные (ТЗ раздел 5) — правятся без кода
│   ├── balance.json             # T1  все коэффициенты раздела 4
│   ├── boats.json map.json routes.json weather.json crew.json briefing.json maneuvers.json   # T14
│   └── events.json dialogues.json debrief.json                                               # T15
├── src/engine/
│   ├── types.ts      # T1  все типы (заморожен)
│   ├── errors.ts     # T1  EngineError, assertPhase, assertNoPendingEvent
│   ├── rng.ts        # T1  seeded RNG (mulberry32)
│   ├── log.ts        # T1  appendLog, causeMatches, findLog
│   ├── state.ts      # T1  requireBoat/Point/Route/Template/Dialogue, advanceClock, round1
│   ├── expr.ts       # T2  язык условий + buildConditionContext
│   ├── weather.ts    # T3  прогноз → реальный ветер, фронт, сигналы
│   ├── sailing.ts    # T4  курс к ветру, скорость, рифы, риск поломки
│   ├── time.ts       # T5  якорь, марина, время отдыха
│   ├── resources.ts  # T6  applyOutcome, суточный расход, заправка, нули
│   ├── promises.ts   # T7  ожидания экипажа
│   ├── voices.ts     # T8  голоса, проверки, точность приборов
│   ├── maneuver.ts   # T9  эпизоды с порядком команд
│   ├── debrief.ts    # T11 оценки недели и связи «решение → последствие → сигнал»
│   ├── events.ts     # T12 выбор/показ/разрешение событий, очередь
│   ├── setup.ts      # T13 капитан, лодка, приёмка, брифинг
│   ├── day/morning.ts  # T16 startDay
│   ├── day/passage.ts  # T16 planDay
│   ├── day/evening.ts  # T17 endDay, finishWeek
│   └── index.ts      # T18 публичный API
├── src/content/
│   ├── schema.ts     # T10 zod-схемы, синхронные с types.ts
│   ├── validate.ts   # T10 кросс-ссылки
│   ├── parse.ts      # T10 parseContent(raw) → { content, errors }
│   ├── conditions.ts # T12 валидация условий событий
│   └── load-node.ts  # T10 чтение content/*.json (только Node)
├── src/sim/
│   ├── strategies.ts # T18 newbie / expert
│   └── run.ts        # T18 runWeek
├── scripts/
│   ├── validate-content.ts  # T10
│   └── simulate.ts          # T18
└── tests/
    ├── fixtures/{content.ts,state.ts,freeze.ts}   # T1
    └── engine/*.test.ts, content/*.test.ts, sim/*.test.ts
```

## Контракты: словарь причин лога (`LogEntry.cause`)

Разбор (`debrief.json`) ссылается на эти строки, поэтому формат обязателен для всех задач. Матчинг по сегментам: паттерн `p` совпадает с `cause`, если `cause === p` или `cause.startsWith(p + ':')` (функция `causeMatches`, Task 1).

| Cause | kind | Кто пишет | Смысл |
|---|---|---|---|
| `voices:<voice>:<level>` | decision | T13 | распределение очков |
| `boat:choose:<boatId>` | decision | T13 | выбор лодки |
| `checkin:check:<cp>` / `checkin:skip:<cp>` | decision | T13 | приёмка |
| `checkin:found:<defectId>` / `defect:hidden:<defectId>` | info | T13 | дефект найден / остался скрытым |
| `briefing:topic:<id>` / `briefing:skip:<id>` | decision | T13 | брифинг |
| `dialogue:<dialogueId>` | decision | T13, T16, T17 | реплика капитана |
| `barometer:open` / `barometer:ignored` | decision | T16 | смотрел ли барометр утром |
| `signal:<id>` | signal | T16 (`signal:front`), T6 (effect.signal) | сигнал, который был виден |
| `plan:depart:early` / `plan:depart:late` | decision | T16 | выход до/после `time.lateDepartureHour` |
| `plan:route:busy` / `plan:route:easy` | decision | T16 | суммарная дистанция ≥ `time.busyRouteNm` или ног ≥ `time.busyRouteLegs` |
| `plan:autopilot:on` | decision | T16 | автопилот на весь день |
| `plan:shower:<discipline>` | decision | T16 | дисциплина душа |
| `plan:reefs:<0|1|2>` / `plan:mode:<motor|sail>` | decision | T16 | на каждую ногу |
| `order:ok:<maneuverId>` / `order:wrong:<maneuverId>` | decision | T16 | порядок команд (вид ok/wrong стоит первым, чтобы правило разбора матчило `order:wrong`) |
| `fatigue:maneuver:<maneuverId>` | effect | T16 | усталость за ошибки манёвра |
| `leg:<routeId>` | info | T16 | ветер/скорость/часы ноги в `data` |
| `weather:front` | info | T16 | фронт реально пришёл на переходе |
| `engine:start` · `zero:starter` | effect | T16 | запуск / не завёлся (прикурка с базы) |
| `consumption:fuel` · `zero:fuel` | effect | T16 | расход на ноге / кончилось |
| `sail:overpowered` · `sail:break` · `sail:reef_underway` | effect | T16 | перепарусение / порвали / рифление в пути |
| `injury:<context>` | effect | T6, T9, T16 | травма (`effect.injury = true`) |
| `maneuver:<maneuverId>:<errorId>` | effect | T9 | последствие ошибки порядка |
| `anchor:attempts:<n>` · `anchor:dragging` | info/effect | T16 | постановка на якорь |
| `marina:refused` · `marina:fee` | effect | T16 | отказ в марине / оплата |
| `activity:swim` · `activity:taverna` · `rest` | effect | T16, T17 | отдых и развлечения |
| `fatigue:passage` | effect | T16 | усталость за переход |
| `event:<eventId>` | event | T12 | событие показано |
| `choice:<eventId>:<optionId>` | decision | T12 | выбор варианта |
| `event:<eventId>:<optionId>[:success|:fail]` | effect | T12 | последствия варианта |
| `promise:<dialogueId>:kept` / `promise:<dialogueId>:broken` | effect | T7 | ожидание выполнено/сорвано |
| `consumption:water` · `consumption:electric` · `consumption:gas` · `charge:shore` · `charge:starter` | effect | T6 | ночной расход/зарядка |
| `refill:water` · `refill:fuel` · `refill:gas` | effect | T6 | заправка в марине |
| `zero:water` · `zero:service` · `zero:gas` | effect | T6, T17 | последствия нуля |
| `mood_per_day` · `night:sleep` · `night:rolly` | effect | T17 | ночь |
| `return:on_time` / `return:late` · `return:late_fee` | info/effect | T16, T17 | возврат |
| `deposit:unrecorded:<defectId>` | effect | T17 | старое повреждение без фото на приёмке |

**Флаги в `state.flags`** (ключ → `true`): `checkin.<cp>`, `briefing.<topicId>`, `defect.<defectId>` (скрытый, не найден), `defect.<defectId>.found`, `flag.<name>` (из `effect.flag`).

---

### Task 1: Foundation — scaffold, типы, RNG, лог, хелперы, баланс, фикстуры

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/engine/types.ts`, `src/engine/errors.ts`, `src/engine/rng.ts`, `src/engine/log.ts`, `src/engine/state.ts`
- Create: `content/balance.json`
- Create: `tests/fixtures/content.ts`, `tests/fixtures/state.ts`, `tests/fixtures/freeze.ts`, `tests/fixtures/balance.json` (копия `content/balance.json`)
- Test: `tests/engine/rng.test.ts`, `tests/engine/log.test.ts`, `tests/engine/state.test.ts`

**Interfaces:**
- Consumes: —
- Produces: все типы из `types.ts`; `EngineError`, `assertPhase(state, ...phases)`, `assertNoPendingEvent(state)`; `nextFloat/nextRange/nextInt/chance/pickWeighted` (`RngResult<T> = { value: T; next: number }`); `appendLog(state, entry)`, `causeMatches(cause, pattern)`, `findLog(log, pattern)`; `requireBoat/requirePoint/requireRoute/requireTemplate/requireDialogue/requireEvent`, `otherEnd(route, pointId)`, `advanceClock(state, minutes)`, `round1`, `round2`, `clamp`; `makeContent()`, `makeState(overrides)`, `deepFreeze(obj)`.

- [ ] **Step 1: Init repo and install deps**

```bash
cd /Users/mo/claude_code/skipper-simulator
git init -b main
npm init -y
npm i zod@^3.23
npm i -D typescript@^5.6 vitest@^2.1 tsx@^4.19 @types/node@^22
```

- [ ] **Step 2: Write config files**

`package.json` (заменить сгенерированный целиком, версии оставить как установил npm):

```json
{
  "name": "skipper-simulator",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "validate-content": "tsx scripts/validate-content.ts",
    "simulate": "tsx scripts/simulate.ts"
  },
  "dependencies": { "zod": "^3.23.8" },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests", "scripts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
});
```

`.gitignore`:

```
node_modules/
coverage/
.env
```

- [ ] **Step 3: Write `src/engine/types.ts`**

```ts
// Core types shared by engine, content loader and (later) UI.
// FROZEN after Task 1 — changes go through the coordinator.

export type Lang = 'ru' | 'en';
export interface LocalizedText { ru: string; en: string }

export const PILLARS = ['weather', 'time', 'briefing', 'promises', 'safety', 'boat'] as const;
export type Pillar = (typeof PILLARS)[number];

export const VOICES = ['sea_sense', 'caution', 'order', 'mechanic', 'diplomat', 'economist', 'pride', 'crew_voice'] as const;
export type VoiceId = (typeof VOICES)[number];
/** ТЗ 4.2: 6 прокачиваемых. Гордость и Голос экипажа — фиксированный уровень из баланса. */
export const TRAINABLE_VOICES = ['sea_sense', 'caution', 'order', 'mechanic', 'diplomat', 'economist'] as const;
export type TrainableVoice = (typeof TRAINABLE_VOICES)[number];

export const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type Dir8 = (typeof DIRS)[number];

export const CHECKPOINTS = ['anchor', 'impeller', 'gas', 'toilets', 'sails', 'electrics', 'damage_photos'] as const;
export type CheckpointId = (typeof CHECKPOINTS)[number];

export const MANEUVER_KINDS = ['departure', 'mooring', 'anchoring', 'anchor_up'] as const;
export type ManeuverKind = (typeof MANEUVER_KINDS)[number];

export type Phase = 'captain' | 'boat_select' | 'checkin' | 'briefing' | 'morning' | 'planning' | 'evening' | 'return' | 'debrief';
export type EventPhase = 'morning' | 'passage' | 'arrival' | 'evening';
export type PointKind = 'base' | 'marina' | 'bay' | 'quay';
export type Seabed = 'sand' | 'mud' | 'weed' | 'rock';
export type RouteFeature = 'strait' | 'cape' | 'gulf' | 'open';
export type CrewWish = 'beach' | 'taverna' | 'early_start' | 'sailing' | 'rest' | 'swim';
export type Activity = 'swim' | 'taverna' | 'beach';
export type ShowerDiscipline = 'strict' | 'normal' | 'loose';
export type PointOfSail = 'upwind' | 'reach' | 'run';
export type Grade = 'good' | 'ok' | 'bad';

// ---------- resources, effects, log ----------

export interface Resources {
  waterL: number;
  fuelL: number;
  serviceBankPct: number;
  starterBankPct: number;
  gasPct: number;
  moneyEur: number;
  mood: number;
  fatigue: number;
}

/** Keys are snake_case because they come verbatim from events.json (ТЗ 5.2). */
export interface Effect {
  mood?: number;
  fatigue?: number;
  money?: number;
  water?: number;
  fuel?: number;
  service_bank?: number;
  starter_bank?: number;
  gas?: number;
  time_hours?: number;
  mood_per_day?: number;
  damage?: string;
  repair?: string;
  flag?: string;
  injury?: boolean;
  /** Logs `signal:<id>` — a sign the player could have read. */
  signal?: string;
  /** Dialogue id: creates an expectation (handled by events flow, Task 12). */
  promise?: string;
}

export interface Outcome { cause: string; pillar?: Pillar; effect: Effect }

export type LogKind = 'decision' | 'effect' | 'event' | 'signal' | 'check' | 'info';
export interface LogEntry {
  day: number;
  clockMin: number;
  kind: LogKind;
  cause: string;
  pillar?: Pillar;
  delta?: Partial<Record<keyof Resources, number>>;
  data?: Record<string, string | number | boolean>;
}

// ---------- content ----------

export interface HiddenDefect {
  id: string;
  checkpoint: CheckpointId;
  description: LocalizedText;
  /** Damage id charged at check-out if the defect stayed hidden (e.g. unrecorded scratch). */
  chargedOnReturn?: string;
}

export interface Boat {
  id: string;
  name: LocalizedText;
  lengthFt: number;
  cabins: number;
  berths: number;
  waterTankL: number;
  fuelTankL: number;
  serviceBankAh: number;
  serviceBanks: number;
  /** false = one shared bank: service drain also drains the starter. */
  starterSeparate: boolean;
  solarW: number;
  generator: boolean;
  electricToilet: boolean;
  bowThruster: boolean;
  motorKn: number;
  hullSpeedKn: number;
  priceEur: number;
  depositEur: number;
  shinyFeatures: LocalizedText[];
  hiddenDefects: HiddenDefect[];
}

export interface PointServices {
  water: boolean;
  fuel: boolean;
  shorePower: boolean;
  gas: boolean;
  taverna: boolean;
  beach: boolean;
}

export interface MapPoint {
  id: string;
  name: LocalizedText;
  kind: PointKind;
  /** Nautical miles; x grows east, y grows north. */
  x: number;
  y: number;
  seabed: Seabed;
  depthM: number;
  /** 0 = fully exposed to wind FROM this direction, 1 = fully sheltered. */
  shelter: Record<Dir8, number>;
  priceEur: number;
  /** Hour after which berths run out (refusal chance applies). null = never. */
  placesGoneHour: number | null;
  services: PointServices;
}

/** Routes are bidirectional. */
export interface Route {
  id: string;
  from: string;
  to: string;
  distanceNm: number;
  kLocal: number;
  features: RouteFeature[];
}

export interface WeatherDay {
  day: number;
  windKn: number;
  gustKn: number;
  dir: Dir8;
  frontChance: number;
  barometerHpa: number;
}

export interface WeatherTemplate {
  id: string;
  name: LocalizedText;
  /** Multiplier on forecast wind after balance.weather.afternoonFromHour. */
  afternoonFactor: number;
  days: WeatherDay[];
}

export interface CrewArchetype {
  id: string;
  name: LocalizedText;
  names: LocalizedText[];
  wishes: CrewWish[];
  seasickness: number;
  patience: number;
  promiseSensitivity: number;
}

export interface BriefingTopic { id: string; title: LocalizedText; description: LocalizedText }

export type ExpectationSpec =
  | { kind: 'depart_by'; hour: number }
  | { kind: 'arrive_at_kind'; pointKind: PointKind }
  | { kind: 'activity'; activity: Activity }
  | { kind: 'none' };
export type ActiveExpectationSpec = Exclude<ExpectationSpec, { kind: 'none' }>;

export type DialogueContext = 'briefing' | 'morning' | 'evening';
export interface Dialogue {
  id: string;
  contexts: DialogueContext[];
  said: LocalizedText;
  heard: LocalizedText;
  strength: number;
  expectation: ExpectationSpec;
}

export interface EventTrigger { phase: EventPhase; conditions: string[]; chance: number; once?: boolean }
export interface VoiceLine { voice: VoiceId; min_level: number; text: LocalizedText }
export interface VoiceCheck { voice: VoiceId; difficulty: number }
/** Either `check + success + fail`, or `effects`. Option[0] is the instinctive newbie choice. */
export interface EventOption {
  id: string;
  text: LocalizedText;
  requires?: string[];
  check?: VoiceCheck;
  success?: Effect;
  fail?: Effect;
  effects?: Effect;
}
export interface GameEvent {
  id: string;
  pillar: Pillar;
  trigger: EventTrigger;
  scene: string;
  text: LocalizedText;
  voices: VoiceLine[];
  options: EventOption[];
  debrief: LocalizedText;
}

export interface ManeuverStep { id: string; text: LocalizedText }
export interface ManeuverError {
  id: string;
  /** Error fires if step `first` is placed before step `then`. */
  wrongIf: { first: string; then: string };
  effect: Effect;
  injuryChance: number;
  /** Flag (e.g. `briefing.loaded_lines`) that scales effect and injury chance by balance.safety.mitigationFactor. */
  mitigatedBy?: string;
  text: LocalizedText;
}
export interface Maneuver {
  id: string;
  kind: ManeuverKind;
  title: LocalizedText;
  /** Listed in the CORRECT order. UI shuffles. */
  steps: ManeuverStep[];
  errors: ManeuverError[];
}

export interface DebriefRule {
  id: string;
  pillar: Pillar;
  decision: string;
  consequence: string;
  signal?: string;
  priority: number;
  text: LocalizedText;
}

export interface Balance {
  start: { moneyEur: number; mood: number; fatigue: number; gasPct: number; serviceBankPct: number; starterBankPct: number; hour: number; crewSize: number };
  voices: { points: number; maxLevel: number; prideLevel: number; crewVoiceLevel: number; seaSenseSignalLevel: number; mechanicExactLevel: number; cautionRiskPerLevel: number; cautionTimePerLevel: number; orderRiskPerLevel: number };
  water: { perPersonPerDayL: Record<ShowerDiscipline, number>; zeroMoodPenalty: number };
  fuel: { motorLph: number; priceEurPerL: number };
  electric: { fridgeAhPerDay: number; pumpsAhPerDay: number; electricToiletAhPerDay: number; plotterAhPerHour: number; autopilotAhPerHour: number; engineChargeAhPerHour: number; solarAhPerWattDay: number; starterStartPct: number; starterMinPct: number; zeroServiceMoodPenalty: number };
  gas: { pctPerDay: number; exchangeEur: number; exchangeBelowPct: number; noHotFoodMoodPenalty: number };
  mood: { restPerHour: number; restCapHours: number; swimStop: number; tavernaDinner: number; tavernaEurPerPerson: number; overpowerPerHour: number; marinaRefused: number; rollyNight: number; injury: number };
  fatigue: { passagePerHour: number; maneuverError: number; nightRecovery: number; rollyNightPenalty: number; rollyExposure: number; checkPenaltyPerPoint: number };
  sails: {
    reefThresholdKn: [number, number, number];
    partialGenoaBonusKn: number;
    breakChancePerKnOver: number;
    breakChanceMax: number;
    forcedReefMarginKn: number;
    reefUnderwayMin: number;
    reefUnderwayInjuryChance: number;
    fullPowerWindKn: number;
    minSailWindKn: number;
    drifterFactor: number;
    overpowerSpeedFactor: number;
    posFactor: Record<PointOfSail, number>;
    reefFactor: [number, number, number];
    partialGenoaFactor: number;
    detourDistanceFactor: number;
    motorUpwindPenaltyWindKn: number;
    motorUpwindFactor: number;
  };
  time: {
    earliestDepartureHour: number;
    lateDepartureHour: number;
    busyRouteNm: number;
    busyRouteLegs: number;
    maxSwimStops: number;
    departureMin: number;
    anchorMin: [number, number];
    anchorFailChance: [number, number];
    seabedFailFactor: Record<Seabed, number>;
    anchorWindPenaltyKn: number;
    anchorWindPenalty: number;
    anchorBriefedReduction: number;
    anchorMaxAttempts: number;
    marinaMooringMin: number;
    marinaLateRefusalChance: number;
    marinaWaitMin: number;
    swimStopMin: number;
    sunsetHour: number;
  };
  promises: { keptPerStrength: number; brokenPerStrength: number; diplomatSofteningPerLevel: number };
  checks: { base: number; perLevel: number; min: number; max: number };
  checkin: { budgetMin: number; costMin: Record<CheckpointId, number> };
  briefing: { slots: number; maxDialogues: number };
  weather: { frontAddKn: [number, number]; frontShiftSteps: number; barometerDropHpa: number; afternoonFromHour: number };
  schedule: { days: number; returnDeadlineHour: number; lateFeeEur: number };
  rescue: { jumpStartEur: number; jumpStartDelayMin: number; moodPenalty: number };
  safety: { mitigationFactor: number };
  deposit: { damageCostEur: Record<string, number>; defaultDamageEur: number };
  grading: { crewGoodMood: number; crewOkMood: number; boatOkLossEur: number };
  drama: { pillarWeightByDay: Record<string, Partial<Record<Pillar, number>>> };
}

export interface Content {
  boats: Boat[];
  map: MapPoint[];
  routes: Route[];
  weather: WeatherTemplate[];
  crew: CrewArchetype[];
  briefing: BriefingTopic[];
  events: GameEvent[];
  dialogues: Dialogue[];
  debrief: DebriefRule[];
  maneuvers: Maneuver[];
  balance: Balance;
}

// ---------- runtime state ----------

export interface CrewMember { id: string; archetypeId: string; name: LocalizedText }

export interface Expectation {
  id: string;
  dialogueId: string;
  spec: ActiveExpectationSpec;
  strength: number;
  createdDay: number;
  dueDay: number;
  status: 'open' | 'kept' | 'broken';
}

export interface DayWeather {
  day: number;
  forecastKn: number;
  forecastGustKn: number;
  forecastDir: Dir8;
  barometerHpa: number;
  front: boolean;
  frontAddKn: number;
  frontDir: Dir8;
  barometerTrendHpa: number;
  signalsVisible: boolean;
}

export interface LegPlan {
  routeId: string;
  mode: 'motor' | 'sail';
  reefs: 0 | 1 | 2;
  genoa: 'full' | 'partial';
  course: 'direct' | 'detour';
}

export interface DayPlan {
  departureHour: number;
  /** Empty = stay in place today. Legs must chain from the current location. */
  legs: LegPlan[];
  swimStops: number;
  shower: ShowerDiscipline;
  autopilot: boolean;
  /** Step-id order chosen by the player, per maneuver kind. Absent = correct order. */
  maneuverOrders?: Partial<Record<ManeuverKind, string[]>>;
}

export interface DayFacts {
  day: number;
  departureHour: number | null;
  arrivalHour: number | null;
  arrivalPointKind: PointKind | null;
  mooring: 'anchor' | 'berth' | null;
  activities: Activity[];
  motorHours: number;
  sailHours: number;
  autopilotHours: number;
  shower: ShowerDiscipline;
}

export interface GameState {
  version: 1;
  seed: number;
  rng: number;
  lang: Lang;
  phase: Phase;
  day: number;
  clockMin: number;
  weatherTemplateId: string;
  locationId: string;
  boatId: string | null;
  voices: Record<VoiceId, number>;
  resources: Resources;
  flags: Record<string, boolean>;
  damages: string[];
  crew: CrewMember[];
  expectations: Expectation[];
  moodPerDay: number;
  injuries: number;
  log: LogEntry[];
  firedEvents: string[];
  eventQueue: string[];
  weather: DayWeather | null;
  dayFacts: DayFacts | null;
  returnedOnTime: boolean | null;
}
```

- [ ] **Step 4: Write `src/engine/errors.ts`**

```ts
import type { GameState, Phase } from './types';

export type EngineErrorCode = 'WRONG_PHASE' | 'PENDING_EVENT' | 'INVALID_INPUT' | 'NOT_FOUND' | 'BUDGET' | 'CONTENT';

export class EngineError extends Error {
  constructor(public readonly code: EngineErrorCode, message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

export function assertPhase(state: GameState, ...phases: Phase[]): void {
  if (!phases.includes(state.phase)) {
    throw new EngineError('WRONG_PHASE', `Expected phase ${phases.join('|')}, got ${state.phase}`);
  }
}

export function assertNoPendingEvent(state: GameState): void {
  if (state.eventQueue.length > 0) {
    throw new EngineError('PENDING_EVENT', `Resolve event ${state.eventQueue[0]} first`);
  }
}
```

- [ ] **Step 5: Write failing tests for RNG, log, state helpers**

`tests/engine/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chance, nextFloat, nextInt, nextRange, pickWeighted } from '../../src/engine/rng';

describe('rng', () => {
  it('is deterministic for the same state', () => {
    expect(nextFloat(42)).toEqual(nextFloat(42));
    expect(nextFloat(42).value).not.toEqual(nextFloat(43).value);
  });

  it('returns floats in [0, 1) and advances state', () => {
    let s = 1;
    for (let i = 0; i < 1000; i++) {
      const r = nextFloat(s);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      expect(r.next).not.toBe(s);
      s = r.next;
    }
  });

  it('nextRange and nextInt stay in bounds', () => {
    let s = 7;
    for (let i = 0; i < 500; i++) {
      const a = nextRange(s, 8, 12);
      expect(a.value).toBeGreaterThanOrEqual(8);
      expect(a.value).toBeLessThan(12);
      const b = nextInt(a.next, 1, 3);
      expect([1, 2, 3]).toContain(b.value);
      s = b.next;
    }
  });

  it('chance(p) hits about p of the time and always consumes one draw', () => {
    let s = 99;
    let hits = 0;
    for (let i = 0; i < 4000; i++) {
      const r = chance(s, 0.3);
      expect(r.next).toBe(nextFloat(s).next);
      if (r.value) hits++;
      s = r.next;
    }
    expect(hits / 4000).toBeGreaterThan(0.27);
    expect(hits / 4000).toBeLessThan(0.33);
    expect(chance(5, 0).value).toBe(false);
    expect(chance(5, 1).value).toBe(true);
  });

  it('pickWeighted respects weights and returns null for empty/zero weights', () => {
    expect(pickWeighted(1, []).value).toBeNull();
    expect(pickWeighted(1, [{ item: 'a', weight: 0 }]).value).toBeNull();
    let s = 3;
    let a = 0;
    for (let i = 0; i < 2000; i++) {
      const r = pickWeighted(s, [{ item: 'a', weight: 3 }, { item: 'b', weight: 1 }]);
      if (r.value === 'a') a++;
      s = r.next;
    }
    expect(a / 2000).toBeGreaterThan(0.7);
    expect(a / 2000).toBeLessThan(0.8);
  });
});
```

`tests/engine/log.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { appendLog, causeMatches, findLog } from '../../src/engine/log';
import { deepFreeze } from '../fixtures/freeze';
import { makeState } from '../fixtures/state';

describe('log', () => {
  it('appendLog stamps day/clock and does not mutate', () => {
    const s = deepFreeze(makeState({ day: 2, clockMin: 600 }));
    const next = appendLog(s, { kind: 'decision', cause: 'plan:depart:late', pillar: 'time' });
    expect(s.log).toHaveLength(0);
    expect(next.log).toEqual([{ kind: 'decision', cause: 'plan:depart:late', pillar: 'time', day: 2, clockMin: 600 }]);
  });

  it('causeMatches works on segment boundaries', () => {
    expect(causeMatches('event:toilet_clog', 'event:toilet_clog')).toBe(true);
    expect(causeMatches('event:toilet_clog:fix_self:fail', 'event:toilet_clog')).toBe(true);
    expect(causeMatches('event:toilet_clog_extra', 'event:toilet_clog')).toBe(false);
    expect(causeMatches('maneuver:dep:release_before_neutral', 'maneuver')).toBe(true);
  });

  it('findLog filters by pattern', () => {
    let s = makeState();
    s = appendLog(s, { kind: 'effect', cause: 'zero:water' });
    s = appendLog(s, { kind: 'effect', cause: 'zero:starter' });
    s = appendLog(s, { kind: 'effect', cause: 'rest' });
    expect(findLog(s.log, 'zero').map((e) => e.cause)).toEqual(['zero:water', 'zero:starter']);
  });
});
```

`tests/engine/state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EngineError } from '../../src/engine/errors';
import { advanceClock, clamp, otherEnd, requireBoat, requirePoint, requireRoute, round1 } from '../../src/engine/state';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

describe('state helpers', () => {
  const content = makeContent();

  it('require* find by id or throw NOT_FOUND', () => {
    expect(requireBoat(content, makeState()).id).toBe('test_boat');
    expect(requirePoint(content, 'bay_a').kind).toBe('bay');
    expect(() => requireRoute(content, 'nope')).toThrow(EngineError);
    expect(() => requireBoat(content, makeState({ boatId: null }))).toThrow(/No boat/);
  });

  it('otherEnd resolves bidirectional routes', () => {
    const r = requireRoute(content, 'r_base_bay_a');
    expect(otherEnd(r, 'base')).toBe('bay_a');
    expect(otherEnd(r, 'bay_a')).toBe('base');
    expect(otherEnd(r, 'marina_b')).toBeNull();
  });

  it('advanceClock rounds minutes and is pure', () => {
    const s = makeState({ clockMin: 600 });
    expect(advanceClock(s, 30.4).clockMin).toBe(630);
    expect(s.clockMin).toBe(600);
  });

  it('number helpers', () => {
    expect(round1(20.16)).toBe(20.2);
    expect(clamp(150, 0, 100)).toBe(100);
    expect(clamp(-5, 0, 100)).toBe(0);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run tests/engine`
Expected: FAIL — `Cannot find module '../../src/engine/rng'` (and fixtures).

- [ ] **Step 7: Write `src/engine/rng.ts`**

```ts
// mulberry32: tiny, fast, good enough for gameplay; state is a uint32 kept in GameState.rng.
export interface RngResult<T> { value: T; next: number }

export function nextFloat(state: number): RngResult<number> {
  const next = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(next ^ (next >>> 15), next | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, next };
}

export function nextRange(state: number, min: number, max: number): RngResult<number> {
  const r = nextFloat(state);
  return { value: min + r.value * (max - min), next: r.next };
}

export function nextInt(state: number, min: number, maxInclusive: number): RngResult<number> {
  const r = nextFloat(state);
  return { value: min + Math.floor(r.value * (maxInclusive - min + 1)), next: r.next };
}

/** Always consumes exactly one draw so call sequences stay stable regardless of p. */
export function chance(state: number, p: number): RngResult<boolean> {
  const r = nextFloat(state);
  return { value: r.value < p, next: r.next };
}

export function pickWeighted<T>(state: number, items: ReadonlyArray<{ item: T; weight: number }>): RngResult<T | null> {
  const total = items.reduce((sum, i) => sum + Math.max(0, i.weight), 0);
  if (total <= 0) return { value: null, next: state };
  const r = nextFloat(state);
  let acc = r.value * total;
  for (const i of items) {
    acc -= Math.max(0, i.weight);
    if (acc < 0) return { value: i.item, next: r.next };
  }
  return { value: items[items.length - 1]!.item, next: r.next };
}
```

- [ ] **Step 8: Write `src/engine/log.ts`**

```ts
import type { GameState, LogEntry } from './types';

export type NewLogEntry = Omit<LogEntry, 'day' | 'clockMin'>;

export function appendLog(state: GameState, entry: NewLogEntry): GameState {
  return { ...state, log: [...state.log, { ...entry, day: state.day, clockMin: state.clockMin }] };
}

/** Segment-aware prefix match: `event:a` matches `event:a` and `event:a:x`, not `event:ab`. */
export function causeMatches(cause: string, pattern: string): boolean {
  return cause === pattern || cause.startsWith(`${pattern}:`);
}

export function findLog(log: readonly LogEntry[], pattern: string): LogEntry[] {
  return log.filter((e) => causeMatches(e.cause, pattern));
}
```

- [ ] **Step 9: Write `src/engine/state.ts`**

```ts
import { EngineError } from './errors';
import type { Boat, Content, Dialogue, GameEvent, GameState, MapPoint, Route, WeatherTemplate } from './types';

function find<T extends { id: string }>(items: readonly T[], id: string, what: string): T {
  const item = items.find((i) => i.id === id);
  if (!item) throw new EngineError('NOT_FOUND', `${what} "${id}" not found`);
  return item;
}

export function requireBoat(content: Content, state: GameState): Boat {
  if (!state.boatId) throw new EngineError('INVALID_INPUT', 'No boat chosen yet');
  return find(content.boats, state.boatId, 'Boat');
}
export const requirePoint = (c: Content, id: string): MapPoint => find(c.map, id, 'Point');
export const requireRoute = (c: Content, id: string): Route => find(c.routes, id, 'Route');
export const requireTemplate = (c: Content, id: string): WeatherTemplate => find(c.weather, id, 'Weather template');
export const requireDialogue = (c: Content, id: string): Dialogue => find(c.dialogues, id, 'Dialogue');
export const requireEvent = (c: Content, id: string): GameEvent => find(c.events, id, 'Event');

/** Routes are bidirectional: returns the far end, or null if the route doesn't touch pointId. */
export function otherEnd(route: Route, pointId: string): string | null {
  if (route.from === pointId) return route.to;
  if (route.to === pointId) return route.from;
  return null;
}

export function advanceClock(state: GameState, minutes: number): GameState {
  return { ...state, clockMin: state.clockMin + Math.round(minutes) };
}

export const round1 = (n: number): number => Math.round(n * 10) / 10;
export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
```

- [ ] **Step 10: Write `content/balance.json`** (стартовые значения из ТЗ раздел 4; меняются на плейтестах)

```json
{
  "start": { "moneyEur": 6000, "mood": 70, "fatigue": 10, "gasPct": 100, "serviceBankPct": 100, "starterBankPct": 100, "hour": 8, "crewSize": 4 },
  "voices": { "points": 12, "maxLevel": 4, "prideLevel": 2, "crewVoiceLevel": 2, "seaSenseSignalLevel": 2, "mechanicExactLevel": 2, "cautionRiskPerLevel": 0.08, "cautionTimePerLevel": 0.05, "orderRiskPerLevel": 0.1 },
  "water": { "perPersonPerDayL": { "strict": 15, "normal": 25, "loose": 40 }, "zeroMoodPenalty": 25 },
  "fuel": { "motorLph": 4.5, "priceEurPerL": 1.9 },
  "electric": { "fridgeAhPerDay": 45, "pumpsAhPerDay": 10, "electricToiletAhPerDay": 12, "plotterAhPerHour": 1.5, "autopilotAhPerHour": 4, "engineChargeAhPerHour": 25, "solarAhPerWattDay": 0.3, "starterStartPct": 4, "starterMinPct": 35, "zeroServiceMoodPenalty": 15 },
  "gas": { "pctPerDay": 9, "exchangeEur": 30, "exchangeBelowPct": 30, "noHotFoodMoodPenalty": 8 },
  "mood": { "restPerHour": 2, "restCapHours": 5, "swimStop": 6, "tavernaDinner": 8, "tavernaEurPerPerson": 35, "overpowerPerHour": 3, "marinaRefused": 8, "rollyNight": 10, "injury": 30 },
  "fatigue": { "passagePerHour": 4, "maneuverError": 5, "nightRecovery": 30, "rollyNightPenalty": 15, "rollyExposure": 0.5, "checkPenaltyPerPoint": 0.004 },
  "sails": {
    "reefThresholdKn": [16, 22, 28],
    "partialGenoaBonusKn": 3,
    "breakChancePerKnOver": 0.03,
    "breakChanceMax": 0.6,
    "forcedReefMarginKn": 4,
    "reefUnderwayMin": 30,
    "reefUnderwayInjuryChance": 0.1,
    "fullPowerWindKn": 12,
    "minSailWindKn": 5,
    "drifterFactor": 0.15,
    "overpowerSpeedFactor": 0.8,
    "posFactor": { "upwind": 0.55, "reach": 0.85, "run": 0.7 },
    "reefFactor": [1, 0.85, 0.7],
    "partialGenoaFactor": 0.9,
    "detourDistanceFactor": 1.3,
    "motorUpwindPenaltyWindKn": 20,
    "motorUpwindFactor": 0.75
  },
  "time": {
    "earliestDepartureHour": 6,
    "lateDepartureHour": 10,
    "busyRouteNm": 20,
    "busyRouteLegs": 3,
    "maxSwimStops": 3,
    "departureMin": 30,
    "anchorMin": [30, 60],
    "anchorFailChance": [0.2, 0.4],
    "seabedFailFactor": { "sand": 0, "mud": 0.33, "weed": 0.66, "rock": 1 },
    "anchorWindPenaltyKn": 18,
    "anchorWindPenalty": 0.1,
    "anchorBriefedReduction": 0.1,
    "anchorMaxAttempts": 3,
    "marinaMooringMin": 40,
    "marinaLateRefusalChance": 0.55,
    "marinaWaitMin": 45,
    "swimStopMin": 60,
    "sunsetHour": 20
  },
  "promises": { "keptPerStrength": 5, "brokenPerStrength": 15, "diplomatSofteningPerLevel": 0.1 },
  "checks": { "base": 0.5, "perLevel": 0.15, "min": 0.05, "max": 0.95 },
  "checkin": { "budgetMin": 90, "costMin": { "anchor": 15, "impeller": 20, "gas": 10, "toilets": 15, "sails": 25, "electrics": 20, "damage_photos": 15 } },
  "briefing": { "slots": 4, "maxDialogues": 2 },
  "weather": { "frontAddKn": [8, 12], "frontShiftSteps": 2, "barometerDropHpa": 5, "afternoonFromHour": 13 },
  "schedule": { "days": 6, "returnDeadlineHour": 17, "lateFeeEur": 400 },
  "rescue": { "jumpStartEur": 120, "jumpStartDelayMin": 180, "moodPenalty": 5 },
  "safety": { "mitigationFactor": 0.5 },
  "deposit": { "damageCostEur": { "sail_torn": 900, "toilet_broken": 250, "prop_line": 400, "hull_scratch": 600, "impeller": 300, "anchor_lost": 700 }, "defaultDamageEur": 300 },
  "grading": { "crewGoodMood": 70, "crewOkMood": 45, "boatOkLossEur": 500 },
  "drama": { "pillarWeightByDay": { "1": { "time": 1.5 }, "2": { "boat": 1.5 }, "3": { "weather": 1.5, "safety": 1.3 }, "4": { "weather": 1.5, "safety": 1.3 }, "5": { "promises": 1.5 }, "6": { "time": 1.5, "weather": 1.3 } } }
}
```

- [ ] **Step 11: Write fixtures**

Сначала заморозь копию баланса для тестов. Юнит-тесты Волн 1–3 проверяют точные числа, а T18 будет тюнить `content/balance.json`. Копия развязывает одно с другим:

```bash
mkdir -p tests/fixtures && cp content/balance.json tests/fixtures/balance.json
```

`tests/fixtures/freeze.ts`:

```ts
/** Recursively freezes so any accidental mutation in engine code throws in strict-mode tests. */
export function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj as Record<string, unknown>)) deepFreeze(v);
  }
  return obj;
}
```

`tests/fixtures/content.ts`:

```ts
import balanceJson from './balance.json';
import type { Balance, Content, Dir8, LocalizedText, MapPoint } from '../../src/engine/types';

const t = (ru: string, en: string): LocalizedText => ({ ru, en });
const shelter = (v: Partial<Record<Dir8, number>>, d = 0.5): Record<Dir8, number> => ({
  N: d, NE: d, E: d, SE: d, S: d, SW: d, W: d, NW: d, ...v,
});
const allServices = { water: true, fuel: true, shorePower: true, gas: true, taverna: true, beach: false };
const noServices = { water: false, fuel: false, shorePower: false, gas: false, taverna: false, beach: true };

const map: MapPoint[] = [
  { id: 'base', name: t('База', 'Base'), kind: 'base', x: 0, y: 0, seabed: 'sand', depthM: 4, shelter: shelter({}, 0.9), priceEur: 0, placesGoneHour: null, services: allServices },
  { id: 'bay_a', name: t('Бухта А', 'Bay A'), kind: 'bay', x: 0, y: 10, seabed: 'sand', depthM: 6, shelter: shelter({ N: 0.2, NE: 0.3, NW: 0.3, E: 0.8, W: 0.8 }, 1), priceEur: 0, placesGoneHour: null, services: noServices },
  { id: 'marina_b', name: t('Марина Б', 'Marina B'), kind: 'marina', x: 8, y: 10, seabed: 'mud', depthM: 5, shelter: shelter({}, 0.95), priceEur: 80, placesGoneHour: 15, services: allServices },
];

/** Minimal 3-point world for unit tests of Waves 1–3. Real content lives in content/*.json. */
export function makeContent(): Content {
  return {
    balance: balanceJson as unknown as Balance,
    boats: [{
      id: 'test_boat', name: t('Тест 40', 'Test 40'), lengthFt: 40, cabins: 3, berths: 6,
      waterTankL: 300, fuelTankL: 150, serviceBankAh: 110, serviceBanks: 2, starterSeparate: true,
      solarW: 0, generator: false, electricToilet: false, bowThruster: true, motorKn: 6.5, hullSpeedKn: 7.5,
      priceEur: 4000, depositEur: 2000,
      shinyFeatures: [t('Подруливающее устройство', 'Bow thruster')],
      hiddenDefects: [
        { id: 'worn_impeller', checkpoint: 'impeller', description: t('Изношенный импеллер', 'Worn impeller') },
        { id: 'old_scratch', checkpoint: 'damage_photos', description: t('Старая царапина', 'Old scratch'), chargedOnReturn: 'hull_scratch' },
      ],
    }],
    map,
    routes: [
      { id: 'r_base_bay_a', from: 'base', to: 'bay_a', distanceNm: 10, kLocal: 1.0, features: ['open'] },
      { id: 'r_bay_a_marina_b', from: 'bay_a', to: 'marina_b', distanceNm: 8, kLocal: 1.3, features: ['strait'] },
      { id: 'r_marina_b_base', from: 'marina_b', to: 'base', distanceNm: 12.8, kLocal: 1.2, features: ['gulf'] },
    ],
    weather: [{
      id: 'test_week', name: t('Тестовая неделя', 'Test week'), afternoonFactor: 1.2,
      days: [1, 2, 3, 4, 5, 6].map((day) => ({ day, windKn: 12, gustKn: 18, dir: 'NW' as const, frontChance: day === 3 ? 0.5 : 0, barometerHpa: 1015 })),
    }],
    crew: [
      { id: 'party', name: t('Тусовщик', 'Party guest'), names: [t('Аня', 'Anya'), t('Олег', 'Oleg')], wishes: ['taverna', 'beach', 'swim'], seasickness: 0.3, patience: 0.4, promiseSensitivity: 1.2 },
      { id: 'sailor', name: t('Яхтсмен', 'Sailor'), names: [t('Ира', 'Ira'), t('Макс', 'Max')], wishes: ['sailing', 'early_start'], seasickness: 0.1, patience: 0.7, promiseSensitivity: 0.8 },
    ],
    briefing: ['sails', 'cleats', 'fenders', 'captain_only', 'anchor', 'loaded_lines', 'toilet', 'mob'].map((id) => ({
      id, title: t(`Тема ${id}`, `Topic ${id}`), description: t(`Описание ${id}`, `Description ${id}`),
    })),
    dialogues: [
      { id: 'early_try', contexts: ['briefing', 'morning', 'evening'], said: t('Постараемся выйти пораньше', "We'll try to leave early"), heard: t('Выходим в 8', 'We leave at 8'), strength: 0.9, expectation: { kind: 'depart_by', hour: 8 } },
      { id: 'ten_bonus', contexts: ['briefing', 'evening'], said: t('Выходим в 10, если получится раньше — бонус', "We leave at 10; earlier is a bonus"), heard: t('Выходим в 10', 'We leave at 10'), strength: 0.6, expectation: { kind: 'depart_by', hour: 10 } },
      { id: 'decide_morning', contexts: ['briefing', 'evening'], said: t('Решим утром по погоде', "We'll decide in the morning"), heard: t('Пока неясно', 'Not decided yet'), strength: 0.2, expectation: { kind: 'none' } },
      { id: 'promise_taverna', contexts: ['evening'], said: t('Завтра таверна', 'Taverna tomorrow'), heard: t('Завтра точно таверна', 'Taverna tomorrow for sure'), strength: 0.7, expectation: { kind: 'activity', activity: 'taverna' } },
    ],
    events: [{
      id: 'toilet_clog', pillar: 'boat',
      trigger: { phase: 'evening', conditions: ['day >= 3', '!checkin.toilets', '!briefing.toilet'], chance: 0.35 },
      scene: 'cabin_night',
      text: t('Из носового гальюна доносится крик. Насос не качает.', "A shout from the forward head. The pump won't move."),
      voices: [{ voice: 'mechanic', min_level: 2, text: t('Клапан забит. Это час работы и перчатки.', "Valve's clogged. An hour of work and gloves.") }],
      options: [
        { id: 'fix_self', text: t('Чинить самому', 'Fix it yourself'), check: { voice: 'mechanic', difficulty: 2 }, success: { fatigue: 15, mood: 5 }, fail: { fatigue: 25, mood: -10, damage: 'toilet_broken' } },
        { id: 'call_base', text: t('Звонить на базу', 'Call the base'), effects: { money: -80, time_hours: 4 } },
        { id: 'endure', text: t('Терпеть до марины', 'Put up with it until the marina'), effects: { mood_per_day: -8 } },
      ],
      debrief: t('Гальюны не проверены на приёмке и не было брифинга по их использованию.', 'Heads were not checked at check-in and the crew got no briefing on them.'),
    }],
    maneuvers: [{
      id: 'dep_test', kind: 'departure', title: t('Отход', 'Departure'),
      steps: [
        { id: 'neutral', text: t('Рычаг в нейтраль', 'Throttle to neutral') },
        { id: 'command_helm', text: t('Команда рулевому', 'Brief the helm') },
        { id: 'release_lines', text: t('Отдать швартовы', 'Release lines') },
        { id: 'engage_gear', text: t('Дать ход', 'Engage gear') },
      ],
      errors: [
        { id: 'release_before_neutral', wrongIf: { first: 'release_lines', then: 'neutral' }, effect: { damage: 'prop_line', mood: -5 }, injuryChance: 0, text: t('Швартов на винте', 'Line in the prop') },
        { id: 'release_before_command', wrongIf: { first: 'release_lines', then: 'command_helm' }, effect: { mood: -6, fatigue: 6 }, injuryChance: 0.2, mitigatedBy: 'briefing.loaded_lines', text: t('Конец вырвало из рук', 'Line ripped from hands') },
        { id: 'gear_before_release', wrongIf: { first: 'engage_gear', then: 'release_lines' }, effect: { damage: 'hull_scratch', mood: -8 }, injuryChance: 0, text: t('Удар о соседа', 'Hit the neighbour') },
      ],
    },
    ...(['mooring', 'anchoring', 'anchor_up'] as const).map((kind) => ({
      id: `${kind}_test`, kind, title: t(`Манёвр ${kind}`, `Maneuver ${kind}`),
      steps: [{ id: 'a', text: t('Шаг А', 'Step A') }, { id: 'b', text: t('Шаг Б', 'Step B') }],
      errors: [],
    }))],
    debrief: [{
      id: 'toilet_unchecked', pillar: 'boat', decision: 'checkin:skip:toilets', consequence: 'event:toilet_clog', priority: 5,
      text: t('Не проверили гальюны → засор на третий день.', 'Heads unchecked → clog on day three.'),
    }],
  };
}
```

`tests/fixtures/state.ts`:

```ts
import type { GameState } from '../../src/engine/types';

/** A day-1 planning state at `base` on `test_boat`. Override any field per test. */
export function makeState(overrides: Partial<GameState> = {}): GameState {
  const base: GameState = {
    version: 1,
    seed: 42,
    rng: 42,
    lang: 'ru',
    phase: 'planning',
    day: 1,
    clockMin: 8 * 60,
    weatherTemplateId: 'test_week',
    locationId: 'base',
    boatId: 'test_boat',
    voices: { sea_sense: 2, caution: 2, order: 2, mechanic: 2, diplomat: 2, economist: 2, pride: 2, crew_voice: 2 },
    resources: { waterL: 300, fuelL: 150, serviceBankPct: 100, starterBankPct: 100, gasPct: 100, moneyEur: 1500, mood: 70, fatigue: 10 },
    flags: {},
    damages: [],
    crew: [
      { id: 'crew_1', archetypeId: 'party', name: { ru: 'Аня', en: 'Anya' } },
      { id: 'crew_2', archetypeId: 'sailor', name: { ru: 'Ира', en: 'Ira' } },
      { id: 'crew_3', archetypeId: 'party', name: { ru: 'Олег', en: 'Oleg' } },
      { id: 'crew_4', archetypeId: 'sailor', name: { ru: 'Макс', en: 'Max' } },
    ],
    expectations: [],
    moodPerDay: 0,
    injuries: 0,
    log: [],
    firedEvents: [],
    eventQueue: [],
    weather: { day: 1, forecastKn: 12, forecastGustKn: 18, forecastDir: 'NW', barometerHpa: 1015, front: false, frontAddKn: 0, frontDir: 'NW', barometerTrendHpa: 0, signalsVisible: false },
    dayFacts: null,
    returnedOnTime: null,
  };
  return { ...base, ...overrides };
}
```

- [ ] **Step 12: Run tests and typecheck**

Run: `npx vitest run tests/engine && npx tsc --noEmit`
Expected: все тесты PASS, tsc без ошибок.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "chore: scaffold engine foundation (types, rng, log, balance, fixtures)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## Wave 1 (параллельно, 10 задач)

### Task 2: Язык условий событий (`expr.ts`)

**Files:**
- Create: `src/engine/expr.ts`
- Test: `tests/engine/expr.test.ts`

**Interfaces:**
- Consumes: `EngineError`; типы `Content`, `GameState`, `VOICES`.
- Produces:
  - `type CondValue = number | boolean | string`, `type CondContext = Readonly<Record<string, CondValue>>`
  - `FLAG_PREFIXES: readonly ['checkin.', 'briefing.', 'flag.', 'defect.', 'damage.', 'wish.']` — отсутствующий ключ с таким префиксом = `false`
  - `CONTEXT_KEYS`, `BOAT_KEYS` — списки известных идентификаторов (для валидатора T12)
  - `parseCondition(src: string): void` — бросает `EngineError('CONTENT')` при синтаксической ошибке
  - `evaluateCondition(src: string, ctx: CondContext): boolean`
  - `evaluateAll(conds: readonly string[], ctx: CondContext): boolean` (AND)
  - `conditionIdentifiers(src: string): string[]`
  - `buildConditionContext(state: GameState, content: Content): CondContext`

Грамматика: `or := and ('||' and)*`, `and := unary ('&&' unary)*`, `unary := '!' unary | cmp`, `cmp := primary (op primary)?`, `primary := number | 'string' | ident | true | false | '(' or ')'`, `op ∈ >= <= > < == !=`. Идентификатор: `[a-zA-Z_][\w.]*`. Неизвестный идентификатор без флагового префикса → `EngineError('CONTENT', 'Unknown identifier ...')`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildConditionContext, conditionIdentifiers, evaluateAll, evaluateCondition, parseCondition } from '../../src/engine/expr';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

describe('expr', () => {
  const ctx = { day: 3, water: 40, location_kind: 'bay', front: true, 'checkin.toilets': true };

  it('compares numbers and strings', () => {
    expect(evaluateCondition('day >= 3', ctx)).toBe(true);
    expect(evaluateCondition('day > 3', ctx)).toBe(false);
    expect(evaluateCondition('water < 50.5', ctx)).toBe(true);
    expect(evaluateCondition("location_kind == 'bay'", ctx)).toBe(true);
    expect(evaluateCondition("location_kind != 'bay'", ctx)).toBe(false);
  });

  it('handles !, &&, ||, parentheses and precedence', () => {
    expect(evaluateCondition('!checkin.toilets', ctx)).toBe(false);
    expect(evaluateCondition('front && day >= 3', ctx)).toBe(true);
    expect(evaluateCondition('day < 2 || front', ctx)).toBe(true);
    expect(evaluateCondition('day < 2 || day > 5 && front', ctx)).toBe(false);
    expect(evaluateCondition('(day < 2 || day > 2) && front', ctx)).toBe(true);
    expect(evaluateCondition('true', ctx)).toBe(true);
  });

  it('missing prefixed flags default to false', () => {
    expect(evaluateCondition('briefing.toilet', ctx)).toBe(false);
    expect(evaluateCondition('!briefing.toilet', ctx)).toBe(true);
    expect(evaluateCondition('defect.worn_impeller', ctx)).toBe(false);
  });

  it('unknown non-prefixed identifiers throw', () => {
    expect(() => evaluateCondition('dya >= 3', ctx)).toThrow(/Unknown identifier "dya"/);
  });

  it('syntax errors throw on parse', () => {
    expect(() => parseCondition('day >= ')).toThrow(/condition/);
    expect(() => parseCondition('(day >= 3')).toThrow(/Missing \)/);
    expect(() => parseCondition('day # 3')).toThrow(/Unexpected/);
    expect(() => evaluateCondition("day >= 'x'", ctx)).toThrow(/needs numbers/);
  });

  it('evaluateAll is AND over the list; empty list is true', () => {
    expect(evaluateAll([], ctx)).toBe(true);
    expect(evaluateAll(['day >= 3', '!checkin.toilets'], ctx)).toBe(false);
  });

  it('conditionIdentifiers lists identifiers', () => {
    expect(conditionIdentifiers('day >= 3 && !briefing.toilet || front').sort()).toEqual(['briefing.toilet', 'day', 'front']);
  });

  it('buildConditionContext exposes resources, flags, damages, wishes, voices, boat', () => {
    const content = makeContent();
    const state = makeState({ flags: { 'checkin.toilets': true }, damages: ['sail_torn'], resources: { ...makeState().resources, waterL: 75 } });
    const c = buildConditionContext(state, content);
    expect(c.day).toBe(1);
    expect(c.water).toBe(75);
    expect(c.water_pct).toBe(25);
    expect(c['checkin.toilets']).toBe(true);
    expect(c['damage.sail_torn']).toBe(true);
    expect(c['wish.taverna']).toBe(true);
    expect(c['wish.rest']).toBeUndefined();
    expect(c['voice.mechanic']).toBe(2);
    expect(c.at_base).toBe(true);
    expect(c.location_kind).toBe('base');
    expect(c['boat.shared_bank']).toBe(false);
    expect(c.wind).toBe(12);
    expect(c.front).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/expr.test.ts`
Expected: FAIL — `Cannot find module '../../src/engine/expr'`.

- [ ] **Step 3: Write implementation**

```ts
import { EngineError } from './errors';
import type { Content, GameState } from './types';

export type CondValue = number | boolean | string;
export type CondContext = Readonly<Record<string, CondValue>>;

/** Dotted identifiers with these prefixes default to false when absent from context. */
export const FLAG_PREFIXES = ['checkin.', 'briefing.', 'flag.', 'defect.', 'damage.', 'wish.'] as const;
export const CONTEXT_KEYS = [
  'day', 'hour', 'water', 'water_pct', 'fuel', 'fuel_pct', 'service_bank', 'starter_bank', 'gas', 'money',
  'mood', 'fatigue', 'injuries', 'wind', 'gust', 'front', 'location_kind', 'at_base', 'at_marina', 'at_bay', 'at_quay',
] as const;
export const BOAT_KEYS = ['boat.shared_bank', 'boat.electric_toilet', 'boat.bow_thruster', 'boat.generator', 'boat.solar'] as const;

type Token =
  | { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'id'; v: string }
  | { t: 'op'; v: string } | { t: 'lp' } | { t: 'rp' };
type Node =
  | { k: 'lit'; v: CondValue } | { k: 'id'; name: string }
  | { k: 'not'; e: Node } | { k: 'bin'; op: string; l: Node; r: Node };

const TWO_CHAR_OPS = ['>=', '<=', '==', '!=', '&&', '||'];
const CMP_OPS = ['>=', '<=', '==', '!=', '>', '<'];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const c = rest[0]!;
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === '(' || c === ')') { tokens.push({ t: c === '(' ? 'lp' : 'rp' }); i += 1; continue; }
    const two = rest.slice(0, 2);
    if (TWO_CHAR_OPS.includes(two)) { tokens.push({ t: 'op', v: two }); i += 2; continue; }
    if ('<>!'.includes(c)) { tokens.push({ t: 'op', v: c }); i += 1; continue; }
    const num = /^-?\d+(\.\d+)?/.exec(rest);
    if (num) { tokens.push({ t: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const str = /^'([^']*)'/.exec(rest);
    if (str) { tokens.push({ t: 'str', v: str[1]! }); i += str[0].length; continue; }
    const id = /^[a-zA-Z_][\w.]*/.exec(rest);
    if (id) { tokens.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    throw new EngineError('CONTENT', `Unexpected '${c}' at ${i} in condition "${src}"`);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[], private readonly src: string) {}

  parse(): Node {
    const node = this.or();
    if (this.pos < this.tokens.length) this.fail('Unexpected trailing tokens');
    return node;
  }
  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private isOp(v: string): boolean { const t = this.peek(); return t?.t === 'op' && t.v === v; }
  private fail(msg: string): never { throw new EngineError('CONTENT', `${msg} in condition "${this.src}"`); }
  private or(): Node {
    let l = this.and();
    while (this.isOp('||')) { this.pos += 1; l = { k: 'bin', op: '||', l, r: this.and() }; }
    return l;
  }
  private and(): Node {
    let l = this.unary();
    while (this.isOp('&&')) { this.pos += 1; l = { k: 'bin', op: '&&', l, r: this.unary() }; }
    return l;
  }
  private unary(): Node {
    if (this.isOp('!')) { this.pos += 1; return { k: 'not', e: this.unary() }; }
    return this.cmp();
  }
  private cmp(): Node {
    const l = this.primary();
    const t = this.peek();
    if (t?.t === 'op' && CMP_OPS.includes(t.v)) { this.pos += 1; return { k: 'bin', op: t.v, l, r: this.primary() }; }
    return l;
  }
  private primary(): Node {
    const t = this.peek();
    if (!t) this.fail('Unexpected end');
    this.pos += 1;
    if (t.t === 'num' || t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 'id') return t.v === 'true' || t.v === 'false' ? { k: 'lit', v: t.v === 'true' } : { k: 'id', name: t.v };
    if (t.t === 'lp') {
      const e = this.or();
      if (this.peek()?.t !== 'rp') this.fail('Missing )');
      this.pos += 1;
      return e;
    }
    this.fail('Unexpected token');
  }
}

const cache = new Map<string, Node>();
function compile(src: string): Node {
  const hit = cache.get(src);
  if (hit) return hit;
  const node = new Parser(tokenize(src), src).parse();
  cache.set(src, node);
  return node;
}

const truthy = (v: CondValue): boolean => v !== false && v !== 0 && v !== '';

function lookup(name: string, ctx: CondContext, src: string): CondValue {
  const v = ctx[name];
  if (v !== undefined) return v;
  if (FLAG_PREFIXES.some((p) => name.startsWith(p))) return false;
  throw new EngineError('CONTENT', `Unknown identifier "${name}" in condition "${src}"`);
}

function evalNode(n: Node, ctx: CondContext, src: string): CondValue {
  switch (n.k) {
    case 'lit': return n.v;
    case 'id': return lookup(n.name, ctx, src);
    case 'not': return !truthy(evalNode(n.e, ctx, src));
    case 'bin': {
      if (n.op === '&&') return truthy(evalNode(n.l, ctx, src)) && truthy(evalNode(n.r, ctx, src));
      if (n.op === '||') return truthy(evalNode(n.l, ctx, src)) || truthy(evalNode(n.r, ctx, src));
      const l = evalNode(n.l, ctx, src);
      const r = evalNode(n.r, ctx, src);
      if (n.op === '==') return l === r;
      if (n.op === '!=') return l !== r;
      if (typeof l !== 'number' || typeof r !== 'number') {
        throw new EngineError('CONTENT', `Operator ${n.op} needs numbers in condition "${src}"`);
      }
      if (n.op === '>=') return l >= r;
      if (n.op === '<=') return l <= r;
      return n.op === '>' ? l > r : l < r;
    }
  }
}

export function parseCondition(src: string): void {
  compile(src);
}

export function evaluateCondition(src: string, ctx: CondContext): boolean {
  return truthy(evalNode(compile(src), ctx, src));
}

export function evaluateAll(conds: readonly string[], ctx: CondContext): boolean {
  return conds.every((c) => evaluateCondition(c, ctx));
}

export function conditionIdentifiers(src: string): string[] {
  const out = new Set<string>();
  const walk = (n: Node): void => {
    if (n.k === 'id') out.add(n.name);
    else if (n.k === 'not') walk(n.e);
    else if (n.k === 'bin') { walk(n.l); walk(n.r); }
  };
  walk(compile(src));
  return [...out];
}

export function buildConditionContext(state: GameState, content: Content): CondContext {
  const boat = content.boats.find((b) => b.id === state.boatId);
  const point = content.map.find((p) => p.id === state.locationId);
  const r = state.resources;
  const w = state.weather;
  const ctx: Record<string, CondValue> = {
    day: state.day,
    hour: state.clockMin / 60,
    water: r.waterL,
    water_pct: boat ? (r.waterL / boat.waterTankL) * 100 : 0,
    fuel: r.fuelL,
    fuel_pct: boat ? (r.fuelL / boat.fuelTankL) * 100 : 0,
    service_bank: r.serviceBankPct,
    starter_bank: r.starterBankPct,
    gas: r.gasPct,
    money: r.moneyEur,
    mood: r.mood,
    fatigue: r.fatigue,
    injuries: state.injuries,
    wind: w?.forecastKn ?? 0,
    gust: w?.forecastGustKn ?? 0,
    front: w?.front ?? false,
    location_kind: point?.kind ?? '',
    at_base: point?.kind === 'base',
    at_marina: point?.kind === 'marina' || point?.kind === 'base',
    at_bay: point?.kind === 'bay',
    at_quay: point?.kind === 'quay',
    'boat.shared_bank': boat ? !boat.starterSeparate : false,
    'boat.electric_toilet': boat?.electricToilet ?? false,
    'boat.bow_thruster': boat?.bowThruster ?? false,
    'boat.generator': boat?.generator ?? false,
    'boat.solar': (boat?.solarW ?? 0) > 0,
  };
  for (const [k, v] of Object.entries(state.flags)) ctx[k] = v;
  for (const d of state.damages) ctx[`damage.${d}`] = true;
  for (const m of state.crew) {
    const a = content.crew.find((c) => c.id === m.archetypeId);
    for (const wish of a?.wishes ?? []) ctx[`wish.${wish}`] = true;
  }
  for (const [v, lvl] of Object.entries(state.voices)) ctx[`voice.${v}`] = lvl;
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/expr.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/expr.ts tests/engine/expr.test.ts
git commit -m "feat: add event condition language and context builder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Погода (`weather.ts`)

**Files:**
- Create: `src/engine/weather.ts`
- Test: `tests/engine/weather.test.ts`

**Interfaces:**
- Consumes: `chance`, `nextRange`, `RngResult` (T1); `EngineError`; `round1`; типы `Balance`, `DayWeather`, `Dir8`, `DIRS`, `MapPoint`, `WeatherTemplate`.
- Produces:
  - `shiftDir(dir: Dir8, steps: number): Dir8`
  - `rollDayWeather(rng: number, template: WeatherTemplate, day: number, b: Balance): RngResult<DayWeather>` — всегда 2 броска; `signalsVisible: false` (ставит оркестратор)
  - `interface RealWind { windKn: number; gustKn: number; dir: Dir8; frontActive: boolean }`
  - `realWind(w: DayWeather, kLocal: number, hour: number, template: WeatherTemplate, b: Balance): RealWind` — ТЗ 4.3: `W = forecast × diurnal × kLocal + front`; фронт приходит только после `afternoonFromHour`
  - `signalsVisible(seaSenseLevel: number, barometerOpened: boolean, b: Balance): boolean`
  - `exposure(point: MapPoint, dir: Dir8): number` — `1 − shelter[dir]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { exposure, realWind, rollDayWeather, shiftDir, signalsVisible } from '../../src/engine/weather';
import { makeContent } from '../fixtures/content';
import type { DayWeather } from '../../src/engine/types';

const content = makeContent();
const b = content.balance;
const template = content.weather[0]!;

const calm: DayWeather = { day: 3, forecastKn: 12, forecastGustKn: 18, forecastDir: 'NW', barometerHpa: 1015, front: false, frontAddKn: 0, frontDir: 'NW', barometerTrendHpa: 0, signalsVisible: false };

describe('weather', () => {
  it('shiftDir wraps around the compass', () => {
    expect(shiftDir('NW', 2)).toBe('NE');
    expect(shiftDir('N', -1)).toBe('NW');
    expect(shiftDir('S', 8)).toBe('S');
  });

  it('rollDayWeather is deterministic and copies the forecast', () => {
    const a = rollDayWeather(10, template, 1, b);
    expect(a).toEqual(rollDayWeather(10, template, 1, b));
    expect(a.value.forecastKn).toBe(12);
    expect(a.value.front).toBe(false);
    expect(a.value.frontAddKn).toBe(0);
    expect(a.value.signalsVisible).toBe(false);
  });

  it('front appears with template probability and shifts wind/barometer', () => {
    let s = 1;
    let fronts = 0;
    for (let i = 0; i < 2000; i++) {
      const r = rollDayWeather(s, template, 3, b);
      if (r.value.front) {
        fronts++;
        expect(r.value.frontAddKn).toBeGreaterThanOrEqual(8);
        expect(r.value.frontAddKn).toBeLessThanOrEqual(12);
        expect(r.value.frontDir).toBe('NE');
        expect(r.value.barometerTrendHpa).toBe(-5);
      }
      s = r.next;
    }
    expect(fronts / 2000).toBeGreaterThan(0.46);
    expect(fronts / 2000).toBeLessThan(0.54);
  });

  it('throws for a day missing from the template', () => {
    expect(() => rollDayWeather(1, template, 9, b)).toThrow(/no day 9/);
  });

  it('realWind = forecast × diurnal × kLocal + front (front only in the afternoon)', () => {
    expect(realWind(calm, 1.4, 10, template, b)).toEqual({ windKn: 16.8, gustKn: 25.2, dir: 'NW', frontActive: false });
    expect(realWind(calm, 1.4, 14, template, b).windKn).toBe(20.2);
    const front = { ...calm, front: true, frontAddKn: 10, frontDir: 'NE' as const };
    expect(realWind(front, 1.4, 10, template, b)).toMatchObject({ windKn: 16.8, dir: 'NW', frontActive: false });
    expect(realWind(front, 1.4, 14, template, b)).toMatchObject({ windKn: 30.2, dir: 'NE', frontActive: true });
  });

  it('signals are visible with sea sense ≥ 2 or an opened barometer', () => {
    expect(signalsVisible(1, false, b)).toBe(false);
    expect(signalsVisible(2, false, b)).toBe(true);
    expect(signalsVisible(0, true, b)).toBe(true);
  });

  it('exposure is 1 - shelter', () => {
    const bay = content.map.find((p) => p.id === 'bay_a')!;
    expect(exposure(bay, 'N')).toBeCloseTo(0.8);
    expect(exposure(bay, 'S')).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/weather.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
import { EngineError } from './errors';
import { chance, nextRange, type RngResult } from './rng';
import { round1 } from './state';
import { DIRS, type Balance, type DayWeather, type Dir8, type MapPoint, type WeatherTemplate } from './types';

export interface RealWind { windKn: number; gustKn: number; dir: Dir8; frontActive: boolean }

export function shiftDir(dir: Dir8, steps: number): Dir8 {
  const i = DIRS.indexOf(dir);
  return DIRS[(((i + steps) % 8) + 8) % 8]!;
}

/** Always consumes 2 draws so later rolls don't depend on whether a front happened. */
export function rollDayWeather(rng: number, template: WeatherTemplate, day: number, b: Balance): RngResult<DayWeather> {
  const d = template.days.find((x) => x.day === day);
  if (!d) throw new EngineError('CONTENT', `Weather template ${template.id} has no day ${day}`);
  const front = chance(rng, d.frontChance);
  const add = nextRange(front.next, b.weather.frontAddKn[0], b.weather.frontAddKn[1]);
  return {
    value: {
      day,
      forecastKn: d.windKn,
      forecastGustKn: d.gustKn,
      forecastDir: d.dir,
      barometerHpa: d.barometerHpa,
      front: front.value,
      frontAddKn: front.value ? round1(add.value) : 0,
      frontDir: front.value ? shiftDir(d.dir, b.weather.frontShiftSteps) : d.dir,
      barometerTrendHpa: front.value ? -b.weather.barometerDropHpa : 0,
      signalsVisible: false,
    },
    next: add.next,
  };
}

/** ТЗ 4.3: W_real = W_forecast × k_local + F_front. Fronts arrive in the afternoon. */
export function realWind(w: DayWeather, kLocal: number, hour: number, template: WeatherTemplate, b: Balance): RealWind {
  const afternoon = hour >= b.weather.afternoonFromHour;
  const diurnal = afternoon ? template.afternoonFactor : 1;
  const frontActive = w.front && afternoon;
  const add = frontActive ? w.frontAddKn : 0;
  return {
    windKn: round1(w.forecastKn * diurnal * kLocal + add),
    gustKn: round1(w.forecastGustKn * diurnal * kLocal + add),
    dir: frontActive ? w.frontDir : w.forecastDir,
    frontActive,
  };
}

export function signalsVisible(seaSenseLevel: number, barometerOpened: boolean, b: Balance): boolean {
  return barometerOpened || seaSenseLevel >= b.voices.seaSenseSignalLevel;
}

export function exposure(point: MapPoint, dir: Dir8): number {
  return 1 - point.shelter[dir];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/weather.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/weather.ts tests/engine/weather.test.ts
git commit -m "feat: add probabilistic weather model with fronts and local effects

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Паруса и переход (`sailing.ts`)

**Files:**
- Create: `src/engine/sailing.ts`
- Test: `tests/engine/sailing.test.ts`

**Interfaces:**
- Consumes: `round1`, `round2` (T1); типы `Balance`, `Dir8`, `DIRS`, `PointOfSail`.
- Produces:
  - `bearingDeg(from: {x:number;y:number}, to: {x:number;y:number}): number` (0 = N, 90 = E)
  - `dirToDeg(d: Dir8): number`
  - `pointOfSail(courseDeg: number, windFromDeg: number): PointOfSail` (<60° upwind, <120° reach, иначе run)
  - `reefThresholdKn(reefs: 0|1|2, genoa: 'full'|'partial', b): number`
  - `breakChance(windKn, reefs, genoa, b): number`
  - `sailSpeedKn(i: { windKn; pos; reefs; genoa; hullSpeedKn }, b): number`
  - `motorSpeedKn(motorKn: number, windKn: number, pos: PointOfSail, b): number`
  - `interface LegInput { mode: 'motor'|'sail'; windKn; windFromDeg; courseDeg; reefs: 0|1|2; genoa: 'full'|'partial'; course: 'direct'|'detour'; distanceNm; hullSpeedKn; motorKn }`
  - `interface LegResult { pos: PointOfSail; distanceNm: number; speedKn: number; hours: number; overpowered: boolean; breakChance: number; forcedReef: boolean }`
  - `planLeg(i: LegInput, b): LegResult`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { bearingDeg, breakChance, dirToDeg, motorSpeedKn, planLeg, pointOfSail, reefThresholdKn, sailSpeedKn } from '../../src/engine/sailing';
import { makeContent } from '../fixtures/content';

const b = makeContent().balance;

describe('sailing', () => {
  it('bearing and directions', () => {
    expect(bearingDeg({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(0);
    expect(bearingDeg({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90);
    expect(bearingDeg({ x: 0, y: 0 }, { x: -10, y: 0 })).toBeCloseTo(270);
    expect(dirToDeg('NW')).toBe(315);
  });

  it('pointOfSail by angle between course and wind source', () => {
    expect(pointOfSail(0, 315)).toBe('upwind');
    expect(pointOfSail(90, 0)).toBe('reach');
    expect(pointOfSail(180, 0)).toBe('run');
  });

  it('reef thresholds from ТЗ 4.4 (16/22/28) + partial genoa bonus', () => {
    expect(reefThresholdKn(0, 'full', b)).toBe(16);
    expect(reefThresholdKn(1, 'full', b)).toBe(22);
    expect(reefThresholdKn(2, 'full', b)).toBe(28);
    expect(reefThresholdKn(0, 'partial', b)).toBe(19);
  });

  it('break chance grows per knot over threshold, capped', () => {
    expect(breakChance(15, 0, 'full', b)).toBe(0);
    expect(breakChance(20, 0, 'full', b)).toBeCloseTo(0.12);
    expect(breakChance(20, 0, 'partial', b)).toBeCloseTo(0.03);
    expect(breakChance(60, 0, 'full', b)).toBe(0.6);
  });

  it('sail speed depends on wind, point of sail, area, overpowering', () => {
    expect(sailSpeedKn({ windKn: 12, pos: 'reach', reefs: 0, genoa: 'full', hullSpeedKn: 7.5 }, b)).toBe(6.4);
    expect(sailSpeedKn({ windKn: 12, pos: 'upwind', reefs: 0, genoa: 'full', hullSpeedKn: 7.5 }, b)).toBe(4.1);
    expect(sailSpeedKn({ windKn: 12, pos: 'reach', reefs: 1, genoa: 'full', hullSpeedKn: 7.5 }, b)).toBe(5.4);
    expect(sailSpeedKn({ windKn: 20, pos: 'reach', reefs: 0, genoa: 'full', hullSpeedKn: 7.5 }, b)).toBe(5.1);
    expect(sailSpeedKn({ windKn: 3, pos: 'reach', reefs: 0, genoa: 'full', hullSpeedKn: 7.5 }, b)).toBe(1.1);
  });

  it('motor speed drops upwind in strong wind', () => {
    expect(motorSpeedKn(6.5, 10, 'upwind', b)).toBe(6.5);
    expect(motorSpeedKn(6.5, 22, 'upwind', b)).toBe(4.9);
    expect(motorSpeedKn(6.5, 22, 'run', b)).toBe(6.5);
  });

  const leg = { mode: 'sail' as const, windKn: 12, windFromDeg: 0, courseDeg: 0, reefs: 0 as const, genoa: 'full' as const, course: 'direct' as const, distanceNm: 10, hullSpeedKn: 7.5, motorKn: 6.5 };

  it('planLeg direct upwind vs detour (reach, longer)', () => {
    const direct = planLeg(leg, b);
    expect(direct).toMatchObject({ pos: 'upwind', distanceNm: 10, speedKn: 4.1, hours: 2.44, overpowered: false, breakChance: 0, forcedReef: false });
    const detour = planLeg({ ...leg, course: 'detour' }, b);
    expect(detour).toMatchObject({ pos: 'reach', distanceNm: 13, speedKn: 6.4, hours: 2.03 });
  });

  it('planLeg flags overpowering and forced reef', () => {
    const r = planLeg({ ...leg, windKn: 21, windFromDeg: 90 }, b);
    expect(r.overpowered).toBe(true);
    expect(r.forcedReef).toBe(true);
    expect(planLeg({ ...leg, windKn: 18, windFromDeg: 90 }, b).forcedReef).toBe(false);
  });

  it('planLeg motor ignores sails and detour', () => {
    const r = planLeg({ ...leg, mode: 'motor', course: 'detour', windKn: 25 }, b);
    expect(r).toMatchObject({ distanceNm: 10, speedKn: 4.9, overpowered: false, breakChance: 0, forcedReef: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/sailing.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
import { round1, round2 } from './state';
import { DIRS, type Balance, type Dir8, type PointOfSail } from './types';

type Reefs = 0 | 1 | 2;
type Genoa = 'full' | 'partial';

export interface LegInput {
  mode: 'motor' | 'sail';
  windKn: number;
  windFromDeg: number;
  courseDeg: number;
  reefs: Reefs;
  genoa: Genoa;
  course: 'direct' | 'detour';
  distanceNm: number;
  hullSpeedKn: number;
  motorKn: number;
}

export interface LegResult {
  pos: PointOfSail;
  distanceNm: number;
  speedKn: number;
  hours: number;
  overpowered: boolean;
  breakChance: number;
  forcedReef: boolean;
}

export function bearingDeg(from: { x: number; y: number }, to: { x: number; y: number }): number {
  const deg = (Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export const dirToDeg = (d: Dir8): number => DIRS.indexOf(d) * 45;

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function pointOfSail(courseDeg: number, windFromDeg: number): PointOfSail {
  const a = angleDiff(courseDeg, windFromDeg);
  if (a < 60) return 'upwind';
  return a < 120 ? 'reach' : 'run';
}

export function reefThresholdKn(reefs: Reefs, genoa: Genoa, b: Balance): number {
  return b.sails.reefThresholdKn[reefs] + (genoa === 'partial' ? b.sails.partialGenoaBonusKn : 0);
}

export function breakChance(windKn: number, reefs: Reefs, genoa: Genoa, b: Balance): number {
  const over = windKn - reefThresholdKn(reefs, genoa, b);
  return over <= 0 ? 0 : Math.min(b.sails.breakChanceMax, over * b.sails.breakChancePerKnOver);
}

export function sailSpeedKn(i: { windKn: number; pos: PointOfSail; reefs: Reefs; genoa: Genoa; hullSpeedKn: number }, b: Balance): number {
  if (i.windKn < b.sails.minSailWindKn) return round1(i.hullSpeedKn * b.sails.drifterFactor);
  const power = Math.min(1, i.windKn / b.sails.fullPowerWindKn);
  const area = b.sails.reefFactor[i.reefs] * (i.genoa === 'partial' ? b.sails.partialGenoaFactor : 1);
  const overpowered = i.windKn > reefThresholdKn(i.reefs, i.genoa, b);
  const penalty = overpowered ? b.sails.overpowerSpeedFactor : 1;
  return round1(i.hullSpeedKn * power * b.sails.posFactor[i.pos] * area * penalty);
}

export function motorSpeedKn(motorKn: number, windKn: number, pos: PointOfSail, b: Balance): number {
  const slowed = pos === 'upwind' && windKn >= b.sails.motorUpwindPenaltyWindKn;
  return round1(motorKn * (slowed ? b.sails.motorUpwindFactor : 1));
}

export function planLeg(i: LegInput, b: Balance): LegResult {
  const directPos = pointOfSail(i.courseDeg, i.windFromDeg);
  if (i.mode === 'motor') {
    const speedKn = motorSpeedKn(i.motorKn, i.windKn, directPos, b);
    return { pos: directPos, distanceNm: i.distanceNm, speedKn, hours: round2(i.distanceNm / speedKn), overpowered: false, breakChance: 0, forcedReef: false };
  }
  const detour = i.course === 'detour';
  const pos: PointOfSail = detour && directPos === 'upwind' ? 'reach' : directPos;
  const distanceNm = round1(i.distanceNm * (detour ? b.sails.detourDistanceFactor : 1));
  const threshold = reefThresholdKn(i.reefs, i.genoa, b);
  const speedKn = sailSpeedKn({ windKn: i.windKn, pos, reefs: i.reefs, genoa: i.genoa, hullSpeedKn: i.hullSpeedKn }, b);
  return {
    pos,
    distanceNm,
    speedKn,
    hours: round2(distanceNm / speedKn),
    overpowered: i.windKn > threshold,
    breakChance: breakChance(i.windKn, i.reefs, i.genoa, b),
    forcedReef: i.windKn > threshold + b.sails.forcedReefMarginKn,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/sailing.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/sailing.ts tests/engine/sailing.test.ts
git commit -m "feat: add decision-level sailing model (speed, reefs, break risk)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Бюджет времени (`time.ts`)

**Files:**
- Create: `src/engine/time.ts`
- Test: `tests/engine/time.test.ts`

**Interfaces:**
- Consumes: `chance`, `nextRange`, `RngResult`; `clamp`; типы `Balance`, `Seabed`.
- Produces:
  - `anchorFailChance(seabed: Seabed, windKn: number, briefed: boolean, b): number`
  - `anchoring(rng, i: { seabed: Seabed; windKn: number; briefed: boolean }, b): RngResult<{ attempts: number; minutes: number; held: boolean }>`
  - `marinaArrival(rng, i: { arrivalHour: number; placesGoneHour: number | null }, b): RngResult<{ refused: boolean; waitMin: number }>` — всегда 1 бросок
  - `restHours(clockMin: number, b): number` — часы до заката, не больше `mood.restCapHours`
  - `formatClock(clockMin: number): string` (`"09:05"`)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { anchorFailChance, anchoring, formatClock, marinaArrival, restHours } from '../../src/engine/time';
import { makeContent } from '../fixtures/content';

const b = makeContent().balance;

describe('time budget', () => {
  it('anchor fail chance: seabed, wind, briefing (ТЗ 4.5: 20–40%)', () => {
    expect(anchorFailChance('sand', 10, false, b)).toBeCloseTo(0.2);
    expect(anchorFailChance('rock', 10, false, b)).toBeCloseTo(0.4);
    expect(anchorFailChance('rock', 20, false, b)).toBeCloseTo(0.5);
    expect(anchorFailChance('sand', 10, true, b)).toBeCloseTo(0.1);
  });

  it('anchoring: attempts 1..3, minutes within 30..60 per attempt', () => {
    let s = 5;
    for (let i = 0; i < 300; i++) {
      const r = anchoring(s, { seabed: 'weed', windKn: 15, briefed: false }, b);
      expect(r.value.attempts).toBeGreaterThanOrEqual(1);
      expect(r.value.attempts).toBeLessThanOrEqual(3);
      expect(r.value.minutes).toBeGreaterThanOrEqual(30 * r.value.attempts);
      expect(r.value.minutes).toBeLessThanOrEqual(60 * r.value.attempts);
      if (!r.value.held) expect(r.value.attempts).toBe(3);
      s = r.next;
    }
  });

  it('bad seabed + wind needs more attempts than briefed sand', () => {
    const mean = (seabed: 'sand' | 'rock', windKn: number, briefed: boolean): number => {
      let s = 11;
      let total = 0;
      for (let i = 0; i < 1000; i++) {
        const r = anchoring(s, { seabed, windKn, briefed }, b);
        total += r.value.attempts;
        s = r.next;
      }
      return total / 1000;
    };
    expect(mean('rock', 20, false)).toBeGreaterThan(mean('sand', 10, true) + 0.3);
  });

  it('marina: late arrival → ~55% refusal and a wait; early → never refused', () => {
    let s = 3;
    let refused = 0;
    for (let i = 0; i < 2000; i++) {
      const r = marinaArrival(s, { arrivalHour: 16, placesGoneHour: 15 }, b);
      if (r.value.refused) refused++;
      expect(r.value.waitMin).toBe(45);
      s = r.next;
    }
    expect(refused / 2000).toBeGreaterThan(0.5);
    expect(refused / 2000).toBeLessThan(0.6);
    expect(marinaArrival(1, { arrivalHour: 14, placesGoneHour: 15 }, b).value).toEqual({ refused: false, waitMin: 0 });
    expect(marinaArrival(1, { arrivalHour: 19, placesGoneHour: null }, b).value.refused).toBe(false);
  });

  it('restHours until sunset, capped', () => {
    expect(restHours(17 * 60, b)).toBe(3);
    expect(restHours(13 * 60, b)).toBe(5);
    expect(restHours(21 * 60, b)).toBe(0);
  });

  it('formatClock', () => {
    expect(formatClock(9 * 60 + 5)).toBe('09:05');
    expect(formatClock(17 * 60 + 45)).toBe('17:45');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/time.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
import { chance, nextRange, type RngResult } from './rng';
import { clamp } from './state';
import type { Balance, Seabed } from './types';

export function anchorFailChance(seabed: Seabed, windKn: number, briefed: boolean, b: Balance): number {
  const [lo, hi] = b.time.anchorFailChance;
  const base = lo + (hi - lo) * b.time.seabedFailFactor[seabed];
  const wind = windKn >= b.time.anchorWindPenaltyKn ? b.time.anchorWindPenalty : 0;
  const brief = briefed ? b.time.anchorBriefedReduction : 0;
  return clamp(base + wind - brief, 0, 0.95);
}

export function anchoring(
  rng: number,
  i: { seabed: Seabed; windKn: number; briefed: boolean },
  b: Balance,
): RngResult<{ attempts: number; minutes: number; held: boolean }> {
  const fail = anchorFailChance(i.seabed, i.windKn, i.briefed, b);
  let next = rng;
  let minutes = 0;
  for (let attempt = 1; attempt <= b.time.anchorMaxAttempts; attempt++) {
    const dur = nextRange(next, b.time.anchorMin[0], b.time.anchorMin[1]);
    const roll = chance(dur.next, fail);
    next = roll.next;
    minutes += dur.value;
    if (!roll.value) return { value: { attempts: attempt, minutes: Math.round(minutes), held: true }, next };
  }
  return { value: { attempts: b.time.anchorMaxAttempts, minutes: Math.round(minutes), held: false }, next };
}

export function marinaArrival(
  rng: number,
  i: { arrivalHour: number; placesGoneHour: number | null },
  b: Balance,
): RngResult<{ refused: boolean; waitMin: number }> {
  const late = i.placesGoneHour !== null && i.arrivalHour > i.placesGoneHour;
  const roll = chance(rng, late ? b.time.marinaLateRefusalChance : 0);
  return { value: { refused: roll.value, waitMin: late ? b.time.marinaWaitMin : 0 }, next: roll.next };
}

export function restHours(clockMin: number, b: Balance): number {
  return clamp(b.time.sunsetHour - clockMin / 60, 0, b.mood.restCapHours);
}

export function formatClock(clockMin: number): string {
  const h = Math.floor(clockMin / 60);
  const m = Math.round(clockMin % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/time.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/time.ts tests/engine/time.test.ts
git commit -m "feat: add time budget model (anchoring, marina refusal, rest)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ресурсы и применение эффектов (`resources.ts`)

**Files:**
- Create: `src/engine/resources.ts`
- Test: `tests/engine/resources.test.ts`

**Interfaces:**
- Consumes: `appendLog` (T1), `advanceClock`, `clamp`, `round1`; типы.
- Produces:
  - `clampResources(r: Resources, boat: Boat | null): Resources`
  - `applyOutcome(state: GameState, boat: Boat | null, o: Outcome): GameState` — единственная точка изменения ресурсов. Пишет `LogEntry { kind: 'effect', cause, pillar, delta, data }`. Обрабатывает `damage` (уникально), `repair`, `flag` → `flags['flag.<x>']`, `injury` → `injuries + 1`, `time_hours` → часы, `mood_per_day`, `signal` → отдельный лог `{ kind: 'signal', cause: 'signal:<id>' }`. `promise` игнорирует (это делает T12). Общий банк: если `!boat.starterSeparate`, то `service_bank` применяется и к стартовому
  - `applyOutcomes(state, boat, outcomes: readonly Outcome[]): GameState`
  - `interface ConsumptionInput { crewSize: number; shower: ShowerDiscipline; boat: Boat; motorHours: number; sailHours: number; autopilotHours: number; shorePower: boolean; cookedDinner: boolean }`
  - `dailyConsumption(i: ConsumptionInput, b): Outcome[]` — вода, электрика (Ah → % от `serviceBankAh × serviceBanks`), стартовый (если раздельный и мотор > 0), газ. Топливо **не** входит (считается на ноге в T16)
  - `refillAt(state: GameState, boat: Boat, point: MapPoint, b): Outcome[]` — вода до полного, топливо до полного за деньги, газ при `< gas.exchangeBelowPct`
  - `zeroResourceOutcomes(state: GameState, b): Outcome[]` — `zero:water`, `zero:service`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { applyOutcome, applyOutcomes, clampResources, dailyConsumption, refillAt, zeroResourceOutcomes } from '../../src/engine/resources';
import { makeContent } from '../fixtures/content';
import { deepFreeze } from '../fixtures/freeze';
import { makeState } from '../fixtures/state';

const content = makeContent();
const b = content.balance;
const boat = content.boats[0]!;
const sharedBoat = { ...boat, starterSeparate: false };

describe('resources', () => {
  it('clampResources keeps values in physical bounds', () => {
    const r = clampResources({ waterL: 999, fuelL: -5, serviceBankPct: 140, starterBankPct: -1, gasPct: 50, moneyEur: -20, mood: 120, fatigue: -3 }, boat);
    expect(r).toEqual({ waterL: 300, fuelL: 0, serviceBankPct: 100, starterBankPct: 0, gasPct: 50, moneyEur: -20, mood: 100, fatigue: 0 });
  });

  it('applyOutcome changes resources, logs delta, does not mutate', () => {
    const s = deepFreeze(makeState());
    const next = applyOutcome(s, boat, { cause: 'event:toilet_clog:call_base', pillar: 'boat', effect: { money: -80, time_hours: 4 } });
    expect(next.resources.moneyEur).toBe(1420);
    expect(next.clockMin).toBe(s.clockMin + 240);
    expect(next.log.at(-1)).toMatchObject({ kind: 'effect', cause: 'event:toilet_clog:call_base', pillar: 'boat', delta: { moneyEur: -80 }, data: { time_hours: 4 } });
    expect(s.resources.moneyEur).toBe(1500);
  });

  it('delta reflects clamping (no negative fuel)', () => {
    const s = makeState({ resources: { ...makeState().resources, fuelL: 2 } });
    const next = applyOutcome(s, boat, { cause: 'consumption:fuel', effect: { fuel: -13.5 } });
    expect(next.resources.fuelL).toBe(0);
    expect(next.log.at(-1)!.delta).toEqual({ fuelL: -2 });
  });

  it('damage, repair, flag, injury, mood_per_day, signal', () => {
    let s = makeState();
    s = applyOutcome(s, boat, { cause: 'sail:break', effect: { damage: 'sail_torn' } });
    s = applyOutcome(s, boat, { cause: 'sail:break', effect: { damage: 'sail_torn' } });
    expect(s.damages).toEqual(['sail_torn']);
    s = applyOutcome(s, boat, { cause: 'repair', effect: { repair: 'sail_torn' } });
    expect(s.damages).toEqual([]);
    s = applyOutcome(s, boat, { cause: 'x', effect: { flag: 'warned', injury: true, mood_per_day: -8 } });
    expect(s.flags['flag.warned']).toBe(true);
    expect(s.injuries).toBe(1);
    expect(s.moodPerDay).toBe(-8);
    s = applyOutcome(s, boat, { cause: 'event:local_warning:listen', pillar: 'weather', effect: { signal: 'local_warning' } });
    expect(s.log.at(-1)).toMatchObject({ kind: 'signal', cause: 'signal:local_warning', pillar: 'weather' });
  });

  it('shared bank: service drain also drains the starter', () => {
    const s = makeState();
    expect(applyOutcome(s, boat, { cause: 'c', effect: { service_bank: -30 } }).resources.starterBankPct).toBe(100);
    expect(applyOutcome(s, sharedBoat, { cause: 'c', effect: { service_bank: -30 } }).resources.starterBankPct).toBe(70);
  });

  it('applyOutcomes folds in order', () => {
    const s = applyOutcomes(makeState(), boat, [{ cause: 'a', effect: { mood: -10 } }, { cause: 'b', effect: { mood: 5 } }]);
    expect(s.resources.mood).toBe(65);
    expect(s.log).toHaveLength(2);
  });

  it('dailyConsumption: water by discipline, electric Ah→%, starter charge, gas', () => {
    const out = dailyConsumption({ crewSize: 4, shower: 'normal', boat, motorHours: 2, sailHours: 0, autopilotHours: 0, shorePower: false, cookedDinner: true }, b);
    const by = Object.fromEntries(out.map((o) => [o.cause, o.effect]));
    expect(by['consumption:water']).toEqual({ water: -100 });
    expect(by['consumption:electric']).toEqual({ service_bank: -3.6 });
    expect(by['charge:starter']).toEqual({ starter_bank: 100 });
    expect(by['consumption:gas']).toEqual({ gas: -9 });
  });

  it('dailyConsumption: loose showers and autopilot drain more; shore power refills', () => {
    const loose = dailyConsumption({ crewSize: 4, shower: 'loose', boat, motorHours: 0, sailHours: 6, autopilotHours: 6, shorePower: false, cookedDinner: false }, b);
    const by = Object.fromEntries(loose.map((o) => [o.cause, o.effect]));
    expect(by['consumption:water']).toEqual({ water: -160 });
    // draw = 45 fridge + 10 pumps + 6h×1.5 plotter + 6h×4 autopilot = 88 Ah of 220 Ah → −40%
    expect(by['consumption:electric']!.service_bank).toBeCloseTo(-40, 1);
    expect(by['charge:starter']).toBeUndefined();
    expect(by['consumption:gas']).toBeUndefined();
    const shore = dailyConsumption({ crewSize: 4, shower: 'strict', boat, motorHours: 0, sailHours: 0, autopilotHours: 0, shorePower: true, cookedDinner: false }, b);
    expect(shore.find((o) => o.cause === 'charge:shore')!.effect).toEqual({ service_bank: 100 });
  });

  it('refillAt marina: water free, fuel paid, gas exchanged when low', () => {
    const s = makeState({ resources: { ...makeState().resources, waterL: 100, fuelL: 140, gasPct: 20 } });
    const marina = content.map.find((p) => p.id === 'marina_b')!;
    const out = refillAt(s, boat, marina, b);
    expect(out).toEqual([
      { cause: 'refill:water', pillar: 'boat', effect: { water: 200 } },
      { cause: 'refill:fuel', pillar: 'boat', effect: { fuel: 10, money: -19 } },
      { cause: 'refill:gas', pillar: 'boat', effect: { gas: 80, money: -30 } },
    ]);
    expect(refillAt(s, boat, content.map.find((p) => p.id === 'bay_a')!, b)).toEqual([]);
  });

  it('zeroResourceOutcomes penalises empty water and service bank', () => {
    const s = makeState({ resources: { ...makeState().resources, waterL: 0, serviceBankPct: 0 } });
    expect(zeroResourceOutcomes(s, b)).toEqual([
      { cause: 'zero:water', pillar: 'boat', effect: { mood: -25 } },
      { cause: 'zero:service', pillar: 'boat', effect: { mood: -15 } },
    ]);
    expect(zeroResourceOutcomes(makeState(), b)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/resources.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
import { appendLog } from './log';
import { advanceClock, clamp, round1 } from './state';
import type { Balance, Boat, Effect, GameState, MapPoint, Outcome, Resources, ShowerDiscipline } from './types';

const EFFECT_TO_RESOURCE = {
  mood: 'mood',
  fatigue: 'fatigue',
  money: 'moneyEur',
  water: 'waterL',
  fuel: 'fuelL',
  service_bank: 'serviceBankPct',
  starter_bank: 'starterBankPct',
  gas: 'gasPct',
} as const satisfies Partial<Record<keyof Effect, keyof Resources>>;

type ResourceEffectKey = keyof typeof EFFECT_TO_RESOURCE;

export function clampResources(r: Resources, boat: Boat | null): Resources {
  const pct = (v: number): number => clamp(v, 0, 100);
  return {
    waterL: clamp(r.waterL, 0, boat?.waterTankL ?? Infinity),
    fuelL: clamp(r.fuelL, 0, boat?.fuelTankL ?? Infinity),
    serviceBankPct: pct(r.serviceBankPct),
    starterBankPct: pct(r.starterBankPct),
    gasPct: pct(r.gasPct),
    moneyEur: r.moneyEur,
    mood: pct(r.mood),
    fatigue: pct(r.fatigue),
  };
}

function rawResources(before: Resources, e: Effect, boat: Boat | null): Resources {
  const raw = { ...before };
  for (const key of Object.keys(EFFECT_TO_RESOURCE) as ResourceEffectKey[]) {
    const v = e[key];
    if (v) raw[EFFECT_TO_RESOURCE[key]] += v;
  }
  if (boat && !boat.starterSeparate && e.service_bank && !e.starter_bank) raw.starterBankPct += e.service_bank;
  return raw;
}

function diff(before: Resources, after: Resources): Partial<Record<keyof Resources, number>> {
  const delta: Partial<Record<keyof Resources, number>> = {};
  for (const k of Object.keys(before) as (keyof Resources)[]) {
    const d = round1(after[k] - before[k]);
    if (d !== 0) delta[k] = d;
  }
  return delta;
}

function effectData(e: Effect): Record<string, string | number | boolean> | undefined {
  const data: Record<string, string | number | boolean> = {};
  if (e.damage) data.damage = e.damage;
  if (e.repair) data.repair = e.repair;
  if (e.flag) data.flag = e.flag;
  if (e.injury) data.injury = true;
  if (e.time_hours) data.time_hours = e.time_hours;
  if (e.mood_per_day) data.mood_per_day = e.mood_per_day;
  return Object.keys(data).length ? data : undefined;
}

export function applyOutcome(state: GameState, boat: Boat | null, o: Outcome): GameState {
  const e = o.effect;
  const resources = clampResources(rawResources(state.resources, e, boat), boat);
  const damages = e.damage && !state.damages.includes(e.damage) ? [...state.damages, e.damage] : state.damages;
  let s: GameState = {
    ...state,
    resources,
    damages: e.repair ? damages.filter((d) => d !== e.repair) : damages,
    flags: e.flag ? { ...state.flags, [`flag.${e.flag}`]: true } : state.flags,
    injuries: state.injuries + (e.injury ? 1 : 0),
    moodPerDay: state.moodPerDay + (e.mood_per_day ?? 0),
  };
  if (e.time_hours) s = advanceClock(s, e.time_hours * 60);
  const delta = diff(state.resources, resources);
  const data = effectData(e);
  s = appendLog(s, {
    kind: 'effect',
    cause: o.cause,
    ...(o.pillar ? { pillar: o.pillar } : {}),
    ...(Object.keys(delta).length ? { delta } : {}),
    ...(data ? { data } : {}),
  });
  if (e.signal) s = appendLog(s, { kind: 'signal', cause: `signal:${e.signal}`, ...(o.pillar ? { pillar: o.pillar } : {}) });
  return s;
}

export function applyOutcomes(state: GameState, boat: Boat | null, outcomes: readonly Outcome[]): GameState {
  return outcomes.reduce((s, o) => applyOutcome(s, boat, o), state);
}

export interface ConsumptionInput {
  crewSize: number;
  shower: ShowerDiscipline;
  boat: Boat;
  motorHours: number;
  sailHours: number;
  autopilotHours: number;
  shorePower: boolean;
  cookedDinner: boolean;
}

export function dailyConsumption(i: ConsumptionInput, b: Balance): Outcome[] {
  const el = b.electric;
  const capacityAh = i.boat.serviceBankAh * i.boat.serviceBanks;
  const drawAh = el.fridgeAhPerDay + el.pumpsAhPerDay
    + (i.boat.electricToilet ? el.electricToiletAhPerDay : 0)
    + (i.motorHours + i.sailHours) * el.plotterAhPerHour
    + i.autopilotHours * el.autopilotAhPerHour;
  const chargeAh = i.motorHours * el.engineChargeAhPerHour + i.boat.solarW * el.solarAhPerWattDay;
  const out: Outcome[] = [
    { cause: 'consumption:water', pillar: 'boat', effect: { water: -i.crewSize * b.water.perPersonPerDayL[i.shower] } },
    i.shorePower
      ? { cause: 'charge:shore', pillar: 'boat', effect: { service_bank: 100 } }
      : { cause: 'consumption:electric', pillar: 'boat', effect: { service_bank: round1(((chargeAh - drawAh) / capacityAh) * 100) } },
  ];
  if (i.boat.starterSeparate && i.motorHours > 0) out.push({ cause: 'charge:starter', pillar: 'boat', effect: { starter_bank: 100 } });
  if (i.cookedDinner) out.push({ cause: 'consumption:gas', pillar: 'boat', effect: { gas: -b.gas.pctPerDay } });
  return out;
}

export function refillAt(state: GameState, boat: Boat, point: MapPoint, b: Balance): Outcome[] {
  const r = state.resources;
  const out: Outcome[] = [];
  const water = boat.waterTankL - r.waterL;
  if (point.services.water && water > 0) out.push({ cause: 'refill:water', pillar: 'boat', effect: { water } });
  const fuel = round1(boat.fuelTankL - r.fuelL);
  if (point.services.fuel && fuel > 0) out.push({ cause: 'refill:fuel', pillar: 'boat', effect: { fuel, money: -round1(fuel * b.fuel.priceEurPerL) } });
  if (point.services.gas && r.gasPct < b.gas.exchangeBelowPct) out.push({ cause: 'refill:gas', pillar: 'boat', effect: { gas: 100 - r.gasPct, money: -b.gas.exchangeEur } });
  return out;
}

export function zeroResourceOutcomes(state: GameState, b: Balance): Outcome[] {
  const out: Outcome[] = [];
  if (state.resources.waterL <= 0) out.push({ cause: 'zero:water', pillar: 'boat', effect: { mood: -b.water.zeroMoodPenalty } });
  if (state.resources.serviceBankPct <= 0) out.push({ cause: 'zero:service', pillar: 'boat', effect: { mood: -b.electric.zeroServiceMoodPenalty } });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/resources.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/resources.ts tests/engine/resources.test.ts
git commit -m "feat: add resource model, outcome application and daily consumption

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: Механика обещаний (`promises.ts`)

**Files:**
- Create: `src/engine/promises.ts`
- Test: `tests/engine/promises.test.ts`

**Interfaces:**
- Consumes: `round1`, `requireDialogue` (T1), `appendLog`, `EngineError`; типы `Balance`, `Content`, `DayFacts`, `Dialogue`, `DialogueContext`, `Expectation`, `GameState`, `Outcome`.
- Produces:
  - `createExpectation(d: Dialogue, context: DialogueContext, createdDay: number): Expectation | null` — `kind: 'none'` → `null`; `dueDay = context === 'morning' ? createdDay : createdDay + 1`; `id = '<dialogueId>@<createdDay>'`
  - `judgeExpectation(e: Expectation, facts: DayFacts): 'kept' | 'broken'`
  - `expectationMoodDelta(strength: number, status: 'kept' | 'broken', diplomatLevel: number, sensitivity: number, b): number` — ТЗ 4.7: `+s×5×sens` / `−s×15×sens×max(0, 1 − diplomat×0.1)`
  - `crewSensitivity(state: GameState, content: Content): number` — среднее `promiseSensitivity` экипажа (1, если экипаж пуст)
  - `resolveDueExpectations(exps: readonly Expectation[], facts: DayFacts, diplomatLevel: number, sensitivity: number, b): { expectations: Expectation[]; outcomes: Outcome[] }` — обрабатывает только `status === 'open' && dueDay === facts.day`; outcome `promise:<dialogueId>:<status>`, pillar `promises`
  - `sayDialogue(state: GameState, content: Content, dialogueId: string, context: DialogueContext): GameState` — проверяет, что у диалога есть этот `context` (иначе `EngineError('INVALID_INPUT')`); логирует `dialogue:<id>` (decision, pillar `promises`); добавляет ожидание. Используют T12, T13, T16, T17

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createExpectation, crewSensitivity, expectationMoodDelta, judgeExpectation, resolveDueExpectations, sayDialogue } from '../../src/engine/promises';
import { deepFreeze } from '../fixtures/freeze';
import type { DayFacts } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

const content = makeContent();
const b = content.balance;
const dlg = (id: string) => content.dialogues.find((d) => d.id === id)!;
const facts = (over: Partial<DayFacts> = {}): DayFacts => ({
  day: 1, departureHour: 8, arrivalHour: 14, arrivalPointKind: 'bay', mooring: 'anchor', activities: [],
  motorHours: 2, sailHours: 0, autopilotHours: 0, shower: 'normal', ...over,
});

describe('promises', () => {
  it('createExpectation: what the crew heard, due next day unless said in the morning', () => {
    expect(createExpectation(dlg('early_try'), 'briefing', 0)).toEqual({
      id: 'early_try@0', dialogueId: 'early_try', spec: { kind: 'depart_by', hour: 8 }, strength: 0.9, createdDay: 0, dueDay: 1, status: 'open',
    });
    expect(createExpectation(dlg('early_try'), 'morning', 3)!.dueDay).toBe(3);
    expect(createExpectation(dlg('decide_morning'), 'evening', 2)).toBeNull();
  });

  it('judgeExpectation by kind', () => {
    const early = createExpectation(dlg('early_try'), 'briefing', 0)!;
    expect(judgeExpectation(early, facts({ departureHour: 8 }))).toBe('kept');
    expect(judgeExpectation(early, facts({ departureHour: 9.5 }))).toBe('broken');
    expect(judgeExpectation(early, facts({ departureHour: null }))).toBe('broken');
    const taverna = createExpectation(dlg('promise_taverna'), 'evening', 0)!;
    expect(judgeExpectation(taverna, facts({ activities: ['taverna'] }))).toBe('kept');
    expect(judgeExpectation(taverna, facts())).toBe('broken');
  });

  it('asymmetric mood: kept +s×5, broken −s×15, diplomat softens, sensitivity scales', () => {
    expect(expectationMoodDelta(0.9, 'kept', 0, 1, b)).toBe(4.5);
    expect(expectationMoodDelta(0.9, 'broken', 0, 1, b)).toBe(-13.5);
    expect(expectationMoodDelta(0.9, 'broken', 2, 1, b)).toBe(-10.8);
    expect(expectationMoodDelta(0.9, 'broken', 0, 1.2, b)).toBe(-16.2);
  });

  it('crewSensitivity averages archetypes', () => {
    expect(crewSensitivity(makeState(), content)).toBeCloseTo(1.0);
    expect(crewSensitivity(makeState({ crew: [] }), content)).toBe(1);
  });

  it('resolveDueExpectations only touches open expectations due today', () => {
    const due = createExpectation(dlg('early_try'), 'briefing', 0)!;
    const later = createExpectation(dlg('ten_bonus'), 'evening', 1)!;
    const r = resolveDueExpectations([due, later], facts({ day: 1, departureHour: 10 }), 0, 1, b);
    expect(r.expectations.map((e) => e.status)).toEqual(['broken', 'open']);
    expect(r.outcomes).toEqual([{ cause: 'promise:early_try:broken', pillar: 'promises', effect: { mood: -13.5 } }]);
  });

  it('sayDialogue logs the line and stores what the crew heard', () => {
    const s = deepFreeze(makeState({ day: 2 }));
    const next = sayDialogue(s, content, 'promise_taverna', 'evening');
    expect(next.expectations).toEqual([expect.objectContaining({ id: 'promise_taverna@2', dueDay: 3, status: 'open' })]);
    expect(next.log.at(-1)).toMatchObject({ kind: 'decision', cause: 'dialogue:promise_taverna', pillar: 'promises' });
    expect(sayDialogue(s, content, 'decide_morning', 'evening').expectations).toEqual([]);
    expect(() => sayDialogue(s, content, 'promise_taverna', 'briefing')).toThrow(/cannot be said during briefing/);
    expect(() => sayDialogue(s, content, 'ghost', 'evening')).toThrow(/not found/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/promises.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
import { EngineError } from './errors';
import { appendLog } from './log';
import { requireDialogue, round1 } from './state';
import type { Balance, Content, DayFacts, Dialogue, DialogueContext, Expectation, GameState, Outcome } from './types';

export function createExpectation(d: Dialogue, context: DialogueContext, createdDay: number): Expectation | null {
  if (d.expectation.kind === 'none') return null;
  return {
    id: `${d.id}@${createdDay}`,
    dialogueId: d.id,
    spec: d.expectation,
    strength: d.strength,
    createdDay,
    dueDay: context === 'morning' ? createdDay : createdDay + 1,
    status: 'open',
  };
}

export function judgeExpectation(e: Expectation, f: DayFacts): 'kept' | 'broken' {
  switch (e.spec.kind) {
    case 'depart_by':
      return f.departureHour !== null && f.departureHour <= e.spec.hour ? 'kept' : 'broken';
    case 'arrive_at_kind':
      return f.arrivalPointKind === e.spec.pointKind ? 'kept' : 'broken';
    case 'activity':
      return f.activities.includes(e.spec.activity) ? 'kept' : 'broken';
  }
}

export function expectationMoodDelta(strength: number, status: 'kept' | 'broken', diplomatLevel: number, sensitivity: number, b: Balance): number {
  const p = b.promises;
  if (status === 'kept') return round1(strength * p.keptPerStrength * sensitivity);
  const softening = Math.max(0, 1 - diplomatLevel * p.diplomatSofteningPerLevel);
  return round1(-strength * p.brokenPerStrength * sensitivity * softening);
}

export function crewSensitivity(state: GameState, content: Content): number {
  if (state.crew.length === 0) return 1;
  const total = state.crew.reduce((sum, m) => sum + (content.crew.find((a) => a.id === m.archetypeId)?.promiseSensitivity ?? 1), 0);
  return total / state.crew.length;
}

export function resolveDueExpectations(
  exps: readonly Expectation[],
  facts: DayFacts,
  diplomatLevel: number,
  sensitivity: number,
  b: Balance,
): { expectations: Expectation[]; outcomes: Outcome[] } {
  const outcomes: Outcome[] = [];
  const expectations = exps.map((e) => {
    if (e.status !== 'open' || e.dueDay !== facts.day) return e;
    const status = judgeExpectation(e, facts);
    outcomes.push({
      cause: `promise:${e.dialogueId}:${status}`,
      pillar: 'promises',
      effect: { mood: expectationMoodDelta(e.strength, status, diplomatLevel, sensitivity, b) },
    });
    return { ...e, status };
  });
  return { expectations, outcomes };
}

export function sayDialogue(state: GameState, content: Content, dialogueId: string, context: DialogueContext): GameState {
  const d = requireDialogue(content, dialogueId);
  if (!d.contexts.includes(context)) throw new EngineError('INVALID_INPUT', `Dialogue ${d.id} cannot be said during ${context}`);
  const s = appendLog(state, { kind: 'decision', cause: `dialogue:${d.id}`, pillar: 'promises', data: { strength: d.strength } });
  const e = createExpectation(d, context, state.day);
  return e ? { ...s, expectations: [...s.expectations, e] } : s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/promises.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/promises.ts tests/engine/promises.test.ts
git commit -m "feat: add crew expectation (promise) mechanics

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Внутренние голоса и проверки (`voices.ts`)

**Files:**
- Create: `src/engine/voices.ts`
- Test: `tests/engine/voices.test.ts`

**Interfaces:**
- Consumes: `chance`, `RngResult`; `EngineError`; `clamp`; типы `Balance`, `TRAINABLE_VOICES`, `TrainableVoice`, `VOICES`, `VoiceId`, `VoiceLine`.
- Produces:
  - `validateAllocation(alloc: Partial<Record<string, number>>, b): string[]` — пустой массив, если ок
  - `initialVoices(alloc: Partial<Record<TrainableVoice, number>>, b): Record<VoiceId, number>` — бросает `EngineError('INVALID_INPUT')`; pride = `b.voices.prideLevel`, crew_voice = `b.voices.crewVoiceLevel`
  - `checkChance(level: number, difficulty: number, fatigue: number, b): number` — `clamp(base + (level − difficulty)×perLevel − fatigue×penalty, min, max)`
  - `rollCheck(rng, level, difficulty, fatigue, b): RngResult<{ success: boolean; chance: number }>`
  - `audibleLines(lines: readonly VoiceLine[], voices: Record<VoiceId, number>): VoiceLine[]`
  - `resourceReadout(value: number, unit: string, approxStep: number, mechanicLevel: number, b): string` — Механик ≥ 2 видит точное число, иначе `~` с округлением до шага
  - `maneuverRiskFactor(voices: Record<VoiceId, number>, b): number` — `(1 − caution×cautionRisk) × (1 − order×orderRisk)`, не меньше 0
  - `cautionTimeFactor(cautionLevel: number, b): number` — `1 + caution×cautionTimePerLevel`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { audibleLines, cautionTimeFactor, checkChance, initialVoices, maneuverRiskFactor, resourceReadout, rollCheck, validateAllocation } from '../../src/engine/voices';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

const b = makeContent().balance;
const valid = { sea_sense: 2, caution: 2, order: 2, mechanic: 2, diplomat: 2, economist: 2 };

describe('voices', () => {
  it('allocation: 12 points across 6 trainable voices, 0..4 each', () => {
    expect(validateAllocation(valid, b)).toEqual([]);
    expect(validateAllocation({ ...valid, economist: 1 }, b)).toContainEqual(expect.stringMatching(/sum must be 12/));
    expect(validateAllocation({ ...valid, sea_sense: 5, economist: -1 }, b)).toContainEqual(expect.stringMatching(/sea_sense.*0\.\.4/));
    expect(validateAllocation({ ...valid, pride: 1, economist: 1 }, b)).toContainEqual(expect.stringMatching(/pride.*not trainable/));
    expect(validateAllocation({ ...valid, mechanic: 1.5, diplomat: 2.5 }, b)).toContainEqual(expect.stringMatching(/integer/));
  });

  it('initialVoices fills fixed voices and throws on invalid input', () => {
    expect(initialVoices({ sea_sense: 4, mechanic: 4, order: 4 }, b)).toEqual({
      sea_sense: 4, caution: 0, order: 4, mechanic: 4, diplomat: 0, economist: 0, pride: 2, crew_voice: 2,
    });
    expect(() => initialVoices({ sea_sense: 4 }, b)).toThrow(/sum must be 12/);
  });

  it('checkChance: level vs difficulty, fatigue, clamped', () => {
    expect(checkChance(2, 2, 0, b)).toBeCloseTo(0.5);
    expect(checkChance(4, 2, 0, b)).toBeCloseTo(0.8);
    expect(checkChance(1, 2, 0, b)).toBeCloseTo(0.35);
    expect(checkChance(4, 0, 0, b)).toBe(0.95);
    expect(checkChance(2, 2, 50, b)).toBeCloseTo(0.3);
    expect(checkChance(0, 4, 100, b)).toBe(0.05);
  });

  it('rollCheck is deterministic and reports chance', () => {
    expect(rollCheck(9, 2, 2, 0, b)).toEqual(rollCheck(9, 2, 2, 0, b));
    expect(rollCheck(9, 2, 2, 0, b).value.chance).toBeCloseTo(0.5);
  });

  it('audibleLines filters by voice level', () => {
    const lines = [
      { voice: 'mechanic' as const, min_level: 2, text: { ru: 'a', en: 'a' } },
      { voice: 'sea_sense' as const, min_level: 3, text: { ru: 'b', en: 'b' } },
      { voice: 'pride' as const, min_level: 1, text: { ru: 'c', en: 'c' } },
    ];
    expect(audibleLines(lines, makeState().voices).map((l) => l.text.ru)).toEqual(['a', 'c']);
  });

  it('resourceReadout: mechanic sees exact numbers', () => {
    expect(resourceReadout(37.4, '%', 25, 2, b)).toBe('37%');
    expect(resourceReadout(37.4, '%', 25, 1, b)).toBe('~25%');
    expect(resourceReadout(180, ' L', 50, 0, b)).toBe('~200 L');
  });

  it('risk and time factors from caution/order', () => {
    expect(maneuverRiskFactor({ ...makeState().voices, caution: 0, order: 0 }, b)).toBe(1);
    expect(maneuverRiskFactor({ ...makeState().voices, caution: 4, order: 4 }, b)).toBeCloseTo(0.408);
    expect(cautionTimeFactor(4, b)).toBeCloseTo(1.2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/voices.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
import { EngineError } from './errors';
import { chance, type RngResult } from './rng';
import { clamp } from './state';
import { TRAINABLE_VOICES, type Balance, type TrainableVoice, type VoiceId, type VoiceLine } from './types';

export function validateAllocation(alloc: Partial<Record<string, number>>, b: Balance): string[] {
  const errors: string[] = [];
  let sum = 0;
  for (const [voice, level] of Object.entries(alloc)) {
    if (!(TRAINABLE_VOICES as readonly string[]).includes(voice)) { errors.push(`${voice} is not trainable`); continue; }
    if (level === undefined || !Number.isInteger(level)) { errors.push(`${voice} must be an integer`); continue; }
    if (level < 0 || level > b.voices.maxLevel) errors.push(`${voice} must be in 0..${b.voices.maxLevel}`);
    sum += level;
  }
  if (sum !== b.voices.points) errors.push(`sum must be ${b.voices.points}, got ${sum}`);
  return errors;
}

export function initialVoices(alloc: Partial<Record<TrainableVoice, number>>, b: Balance): Record<VoiceId, number> {
  const errors = validateAllocation(alloc, b);
  if (errors.length) throw new EngineError('INVALID_INPUT', `Invalid voice allocation: ${errors.join('; ')}`);
  return {
    sea_sense: alloc.sea_sense ?? 0,
    caution: alloc.caution ?? 0,
    order: alloc.order ?? 0,
    mechanic: alloc.mechanic ?? 0,
    diplomat: alloc.diplomat ?? 0,
    economist: alloc.economist ?? 0,
    pride: b.voices.prideLevel,
    crew_voice: b.voices.crewVoiceLevel,
  };
}

export function checkChance(level: number, difficulty: number, fatigue: number, b: Balance): number {
  const raw = b.checks.base + (level - difficulty) * b.checks.perLevel - fatigue * b.fatigue.checkPenaltyPerPoint;
  return clamp(raw, b.checks.min, b.checks.max);
}

export function rollCheck(rng: number, level: number, difficulty: number, fatigue: number, b: Balance): RngResult<{ success: boolean; chance: number }> {
  const p = checkChance(level, difficulty, fatigue, b);
  const r = chance(rng, p);
  return { value: { success: r.value, chance: p }, next: r.next };
}

export function audibleLines(lines: readonly VoiceLine[], voices: Record<VoiceId, number>): VoiceLine[] {
  return lines.filter((l) => voices[l.voice] >= l.min_level);
}

export function resourceReadout(value: number, unit: string, approxStep: number, mechanicLevel: number, b: Balance): string {
  if (mechanicLevel >= b.voices.mechanicExactLevel) return `${Math.round(value)}${unit}`;
  return `~${Math.round(value / approxStep) * approxStep}${unit}`;
}

export function maneuverRiskFactor(voices: Record<VoiceId, number>, b: Balance): number {
  const caution = 1 - voices.caution * b.voices.cautionRiskPerLevel;
  const order = 1 - voices.order * b.voices.orderRiskPerLevel;
  return Math.max(0, caution * order);
}

export function cautionTimeFactor(cautionLevel: number, b: Balance): number {
  return 1 + cautionLevel * b.voices.cautionTimePerLevel;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/voices.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/voices.ts tests/engine/voices.test.ts
git commit -m "feat: add inner voices, skill checks and readout precision

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Эпизоды манёвров (`maneuver.ts`)

**Files:**
- Create: `src/engine/maneuver.ts`
- Test: `tests/engine/maneuver.test.ts`

**Interfaces:**
- Consumes: `chance`, `RngResult`; `EngineError`; `round1`; типы `Balance`, `Content`, `Effect`, `Maneuver`, `ManeuverKind`, `Outcome`.
- Produces:
  - `maneuverForKind(content: Content, kind: ManeuverKind): Maneuver | null`
  - `correctOrder(m: Maneuver): string[]`
  - `validateOrder(m: Maneuver, order: readonly string[]): string | null` — нужна перестановка всех step id
  - `scaleEffect(e: Effect, factor: number): Effect` — масштабирует числовые поля
  - `evaluateManeuver(rng, m: Maneuver, order: readonly string[], flags: Record<string, boolean>, riskFactor: number, b): RngResult<{ errors: string[]; outcomes: Outcome[] }>` — на каждую ошибку outcome `maneuver:<mId>:<errId>` (pillar `safety`); бросок травмы `injuryChance × riskFactor × (mitigated ? mitigationFactor : 1)` → outcome `injury:maneuver:<mId>:<errId>` `{ injury: true, mood: -b.mood.injury }`. На каждую ошибку ровно 1 бросок

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { correctOrder, evaluateManeuver, maneuverForKind, scaleEffect, validateOrder } from '../../src/engine/maneuver';
import { makeContent } from '../fixtures/content';

const content = makeContent();
const b = content.balance;
const m = maneuverForKind(content, 'departure')!;
const wrong = ['release_lines', 'neutral', 'command_helm', 'engage_gear'];

describe('maneuver', () => {
  it('finds maneuver by kind', () => {
    expect(m.id).toBe('dep_test');
    expect(maneuverForKind(content, 'anchoring')!.id).toBe('anchoring_test');
    expect(correctOrder(m)).toEqual(['neutral', 'command_helm', 'release_lines', 'engage_gear']);
  });

  it('validateOrder requires a permutation of all steps', () => {
    expect(validateOrder(m, correctOrder(m))).toBeNull();
    expect(validateOrder(m, ['neutral'])).toMatch(/4 steps/);
    expect(validateOrder(m, ['neutral', 'neutral', 'command_helm', 'engage_gear'])).toMatch(/duplicate|missing/);
    expect(validateOrder(m, ['neutral', 'command_helm', 'release_lines', 'jump'])).toMatch(/unknown step "jump"/);
  });

  it('correct order → no errors, no outcomes', () => {
    const r = evaluateManeuver(1, m, correctOrder(m), {}, 1, b);
    expect(r.value).toEqual({ errors: [], outcomes: [] });
  });

  it('wrong order → every violated rule fires', () => {
    const r = evaluateManeuver(1, m, wrong, {}, 0, b);
    expect(r.value.errors).toEqual(['release_before_neutral', 'release_before_command']);
    expect(r.value.outcomes).toEqual([
      { cause: 'maneuver:dep_test:release_before_neutral', pillar: 'safety', effect: { damage: 'prop_line', mood: -5 } },
      { cause: 'maneuver:dep_test:release_before_command', pillar: 'safety', effect: { mood: -6, fatigue: 6 } },
    ]);
  });

  it('injury roll scales with risk factor; briefing mitigates', () => {
    const forced = evaluateManeuver(1, m, wrong, {}, 5, b);
    expect(forced.value.outcomes).toContainEqual({ cause: 'injury:maneuver:dep_test:release_before_command', pillar: 'safety', effect: { injury: true, mood: -30 } });
    const mitigated = evaluateManeuver(1, m, wrong, { 'briefing.loaded_lines': true }, 0, b);
    expect(mitigated.value.outcomes[1]!.effect).toEqual({ mood: -3, fatigue: 3 });
  });

  it('throws on invalid order', () => {
    expect(() => evaluateManeuver(1, m, ['neutral'], {}, 1, b)).toThrow(/INVALID|4 steps/);
  });

  it('scaleEffect keeps non-numeric fields', () => {
    expect(scaleEffect({ mood: -6, damage: 'prop_line', injury: true }, 0.5)).toEqual({ mood: -3, damage: 'prop_line', injury: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/maneuver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
import { EngineError } from './errors';
import { chance, type RngResult } from './rng';
import { round1 } from './state';
import type { Balance, Content, Effect, Maneuver, ManeuverKind, Outcome } from './types';

const NUMERIC_EFFECT_KEYS = ['mood', 'fatigue', 'money', 'water', 'fuel', 'service_bank', 'starter_bank', 'gas', 'time_hours', 'mood_per_day'] as const;

export function maneuverForKind(content: Content, kind: ManeuverKind): Maneuver | null {
  return content.maneuvers.find((m) => m.kind === kind) ?? null;
}

export const correctOrder = (m: Maneuver): string[] => m.steps.map((s) => s.id);

export function validateOrder(m: Maneuver, order: readonly string[]): string | null {
  if (order.length !== m.steps.length) return `Maneuver ${m.id} needs ${m.steps.length} steps, got ${order.length}`;
  const ids = new Set(correctOrder(m));
  const unknown = order.find((id) => !ids.has(id));
  if (unknown) return `Maneuver ${m.id}: unknown step "${unknown}"`;
  if (new Set(order).size !== order.length) return `Maneuver ${m.id}: duplicate or missing steps`;
  return null;
}

export function scaleEffect(e: Effect, factor: number): Effect {
  const scaled: Effect = { ...e };
  for (const k of NUMERIC_EFFECT_KEYS) {
    const v = e[k];
    if (v !== undefined) scaled[k] = round1(v * factor);
  }
  return scaled;
}

export function evaluateManeuver(
  rng: number,
  m: Maneuver,
  order: readonly string[],
  flags: Record<string, boolean>,
  riskFactor: number,
  b: Balance,
): RngResult<{ errors: string[]; outcomes: Outcome[] }> {
  const invalid = validateOrder(m, order);
  if (invalid) throw new EngineError('INVALID_INPUT', invalid);
  const errors: string[] = [];
  const outcomes: Outcome[] = [];
  let next = rng;
  for (const err of m.errors) {
    if (order.indexOf(err.wrongIf.first) >= order.indexOf(err.wrongIf.then)) continue;
    const mitigated = err.mitigatedBy !== undefined && flags[err.mitigatedBy] === true;
    const factor = mitigated ? b.safety.mitigationFactor : 1;
    const roll = chance(next, err.injuryChance * riskFactor * factor);
    next = roll.next;
    errors.push(err.id);
    outcomes.push({ cause: `maneuver:${m.id}:${err.id}`, pillar: 'safety', effect: mitigated ? scaleEffect(err.effect, factor) : err.effect });
    if (roll.value) {
      outcomes.push({ cause: `injury:maneuver:${m.id}:${err.id}`, pillar: 'safety', effect: { injury: true, mood: -b.mood.injury } });
    }
  }
  return { value: { errors, outcomes }, next };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/maneuver.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/maneuver.ts tests/engine/maneuver.test.ts
git commit -m "feat: add command-order maneuver episodes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Схемы контента, кросс-валидация, загрузчик (`src/content/*`)

**Files:**
- Create: `src/content/schema.ts`, `src/content/validate.ts`, `src/content/parse.ts`, `src/content/load-node.ts`, `scripts/validate-content.ts`
- Test: `tests/content/parse.test.ts`

**Interfaces:**
- Consumes: типы и константы из `types.ts`.
- Produces:
  - `schema.ts`: `BoatSchema`, `MapPointSchema`, `RouteSchema`, `WeatherTemplateSchema`, `CrewArchetypeSchema`, `BriefingTopicSchema`, `DialogueSchema`, `GameEventSchema`, `ManeuverSchema`, `DebriefRuleSchema`, `BalanceSchema`, `EffectSchema`. Каждая типизирована как `z.ZodType<T>`, поэтому расхождение с `types.ts` ловит `tsc`
  - `parse.ts`: `CONTENT_FILES` (11 имён), `type ContentFile`, `interface ContentError { file: ContentFile | 'cross'; path: string; message: string }`, `parseContent(raw: Partial<Record<ContentFile, unknown>>): { content: Content | null; errors: ContentError[] }`, `formatErrors(errors): string`
  - `validate.ts`: `crossValidate(content: Content): ContentError[]`
  - `load-node.ts`: `loadContentDir(dir: string): Promise<{ content: Content | null; errors: ContentError[] }>`
  - `scripts/validate-content.ts`: печатает ошибки и завершает процесс с кодом 1 при ошибках; `npm run validate-content`

Кросс-проверки: уникальные id в каждом файле; ровно одна точка `base`; концы маршрутов существуют и различны; все точки достижимы от базы; в каждом шаблоне погоды есть дни `1..schedule.days`; тем брифинга ≥ `briefing.slots`; на каждый `ManeuverKind` есть манёвр; `wrongIf` ссылается на существующие шаги; id шагов уникальны внутри манёвра; id вариантов уникальны внутри события; `effect.promise` ссылается на существующий диалог, у которого есть контекст `morning` (для утренних событий) или `evening` (для остальных); `min_level ≤ voices.maxLevel`. Проверку условий добавит Task 12.

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import { CONTENT_FILES, parseContent } from '../../src/content/parse';
import { makeContent } from '../fixtures/content';

const raw = (): Record<string, any> => JSON.parse(JSON.stringify(makeContent()));

describe('content parsing', () => {
  it('fixture content is valid', () => {
    const r = parseContent(raw());
    expect(r.errors).toEqual([]);
    expect(r.content!.boats[0]!.id).toBe('test_boat');
  });

  it('missing translation is reported with file and path', () => {
    const r0 = raw();
    r0.boats[0].name.en = '';
    const r = parseContent(r0);
    expect(r.content).toBeNull();
    expect(r.errors).toContainEqual(expect.objectContaining({ file: 'boats', path: '0.name.en' }));
  });

  it('missing file and unknown keys are errors', () => {
    const r0 = raw();
    delete r0.routes;
    r0.map[0].extra = 1;
    const r = parseContent(r0);
    expect(r.errors).toContainEqual(expect.objectContaining({ file: 'routes', message: 'missing file' }));
    expect(r.errors).toContainEqual(expect.objectContaining({ file: 'map' }));
  });

  it('option must be either check+success+fail or effects', () => {
    const r0 = raw();
    r0.events[0].options[1].check = { voice: 'mechanic', difficulty: 2 };
    expect(parseContent(r0).errors).toContainEqual(expect.objectContaining({ file: 'events', message: expect.stringMatching(/either/) }));
  });

  it.each([
    ['route to unknown point', (r: any) => { r.routes[0].to = 'atlantis'; }, /routes\[0\]\.to/],
    ['duplicate ids', (r: any) => { r.map[1].id = 'base'; }, /duplicate id "base"/],
    ['no base', (r: any) => { r.map[0].kind = 'marina'; }, /exactly one base/],
    ['unreachable point', (r: any) => { r.routes = r.routes.filter((x: any) => x.to !== 'bay_a' && x.from !== 'bay_a'); }, /bay_a.*unreachable/],
    ['weather day missing', (r: any) => { r.weather[0].days.pop(); }, /day 6/],
    ['bad maneuver step ref', (r: any) => { r.maneuvers[0].errors[0].wrongIf.first = 'nope'; }, /unknown step "nope"/],
    ['promise to unknown dialogue', (r: any) => { r.events[0].options[1].effects.promise = 'ghost'; }, /dialogue "ghost"/],
    ['promise dialogue without matching context', (r: any) => { r.events[0].options[1].effects.promise = 'ten_bonus'; r.dialogues[1].contexts = ['briefing']; }, /no "evening" context/],
    ['too few briefing topics', (r: any) => { r.briefing = r.briefing.slice(0, 3); }, /at least 4/],
  ])('cross-validation: %s', (_name, mutate, pattern) => {
    const r0 = raw();
    mutate(r0);
    const r = parseContent(r0);
    expect(r.content).toBeNull();
    expect(r.errors.map((e) => `${e.path}: ${e.message}`).join('\n')).toMatch(pattern);
  });

  it('loadContentDir reads <file>.json from a directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skipper-'));
    const r0 = raw();
    for (const f of CONTENT_FILES) await writeFile(join(dir, `${f}.json`), JSON.stringify(r0[f]));
    const r = await loadContentDir(dir);
    expect(r.errors).toEqual([]);
    const empty = await loadContentDir(join(dir, 'nope'));
    expect(empty.errors[0]!.message).toMatch(/Cannot read boats\.json/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/content/schema.ts`**

```ts
import { z } from 'zod';
import {
  CHECKPOINTS, DIRS, MANEUVER_KINDS, PILLARS, VOICES,
  type Balance, type Boat, type BriefingTopic, type CrewArchetype, type DebriefRule, type Dialogue, type Effect,
  type EventOption, type GameEvent, type Maneuver, type MapPoint, type Route, type WeatherTemplate,
} from '../engine/types';

const POINT_KINDS = ['base', 'marina', 'bay', 'quay'] as const;
const SEABEDS = ['sand', 'mud', 'weed', 'rock'] as const;
const FEATURES = ['strait', 'cape', 'gulf', 'open'] as const;
const WISHES = ['beach', 'taverna', 'early_start', 'sailing', 'rest', 'swim'] as const;
const ACTIVITIES = ['swim', 'taverna', 'beach'] as const;
const EVENT_PHASES = ['morning', 'passage', 'arrival', 'evening'] as const;
const DIALOGUE_CONTEXTS = ['briefing', 'morning', 'evening'] as const;
const SHOWERS = ['strict', 'normal', 'loose'] as const;
const POS = ['upwind', 'reach', 'run'] as const;

const Id = z.string().regex(/^[a-z0-9_]+$/, 'id must be snake_case');
const Text = z.object({ ru: z.string().min(1), en: z.string().min(1) }).strict();
const Prob = z.number().min(0).max(1);
const NonNeg = z.number().min(0);
const Pos = z.number().positive();
const Int = z.number().int();
const Hour = z.number().min(0).max(24);

function fullRecord<K extends string, V extends z.ZodTypeAny>(keys: readonly K[], value: V) {
  return z.object(Object.fromEntries(keys.map((k) => [k, value])) as Record<K, V>).strict();
}

export const EffectSchema: z.ZodType<Effect> = z.object({
  mood: z.number().optional(),
  fatigue: z.number().optional(),
  money: z.number().optional(),
  water: z.number().optional(),
  fuel: z.number().optional(),
  service_bank: z.number().optional(),
  starter_bank: z.number().optional(),
  gas: z.number().optional(),
  time_hours: NonNeg.optional(),
  mood_per_day: z.number().optional(),
  damage: Id.optional(),
  repair: Id.optional(),
  flag: Id.optional(),
  injury: z.boolean().optional(),
  signal: Id.optional(),
  promise: Id.optional(),
}).strict();

export const BoatSchema: z.ZodType<Boat> = z.object({
  id: Id, name: Text, lengthFt: Pos, cabins: Int.positive(), berths: Int.positive(),
  waterTankL: Pos, fuelTankL: Pos, serviceBankAh: Pos, serviceBanks: Int.positive(), starterSeparate: z.boolean(),
  solarW: NonNeg, generator: z.boolean(), electricToilet: z.boolean(), bowThruster: z.boolean(),
  motorKn: Pos, hullSpeedKn: Pos, priceEur: NonNeg, depositEur: NonNeg,
  shinyFeatures: z.array(Text),
  hiddenDefects: z.array(z.object({ id: Id, checkpoint: z.enum(CHECKPOINTS), description: Text, chargedOnReturn: Id.optional() }).strict()),
}).strict();

export const MapPointSchema: z.ZodType<MapPoint> = z.object({
  id: Id, name: Text, kind: z.enum(POINT_KINDS), x: z.number(), y: z.number(),
  seabed: z.enum(SEABEDS), depthM: Pos, shelter: fullRecord(DIRS, Prob),
  priceEur: NonNeg, placesGoneHour: Hour.nullable(),
  services: z.object({ water: z.boolean(), fuel: z.boolean(), shorePower: z.boolean(), gas: z.boolean(), taverna: z.boolean(), beach: z.boolean() }).strict(),
}).strict();

export const RouteSchema: z.ZodType<Route> = z.object({
  id: Id, from: Id, to: Id, distanceNm: Pos, kLocal: Pos, features: z.array(z.enum(FEATURES)),
}).strict();

export const WeatherTemplateSchema: z.ZodType<WeatherTemplate> = z.object({
  id: Id, name: Text, afternoonFactor: Pos,
  days: z.array(z.object({ day: Int.positive(), windKn: NonNeg, gustKn: NonNeg, dir: z.enum(DIRS), frontChance: Prob, barometerHpa: Pos }).strict()).min(1),
}).strict();

export const CrewArchetypeSchema: z.ZodType<CrewArchetype> = z.object({
  id: Id, name: Text, names: z.array(Text).min(1), wishes: z.array(z.enum(WISHES)),
  seasickness: Prob, patience: Prob, promiseSensitivity: Pos,
}).strict();

export const BriefingTopicSchema: z.ZodType<BriefingTopic> = z.object({ id: Id, title: Text, description: Text }).strict();

const ExpectationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('depart_by'), hour: Hour }).strict(),
  z.object({ kind: z.literal('arrive_at_kind'), pointKind: z.enum(POINT_KINDS) }).strict(),
  z.object({ kind: z.literal('activity'), activity: z.enum(ACTIVITIES) }).strict(),
  z.object({ kind: z.literal('none') }).strict(),
]);

export const DialogueSchema: z.ZodType<Dialogue> = z.object({
  id: Id, contexts: z.array(z.enum(DIALOGUE_CONTEXTS)).min(1), said: Text, heard: Text, strength: Prob, expectation: ExpectationSchema,
}).strict();

const OptionSchema: z.ZodType<EventOption> = z.object({
  id: Id, text: Text, requires: z.array(z.string().min(1)).optional(),
  check: z.object({ voice: z.enum(VOICES), difficulty: Int.min(0).max(6) }).strict().optional(),
  success: EffectSchema.optional(), fail: EffectSchema.optional(), effects: EffectSchema.optional(),
}).strict().refine(
  (o) => (o.check && o.success && o.fail && !o.effects) || (!o.check && !o.success && !o.fail && o.effects),
  { message: 'option needs either check+success+fail or effects' },
);

export const GameEventSchema: z.ZodType<GameEvent> = z.object({
  id: Id, pillar: z.enum(PILLARS),
  trigger: z.object({ phase: z.enum(EVENT_PHASES), conditions: z.array(z.string().min(1)), chance: Prob, once: z.boolean().optional() }).strict(),
  scene: Id, text: Text,
  voices: z.array(z.object({ voice: z.enum(VOICES), min_level: Int.min(0), text: Text }).strict()),
  options: z.array(OptionSchema).min(2),
  debrief: Text,
}).strict();

export const ManeuverSchema: z.ZodType<Maneuver> = z.object({
  id: Id, kind: z.enum(MANEUVER_KINDS), title: Text,
  steps: z.array(z.object({ id: Id, text: Text }).strict()).min(2),
  errors: z.array(z.object({
    id: Id, wrongIf: z.object({ first: Id, then: Id }).strict(), effect: EffectSchema,
    injuryChance: Prob, mitigatedBy: z.string().min(1).optional(), text: Text,
  }).strict()),
}).strict();

export const DebriefRuleSchema: z.ZodType<DebriefRule> = z.object({
  id: Id, pillar: z.enum(PILLARS), decision: z.string().min(1), consequence: z.string().min(1),
  signal: z.string().min(1).optional(), priority: z.number(), text: Text,
}).strict();

const Pair = z.tuple([z.number(), z.number()]);
const Triple = z.tuple([z.number(), z.number(), z.number()]);

export const BalanceSchema: z.ZodType<Balance> = z.object({
  start: z.object({ moneyEur: NonNeg, mood: NonNeg, fatigue: NonNeg, gasPct: NonNeg, serviceBankPct: NonNeg, starterBankPct: NonNeg, hour: Hour, crewSize: Int.positive() }).strict(),
  voices: z.object({ points: Int.positive(), maxLevel: Int.positive(), prideLevel: Int.min(0), crewVoiceLevel: Int.min(0), seaSenseSignalLevel: Int.min(0), mechanicExactLevel: Int.min(0), cautionRiskPerLevel: NonNeg, cautionTimePerLevel: NonNeg, orderRiskPerLevel: NonNeg }).strict(),
  water: z.object({ perPersonPerDayL: fullRecord(SHOWERS, NonNeg), zeroMoodPenalty: NonNeg }).strict(),
  fuel: z.object({ motorLph: Pos, priceEurPerL: NonNeg }).strict(),
  electric: z.object({ fridgeAhPerDay: NonNeg, pumpsAhPerDay: NonNeg, electricToiletAhPerDay: NonNeg, plotterAhPerHour: NonNeg, autopilotAhPerHour: NonNeg, engineChargeAhPerHour: NonNeg, solarAhPerWattDay: NonNeg, starterStartPct: NonNeg, starterMinPct: NonNeg, zeroServiceMoodPenalty: NonNeg }).strict(),
  gas: z.object({ pctPerDay: NonNeg, exchangeEur: NonNeg, exchangeBelowPct: NonNeg, noHotFoodMoodPenalty: NonNeg }).strict(),
  mood: z.object({ restPerHour: NonNeg, restCapHours: NonNeg, swimStop: NonNeg, tavernaDinner: NonNeg, tavernaEurPerPerson: NonNeg, overpowerPerHour: NonNeg, marinaRefused: NonNeg, rollyNight: NonNeg, injury: NonNeg }).strict(),
  fatigue: z.object({ passagePerHour: NonNeg, maneuverError: NonNeg, nightRecovery: NonNeg, rollyNightPenalty: NonNeg, rollyExposure: Prob, checkPenaltyPerPoint: NonNeg }).strict(),
  sails: z.object({
    reefThresholdKn: Triple, partialGenoaBonusKn: NonNeg, breakChancePerKnOver: NonNeg, breakChanceMax: Prob, forcedReefMarginKn: NonNeg,
    reefUnderwayMin: NonNeg, reefUnderwayInjuryChance: Prob, fullPowerWindKn: Pos, minSailWindKn: NonNeg, drifterFactor: Pos,
    overpowerSpeedFactor: Pos, posFactor: fullRecord(POS, Pos), reefFactor: Triple, partialGenoaFactor: Pos,
    detourDistanceFactor: Pos, motorUpwindPenaltyWindKn: NonNeg, motorUpwindFactor: Pos,
  }).strict(),
  time: z.object({
    earliestDepartureHour: Hour, lateDepartureHour: Hour, busyRouteNm: Pos, busyRouteLegs: Int.positive(), maxSwimStops: Int.min(0), departureMin: NonNeg,
    anchorMin: Pair, anchorFailChance: Pair, seabedFailFactor: fullRecord(SEABEDS, Prob), anchorWindPenaltyKn: NonNeg,
    anchorWindPenalty: Prob, anchorBriefedReduction: Prob, anchorMaxAttempts: Int.positive(), marinaMooringMin: NonNeg,
    marinaLateRefusalChance: Prob, marinaWaitMin: NonNeg, swimStopMin: NonNeg, sunsetHour: Hour,
  }).strict(),
  promises: z.object({ keptPerStrength: NonNeg, brokenPerStrength: NonNeg, diplomatSofteningPerLevel: NonNeg }).strict(),
  checks: z.object({ base: Prob, perLevel: NonNeg, min: Prob, max: Prob }).strict(),
  checkin: z.object({ budgetMin: Pos, costMin: fullRecord(CHECKPOINTS, NonNeg) }).strict(),
  briefing: z.object({ slots: Int.positive(), maxDialogues: Int.min(0) }).strict(),
  weather: z.object({ frontAddKn: Pair, frontShiftSteps: Int, barometerDropHpa: NonNeg, afternoonFromHour: Hour }).strict(),
  schedule: z.object({ days: Int.positive(), returnDeadlineHour: Hour, lateFeeEur: NonNeg }).strict(),
  rescue: z.object({ jumpStartEur: NonNeg, jumpStartDelayMin: NonNeg, moodPenalty: NonNeg }).strict(),
  safety: z.object({ mitigationFactor: Prob }).strict(),
  deposit: z.object({ damageCostEur: z.record(NonNeg), defaultDamageEur: NonNeg }).strict(),
  grading: z.object({ crewGoodMood: NonNeg, crewOkMood: NonNeg, boatOkLossEur: NonNeg }).strict(),
  drama: z.object({ pillarWeightByDay: z.record(z.record(z.enum(PILLARS), NonNeg)) }).strict(),
}).strict();
```

- [ ] **Step 4: Write `src/content/validate.ts`**

```ts
import { MANEUVER_KINDS, type Content } from '../engine/types';
import type { ContentError } from './parse';

type Add = (path: string, message: string) => void;

function uniqueIds(name: string, items: ReadonlyArray<{ id: string }>, add: Add): void {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    if (seen.has(item.id)) add(`${name}[${i}].id`, `duplicate id "${item.id}"`);
    seen.add(item.id);
  });
}

function checkMap(c: Content, add: Add): void {
  const bases = c.map.filter((p) => p.kind === 'base');
  if (bases.length !== 1) add('map', `exactly one base point required, found ${bases.length}`);
  const ids = new Set(c.map.map((p) => p.id));
  c.routes.forEach((r, i) => {
    if (!ids.has(r.from)) add(`routes[${i}].from`, `unknown point "${r.from}"`);
    if (!ids.has(r.to)) add(`routes[${i}].to`, `unknown point "${r.to}"`);
    if (r.from === r.to) add(`routes[${i}]`, 'route must connect two different points');
  });
  const base = bases[0];
  if (!base) return;
  const reached = new Set([base.id]);
  const queue = [base.id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const r of c.routes) {
      const next = r.from === cur ? r.to : r.to === cur ? r.from : null;
      if (next && !reached.has(next)) { reached.add(next); queue.push(next); }
    }
  }
  c.map.forEach((p, i) => { if (!reached.has(p.id)) add(`map[${i}]`, `point "${p.id}" is unreachable from base`); });
}

function checkWeatherAndBriefing(c: Content, add: Add): void {
  c.weather.forEach((t, i) => {
    for (let day = 1; day <= c.balance.schedule.days; day++) {
      if (!t.days.some((d) => d.day === day)) add(`weather[${i}].days`, `template "${t.id}" has no day ${day}`);
    }
  });
  if (c.briefing.length < c.balance.briefing.slots) add('briefing', `need at least ${c.balance.briefing.slots} topics`);
}

function checkManeuvers(c: Content, add: Add): void {
  for (const kind of MANEUVER_KINDS) {
    if (!c.maneuvers.some((m) => m.kind === kind)) add('maneuvers', `no maneuver of kind "${kind}"`);
  }
  c.maneuvers.forEach((m, i) => {
    uniqueIds(`maneuvers[${i}].steps`, m.steps, add);
    const steps = new Set(m.steps.map((s) => s.id));
    m.errors.forEach((e, j) => {
      for (const ref of [e.wrongIf.first, e.wrongIf.then]) {
        if (!steps.has(ref)) add(`maneuvers[${i}].errors[${j}].wrongIf`, `unknown step "${ref}"`);
      }
    });
  });
}

function checkEvents(c: Content, add: Add): void {
  const dialogues = new Map(c.dialogues.map((d) => [d.id, d]));
  c.events.forEach((ev, i) => {
    uniqueIds(`events[${i}].options`, ev.options, add);
    ev.voices.forEach((v, j) => {
      if (v.min_level > c.balance.voices.maxLevel) add(`events[${i}].voices[${j}].min_level`, `exceeds max level ${c.balance.voices.maxLevel}`);
    });
    ev.options.forEach((o, j) => {
      const context = ev.trigger.phase === 'morning' ? 'morning' : 'evening';
      for (const eff of [o.effects, o.success, o.fail]) {
        if (!eff?.promise) continue;
        const d = dialogues.get(eff.promise);
        if (!d) add(`events[${i}].options[${j}]`, `unknown dialogue "${eff.promise}"`);
        else if (!d.contexts.includes(context)) add(`events[${i}].options[${j}]`, `dialogue "${d.id}" has no "${context}" context`);
      }
    });
  });
}

export function crossValidate(c: Content): ContentError[] {
  const errors: ContentError[] = [];
  const add: Add = (path, message) => errors.push({ file: 'cross', path, message });
  const lists = { boats: c.boats, map: c.map, routes: c.routes, weather: c.weather, crew: c.crew, briefing: c.briefing, events: c.events, dialogues: c.dialogues, debrief: c.debrief, maneuvers: c.maneuvers };
  for (const [name, items] of Object.entries(lists)) uniqueIds(name, items, add);
  checkMap(c, add);
  checkWeatherAndBriefing(c, add);
  checkManeuvers(c, add);
  checkEvents(c, add);
  return errors;
}
```

- [ ] **Step 5: Write `src/content/parse.ts`**

```ts
import { z } from 'zod';
import type { Content } from '../engine/types';
import {
  BalanceSchema, BoatSchema, BriefingTopicSchema, CrewArchetypeSchema, DebriefRuleSchema, DialogueSchema,
  GameEventSchema, ManeuverSchema, MapPointSchema, RouteSchema, WeatherTemplateSchema,
} from './schema';
import { crossValidate } from './validate';

export const CONTENT_FILES = ['boats', 'map', 'routes', 'weather', 'crew', 'briefing', 'events', 'dialogues', 'debrief', 'maneuvers', 'balance'] as const;
export type ContentFile = (typeof CONTENT_FILES)[number];
export interface ContentError { file: ContentFile | 'cross'; path: string; message: string }
export interface ParseResult { content: Content | null; errors: ContentError[] }

const FILE_SCHEMAS: Record<ContentFile, z.ZodTypeAny> = {
  boats: z.array(BoatSchema).min(1),
  map: z.array(MapPointSchema).min(2),
  routes: z.array(RouteSchema).min(1),
  weather: z.array(WeatherTemplateSchema).min(1),
  crew: z.array(CrewArchetypeSchema).min(1),
  briefing: z.array(BriefingTopicSchema),
  events: z.array(GameEventSchema),
  dialogues: z.array(DialogueSchema),
  debrief: z.array(DebriefRuleSchema),
  maneuvers: z.array(ManeuverSchema),
  balance: BalanceSchema,
};

export function parseContent(raw: Partial<Record<ContentFile, unknown>>): ParseResult {
  const errors: ContentError[] = [];
  const parsed: Partial<Record<ContentFile, unknown>> = {};
  for (const file of CONTENT_FILES) {
    if (raw[file] === undefined) {
      errors.push({ file, path: '', message: 'missing file' });
      continue;
    }
    const r = FILE_SCHEMAS[file].safeParse(raw[file]);
    if (r.success) parsed[file] = r.data;
    else for (const issue of r.error.issues) errors.push({ file, path: issue.path.join('.'), message: issue.message });
  }
  if (errors.length) return { content: null, errors };
  const content = parsed as unknown as Content;
  const cross = crossValidate(content);
  return cross.length ? { content: null, errors: cross } : { content, errors: [] };
}

export function formatErrors(errors: readonly ContentError[]): string {
  return errors.map((e) => `[${e.file}] ${e.path || '(root)'}: ${e.message}`).join('\n');
}
```

- [ ] **Step 6: Write `src/content/load-node.ts` and `scripts/validate-content.ts`**

```ts
// src/content/load-node.ts — Node-only loader; browser build will fetch the same files.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONTENT_FILES, parseContent, type ContentError, type ContentFile, type ParseResult } from './parse';

export async function loadContentDir(dir: string): Promise<ParseResult> {
  const raw: Partial<Record<ContentFile, unknown>> = {};
  const errors: ContentError[] = [];
  for (const file of CONTENT_FILES) {
    try {
      raw[file] = JSON.parse(await readFile(join(dir, `${file}.json`), 'utf8'));
    } catch (e) {
      errors.push({ file, path: '', message: `Cannot read ${file}.json: ${(e as Error).message}` });
    }
  }
  return errors.length ? { content: null, errors } : parseContent(raw);
}
```

```ts
// scripts/validate-content.ts
import { resolve } from 'node:path';
import { loadContentDir } from '../src/content/load-node';
import { formatErrors } from '../src/content/parse';

const dir = resolve(process.argv[2] ?? 'content');
const { content, errors } = await loadContentDir(dir);
if (!content) {
  console.error(`Content invalid (${errors.length} errors):\n${formatErrors(errors)}`);
  process.exit(1);
}
console.log(`Content OK: ${content.boats.length} boats, ${content.map.length} points, ${content.events.length} events`);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/content && npx tsc --noEmit`
Expected: PASS. Если `tsc` ругается на `z.ZodType<T>`, значит схема разошлась с `types.ts`. Чинить нужно схему, а не тип.

- [ ] **Step 8: Commit**

```bash
git add src/content scripts/validate-content.ts tests/content
git commit -m "feat: add content schemas, cross-validation and loader

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Разбор недели (`debrief.ts`)

**Files:**
- Create: `src/engine/debrief.ts`
- Test: `tests/engine/debrief.test.ts`

**Interfaces:**
- Consumes: `causeMatches` (T1), `requireBoat`; типы.
- Produces:
  - `interface DebriefLink { ruleId: string; pillar: Pillar; text: LocalizedText; decision: LogEntry; consequence: LogEntry; signal: LogEntry | null }`
  - `interface WeekScales { safety: Grade; crew: Grade; boat: Grade; schedule: Grade }`
  - `interface Debrief { scales: WeekScales; depositLossEur: number; depositReturnedEur: number; links: DebriefLink[]; eventNotes: LocalizedText[] }`
  - `depositLoss(damages: readonly string[], b): number`
  - `gradeWeek(state: GameState, boat: Boat, b): { scales: WeekScales; depositLossEur: number; depositReturnedEur: number }` — safety: травма → bad, ошибка манёвра (`maneuver:*` effect) → ok, иначе good; crew по порогам `grading`; boat: 0 → good, ≤ `boatOkLossEur` → ok; schedule: `returnedOnTime === true` → good, иначе bad
  - `findLinks(log: readonly LogEntry[], rules: readonly DebriefRule[], max: number): DebriefLink[]` — по убыванию `priority`: первое решение; первое последствие с индексом ≥ решения; сигнал — любой с индексом ≤ последствия
  - `buildDebrief(state: GameState, content: Content, maxItems?: number /* 5 */): Debrief` — `eventNotes`: тексты `debrief` сработавших событий, которые ещё не покрыты связью; всего links + notes ≤ maxItems

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildDebrief, depositLoss, findLinks, gradeWeek } from '../../src/engine/debrief';
import { appendLog } from '../../src/engine/log';
import type { DebriefRule, GameState } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

const content = makeContent();
const b = content.balance;
const boat = content.boats[0]!;
const t = (s: string) => ({ ru: s, en: s });

function withLog(causes: Array<[GameState['log'][number]['kind'], string]>, over: Partial<GameState> = {}): GameState {
  return causes.reduce((s, [kind, cause]) => appendLog(s, { kind, cause }), makeState(over));
}

describe('debrief', () => {
  it('depositLoss uses costs with default fallback', () => {
    expect(depositLoss(['sail_torn', 'mystery'], b)).toBe(900 + 300);
  });

  it('gradeWeek: four scales', () => {
    const clean = makeState({ returnedOnTime: true, resources: { ...makeState().resources, mood: 75 } });
    expect(gradeWeek(clean, boat, b)).toEqual({ scales: { safety: 'good', crew: 'good', boat: 'good', schedule: 'good' }, depositLossEur: 0, depositReturnedEur: 2000 });
    const rough = withLog([['effect', 'maneuver:dep_test:gear_before_release']], { damages: ['toilet_broken'], resources: { ...makeState().resources, mood: 50 } });
    expect(gradeWeek(rough, boat, b).scales).toEqual({ safety: 'ok', crew: 'ok', boat: 'ok', schedule: 'bad' });
    const bad = makeState({ injuries: 1, damages: ['sail_torn', 'hull_scratch'], resources: { ...makeState().resources, mood: 20 } });
    expect(gradeWeek(bad, boat, b)).toMatchObject({ scales: { safety: 'bad', crew: 'bad', boat: 'bad' }, depositLossEur: 1500, depositReturnedEur: 500 });
  });

  const rules: DebriefRule[] = [
    { id: 'low', pillar: 'time', decision: 'plan:route:busy', consequence: 'marina:refused', priority: 1, text: t('busy') },
    { id: 'high', pillar: 'boat', decision: 'checkin:skip:toilets', consequence: 'event:toilet_clog', signal: 'signal:smell', priority: 5, text: t('toilets') },
    { id: 'never', pillar: 'weather', decision: 'barometer:ignored', consequence: 'sail:break', priority: 9, text: t('never') },
  ];

  it('findLinks: ordered by priority, consequence after decision, optional signal', () => {
    const s = withLog([
      ['decision', 'checkin:skip:toilets'], ['decision', 'plan:route:busy'], ['signal', 'signal:smell'],
      ['effect', 'marina:refused'], ['event', 'event:toilet_clog'], ['decision', 'barometer:ignored'],
    ]);
    const links = findLinks(s.log, rules, 5);
    expect(links.map((l) => l.ruleId)).toEqual(['high', 'low']);
    expect(links[0]!.signal!.cause).toBe('signal:smell');
    expect(links[1]!.signal).toBeNull();
  });

  it('findLinks ignores consequences that happened before the decision', () => {
    const s = withLog([['effect', 'marina:refused'], ['decision', 'plan:route:busy']]);
    expect(findLinks(s.log, rules, 5)).toEqual([]);
  });

  it('buildDebrief adds event notes not already covered, capped', () => {
    const s = withLog([['decision', 'checkin:skip:toilets'], ['event', 'event:toilet_clog']], { firedEvents: ['toilet_clog'], returnedOnTime: true });
    const d = buildDebrief(s, content);
    expect(d.links.map((l) => l.ruleId)).toEqual(['toilet_unchecked']);
    expect(d.eventNotes).toEqual([]);
    const s2 = withLog([['event', 'event:toilet_clog']], { firedEvents: ['toilet_clog'] });
    expect(buildDebrief(s2, content).eventNotes).toEqual([content.events[0]!.debrief]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/debrief.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
import { causeMatches } from './log';
import { requireBoat } from './state';
import type { Balance, Boat, Content, DebriefRule, GameState, Grade, LocalizedText, LogEntry, Pillar } from './types';

export interface DebriefLink { ruleId: string; pillar: Pillar; text: LocalizedText; decision: LogEntry; consequence: LogEntry; signal: LogEntry | null }
export interface WeekScales { safety: Grade; crew: Grade; boat: Grade; schedule: Grade }
export interface Debrief { scales: WeekScales; depositLossEur: number; depositReturnedEur: number; links: DebriefLink[]; eventNotes: LocalizedText[] }

export function depositLoss(damages: readonly string[], b: Balance): number {
  return damages.reduce((sum, d) => sum + (b.deposit.damageCostEur[d] ?? b.deposit.defaultDamageEur), 0);
}

export function gradeWeek(state: GameState, boat: Boat, b: Balance): { scales: WeekScales; depositLossEur: number; depositReturnedEur: number } {
  const loss = depositLoss(state.damages, b);
  const nearMiss = state.log.some((e) => e.kind === 'effect' && causeMatches(e.cause, 'maneuver'));
  const mood = state.resources.mood;
  const crew: Grade = mood >= b.grading.crewGoodMood ? 'good' : mood >= b.grading.crewOkMood ? 'ok' : 'bad';
  const boatGrade: Grade = loss === 0 ? 'good' : loss <= b.grading.boatOkLossEur ? 'ok' : 'bad';
  return {
    scales: {
      safety: state.injuries > 0 ? 'bad' : nearMiss ? 'ok' : 'good',
      crew,
      boat: boatGrade,
      schedule: state.returnedOnTime === true ? 'good' : 'bad',
    },
    depositLossEur: loss,
    depositReturnedEur: Math.max(0, boat.depositEur - loss),
  };
}

export function findLinks(log: readonly LogEntry[], rules: readonly DebriefRule[], max: number): DebriefLink[] {
  const links: DebriefLink[] = [];
  for (const rule of [...rules].sort((a, b) => b.priority - a.priority)) {
    if (links.length >= max) break;
    const di = log.findIndex((e) => causeMatches(e.cause, rule.decision));
    if (di < 0) continue;
    const ci = log.findIndex((e, i) => i >= di && causeMatches(e.cause, rule.consequence));
    if (ci < 0) continue;
    const signal = rule.signal ? log.find((e, i) => i <= ci && causeMatches(e.cause, rule.signal!)) ?? null : null;
    links.push({ ruleId: rule.id, pillar: rule.pillar, text: rule.text, decision: log[di]!, consequence: log[ci]!, signal });
  }
  return links;
}

export function buildDebrief(state: GameState, content: Content, maxItems = 5): Debrief {
  const graded = gradeWeek(state, requireBoat(content, state), content.balance);
  const links = findLinks(state.log, content.debrief, maxItems);
  const covered = (eventId: string): boolean => links.some((l) => causeMatches(l.consequence.cause, `event:${eventId}`));
  const eventNotes = state.firedEvents
    .filter((id) => !covered(id))
    .map((id) => content.events.find((e) => e.id === id)?.debrief)
    .filter((t): t is LocalizedText => t !== undefined)
    .slice(0, Math.max(0, maxItems - links.length));
  return { ...graded, links, eventNotes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/debrief.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/debrief.ts tests/engine/debrief.test.ts
git commit -m "feat: add week grading and decision→consequence→signal debrief

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## Wave 2 (параллельно, 4 задачи)

### Task 12: События — выбор, показ, разрешение, очередь; валидатор условий

**Files:**
- Create: `src/engine/events.ts`, `src/content/conditions.ts`
- Modify: `src/content/parse.ts` (подключить `validateConditions` в `parseContent`)
- Test: `tests/engine/events.test.ts`, `tests/content/conditions.test.ts`

**Interfaces:**
- Consumes: `buildConditionContext`, `evaluateAll`, `conditionIdentifiers`, `CONTEXT_KEYS`, `BOAT_KEYS`, `CondContext` (T2); `applyOutcomes` (T6); `sayDialogue` (T7); `rollCheck`, `checkChance`, `audibleLines` (T8); `chance` (T1); `appendLog`; `requireBoat`, `requireEvent`; `ContentError` (T10).
- Produces:
  - `pillarWeight(day: number, pillar: Pillar, b): number` — из `drama.pillarWeightByDay`, по умолчанию 1
  - `eligibleEvents(content, state, phase: EventPhase, ctx: CondContext): GameEvent[]` — фаза совпадает; не в `firedEvents` (если `once !== false`) и не в очереди; условия истинны
  - `rollEvent(rng, content, state, phase, ctx): RngResult<GameEvent | null>` — по порядку контента бросок `min(1, chance × pillarWeight)`, первое выпавшее побеждает; максимум 1 событие на фазу
  - `optionAvailable(o: EventOption, ctx): boolean`
  - `resolveOption(rng, event, optionId, state, ctx, b): RngResult<{ outcomes: Outcome[]; check: { success: boolean; chance: number } | null }>` — cause `event:<id>:<opt>` или `event:<id>:<opt>:success|fail`
  - `interface EventView { id: string; scene: string; text: string; voices: Array<{ voice: VoiceId; text: string }>; options: Array<{ id: string; text: string; available: boolean; chance: number | null }> }`
  - `presentEvent(event, state, ctx, b): EventView` — тексты на `state.lang`
  - `queueEvent(state, content, phase): GameState` — бросает кубик; при выпадении кладёт id в `eventQueue` и `firedEvents`, логирует `event:<id>`
  - `resolvePendingEvent(state, content, optionId): GameState` — берёт `eventQueue[0]`; логирует `choice:<id>:<opt>` (+ `check`, если была проверка); применяет outcomes; для `effect.promise` вызывает `sayDialogue` с контекстом `morning` (утреннее событие) или `evening`
  - `conditions.ts`: `knownIdentifiers(c: Content): Set<string>`, `validateConditions(c: Content): ContentError[]` — проверяет `trigger.conditions`, `options[].requires`, `maneuvers[].errors[].mitigatedBy`

- [ ] **Step 1: Write the failing tests**

`tests/engine/events.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildConditionContext } from '../../src/engine/expr';
import { eligibleEvents, pillarWeight, presentEvent, queueEvent, resolveOption, resolvePendingEvent, rollEvent } from '../../src/engine/events';
import type { Content, GameEvent } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';
import { deepFreeze } from '../fixtures/freeze';
import { makeState } from '../fixtures/state';

const content = makeContent();
const b = content.balance;
const clog = content.events[0]!;
const day3 = makeState({ day: 3, phase: 'evening' });
const forced = (over: Partial<GameEvent> = {}): Content => ({
  ...content,
  events: [{ ...clog, trigger: { ...clog.trigger, chance: 1 }, ...over }],
});

describe('events', () => {
  it('pillarWeight reads the drama template', () => {
    expect(pillarWeight(3, 'weather', b)).toBe(1.5);
    expect(pillarWeight(3, 'boat', b)).toBe(1);
  });

  it('eligibleEvents: phase, conditions, once', () => {
    const ctx = buildConditionContext(day3, content);
    expect(eligibleEvents(content, day3, 'evening', ctx).map((e) => e.id)).toEqual(['toilet_clog']);
    expect(eligibleEvents(content, day3, 'morning', ctx)).toEqual([]);
    const checked = makeState({ day: 3, flags: { 'checkin.toilets': true } });
    expect(eligibleEvents(content, checked, 'evening', buildConditionContext(checked, content))).toEqual([]);
    const fired = makeState({ day: 3, firedEvents: ['toilet_clog'] });
    expect(eligibleEvents(content, fired, 'evening', buildConditionContext(fired, content))).toEqual([]);
  });

  it('rollEvent fires about chance × weight of the time', () => {
    const ctx = buildConditionContext(day3, content);
    let s = 1;
    let hits = 0;
    for (let i = 0; i < 2000; i++) {
      const r = rollEvent(s, content, day3, 'evening', ctx);
      if (r.value) hits++;
      s = r.next;
    }
    expect(hits / 2000).toBeGreaterThan(0.31);
    expect(hits / 2000).toBeLessThan(0.39);
  });

  it('resolveOption: check option → success/fail cause; effects option → plain cause', () => {
    const ctx = buildConditionContext(day3, content);
    const r = resolveOption(5, clog, 'fix_self', day3, ctx, b);
    expect(r.value.check!.chance).toBeCloseTo(0.46);
    expect(r.value.outcomes[0]!.cause).toMatch(/^event:toilet_clog:fix_self:(success|fail)$/);
    const c = resolveOption(5, clog, 'call_base', day3, ctx, b);
    expect(c.value).toEqual({ outcomes: [{ cause: 'event:toilet_clog:call_base', pillar: 'boat', effect: { money: -80, time_hours: 4 } }], check: null });
    expect(c.next).toBe(5);
  });

  it('resolveOption rejects unknown and unavailable options', () => {
    const ev: GameEvent = { ...clog, options: [...clog.options, { id: 'bay_only', text: { ru: 'x', en: 'x' }, requires: ['at_bay'], effects: { mood: 1 } }] };
    const ctx = buildConditionContext(day3, content);
    expect(() => resolveOption(1, ev, 'nope', day3, ctx, b)).toThrow(/not found/);
    expect(() => resolveOption(1, ev, 'bay_only', day3, ctx, b)).toThrow(/not available/);
  });

  it('presentEvent localises text, filters voices, shows check chances', () => {
    const view = presentEvent(clog, day3, buildConditionContext(day3, content), b);
    expect(view.text).toBe(clog.text.ru);
    expect(view.voices).toEqual([{ voice: 'mechanic', text: 'Клапан забит. Это час работы и перчатки.' }]);
    expect(view.options.map((o) => [o.id, o.available, o.chance === null ? null : Math.round(o.chance * 100)])).toEqual([
      ['fix_self', true, 46], ['call_base', true, null], ['endure', true, null],
    ]);
  });

  it('queueEvent + resolvePendingEvent', () => {
    const c = forced();
    const queued = queueEvent(deepFreeze(day3), c, 'evening');
    expect(queued.eventQueue).toEqual(['toilet_clog']);
    expect(queued.firedEvents).toEqual(['toilet_clog']);
    expect(queued.log.at(-1)).toMatchObject({ kind: 'event', cause: 'event:toilet_clog', pillar: 'boat' });
    const done = resolvePendingEvent(deepFreeze(queued), c, 'call_base');
    expect(done.eventQueue).toEqual([]);
    expect(done.resources.moneyEur).toBe(1420);
    expect(done.log.map((e) => e.cause).slice(-2)).toEqual(['choice:toilet_clog:call_base', 'event:toilet_clog:call_base']);
    expect(() => resolvePendingEvent(done, c, 'call_base')).toThrow(/No pending event/);
  });

  it('effect.promise creates an expectation', () => {
    const c = forced({ options: [{ id: 'promise', text: { ru: 'да', en: 'yes' }, effects: { promise: 'promise_taverna', mood: 4 } }, ...clog.options] });
    const s = resolvePendingEvent(queueEvent(day3, c, 'evening'), c, 'promise');
    expect(s.expectations).toEqual([expect.objectContaining({ dialogueId: 'promise_taverna', dueDay: 4 })]);
    expect(s.log.some((e) => e.cause === 'dialogue:promise_taverna')).toBe(true);
  });
});
```

`tests/content/conditions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { knownIdentifiers, validateConditions } from '../../src/content/conditions';
import { parseContent } from '../../src/content/parse';
import { makeContent } from '../fixtures/content';

describe('condition validation', () => {
  it('fixture conditions are valid', () => {
    expect(validateConditions(makeContent())).toEqual([]);
  });

  it('knows flags derived from content', () => {
    const k = knownIdentifiers(makeContent());
    for (const id of ['day', 'voice.mechanic', 'checkin.toilets', 'briefing.toilet', 'defect.worn_impeller', 'defect.worn_impeller.found', 'damage.toilet_broken', 'damage.prop_line', 'wish.taverna', 'boat.shared_bank']) {
      expect(k.has(id), id).toBe(true);
    }
    expect(k.has('briefing.toilets')).toBe(false);
  });

  it('reports typos in flags (Review Focus #1)', () => {
    const c = makeContent();
    c.events[0]!.trigger.conditions = ['!briefing.toilets'];
    expect(validateConditions(c)).toEqual([{ file: 'cross', path: 'events[0].trigger.conditions[0]', message: 'Unknown identifier "briefing.toilets" in "!briefing.toilets"' }]);
  });

  it('reports syntax errors and bad requires / mitigatedBy', () => {
    const c = makeContent();
    c.events[0]!.trigger.conditions = ['day >='];
    c.events[0]!.options[1]!.requires = ['at_harbour'];
    c.maneuvers[0]!.errors[1]!.mitigatedBy = 'briefing.lines';
    const msgs = validateConditions(c).map((e) => `${e.path}: ${e.message}`);
    expect(msgs).toEqual([
      expect.stringMatching(/^events\[0\]\.trigger\.conditions\[0\]: .*Unexpected end/),
      'events[0].options[1].requires[0]: Unknown identifier "at_harbour" in "at_harbour"',
      'maneuvers[0].errors[1].mitigatedBy: Unknown identifier "briefing.lines"',
    ]);
  });

  it('parseContent runs condition validation', () => {
    const raw = JSON.parse(JSON.stringify(makeContent()));
    raw.events[0].trigger.conditions = ['!briefing.toilets'];
    expect(parseContent(raw).errors).toContainEqual(expect.objectContaining({ message: expect.stringMatching(/briefing\.toilets/) }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/events.test.ts tests/content/conditions.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/engine/events.ts`**

```ts
import { EngineError } from './errors';
import { buildConditionContext, evaluateAll, type CondContext } from './expr';
import { appendLog } from './log';
import { sayDialogue } from './promises';
import { applyOutcomes } from './resources';
import { chance, type RngResult } from './rng';
import { requireBoat, requireEvent } from './state';
import type { Balance, Content, EventOption, EventPhase, GameEvent, GameState, Outcome, Pillar, VoiceId } from './types';
import { audibleLines, checkChance, rollCheck } from './voices';

export interface EventView {
  id: string;
  scene: string;
  text: string;
  voices: Array<{ voice: VoiceId; text: string }>;
  options: Array<{ id: string; text: string; available: boolean; chance: number | null }>;
}

export function pillarWeight(day: number, pillar: Pillar, b: Balance): number {
  return b.drama.pillarWeightByDay[String(day)]?.[pillar] ?? 1;
}

export function eligibleEvents(content: Content, state: GameState, phase: EventPhase, ctx: CondContext): GameEvent[] {
  return content.events.filter((e) =>
    e.trigger.phase === phase
    && (e.trigger.once === false || !state.firedEvents.includes(e.id))
    && !state.eventQueue.includes(e.id)
    && evaluateAll(e.trigger.conditions, ctx));
}

export function rollEvent(rng: number, content: Content, state: GameState, phase: EventPhase, ctx: CondContext): RngResult<GameEvent | null> {
  let next = rng;
  for (const e of eligibleEvents(content, state, phase, ctx)) {
    const r = chance(next, Math.min(1, e.trigger.chance * pillarWeight(state.day, e.pillar, content.balance)));
    next = r.next;
    if (r.value) return { value: e, next };
  }
  return { value: null, next };
}

export const optionAvailable = (o: EventOption, ctx: CondContext): boolean => evaluateAll(o.requires ?? [], ctx);

export function resolveOption(
  rng: number,
  event: GameEvent,
  optionId: string,
  state: GameState,
  ctx: CondContext,
  b: Balance,
): RngResult<{ outcomes: Outcome[]; check: { success: boolean; chance: number } | null }> {
  const o = event.options.find((x) => x.id === optionId);
  if (!o) throw new EngineError('NOT_FOUND', `Option "${optionId}" not found in event ${event.id}`);
  if (!optionAvailable(o, ctx)) throw new EngineError('INVALID_INPUT', `Option "${optionId}" is not available now`);
  const cause = `event:${event.id}:${o.id}`;
  if (o.check) {
    const r = rollCheck(rng, state.voices[o.check.voice], o.check.difficulty, state.resources.fatigue, b);
    const tag = r.value.success ? 'success' : 'fail';
    const effect = (r.value.success ? o.success : o.fail) ?? {};
    return { value: { outcomes: [{ cause: `${cause}:${tag}`, pillar: event.pillar, effect }], check: r.value }, next: r.next };
  }
  return { value: { outcomes: [{ cause, pillar: event.pillar, effect: o.effects ?? {} }], check: null }, next: rng };
}

export function presentEvent(event: GameEvent, state: GameState, ctx: CondContext, b: Balance): EventView {
  const lang = state.lang;
  return {
    id: event.id,
    scene: event.scene,
    text: event.text[lang],
    voices: audibleLines(event.voices, state.voices).map((l) => ({ voice: l.voice, text: l.text[lang] })),
    options: event.options.map((o) => ({
      id: o.id,
      text: o.text[lang],
      available: optionAvailable(o, ctx),
      chance: o.check ? checkChance(state.voices[o.check.voice], o.check.difficulty, state.resources.fatigue, b) : null,
    })),
  };
}

export function queueEvent(state: GameState, content: Content, phase: EventPhase): GameState {
  const r = rollEvent(state.rng, content, state, phase, buildConditionContext(state, content));
  const s = { ...state, rng: r.next };
  if (!r.value) return s;
  const ev = r.value;
  return appendLog(
    { ...s, eventQueue: [...s.eventQueue, ev.id], firedEvents: [...s.firedEvents, ev.id] },
    { kind: 'event', cause: `event:${ev.id}`, pillar: ev.pillar },
  );
}

export function resolvePendingEvent(state: GameState, content: Content, optionId: string): GameState {
  const id = state.eventQueue[0];
  if (!id) throw new EngineError('INVALID_INPUT', 'No pending event');
  const ev = requireEvent(content, id);
  const r = resolveOption(state.rng, ev, optionId, state, buildConditionContext(state, content), content.balance);
  let s: GameState = appendLog({ ...state, rng: r.next, eventQueue: state.eventQueue.slice(1) }, { kind: 'decision', cause: `choice:${ev.id}:${optionId}`, pillar: ev.pillar });
  if (r.value.check) {
    s = appendLog(s, { kind: 'check', cause: `check:${ev.id}:${optionId}`, pillar: ev.pillar, data: { success: r.value.check.success, chance: r.value.check.chance } });
  }
  s = applyOutcomes(s, requireBoat(content, s), r.value.outcomes);
  const context = ev.trigger.phase === 'morning' ? 'morning' : 'evening';
  for (const o of r.value.outcomes) if (o.effect.promise) s = sayDialogue(s, content, o.effect.promise, context);
  return s;
}
```

- [ ] **Step 4: Write `src/content/conditions.ts`**

```ts
import { BOAT_KEYS, CONTEXT_KEYS, conditionIdentifiers } from '../engine/expr';
import { CHECKPOINTS, VOICES, type Content, type Effect } from '../engine/types';
import type { ContentError } from './parse';

function allEffects(c: Content): Effect[] {
  const fromEvents = c.events.flatMap((ev) => ev.options.flatMap((o) => [o.effects, o.success, o.fail]));
  const fromManeuvers = c.maneuvers.flatMap((m) => m.errors.map((e) => e.effect));
  return [...fromEvents, ...fromManeuvers].filter((e): e is Effect => e !== undefined);
}

export function knownIdentifiers(c: Content): Set<string> {
  const effects = allEffects(c);
  const damages = new Set([
    ...Object.keys(c.balance.deposit.damageCostEur),
    ...effects.flatMap((e) => (e.damage ? [e.damage] : [])),
    ...c.boats.flatMap((b) => b.hiddenDefects.flatMap((d) => (d.chargedOnReturn ? [d.chargedOnReturn] : []))),
  ]);
  return new Set<string>([
    ...CONTEXT_KEYS,
    ...BOAT_KEYS,
    ...VOICES.map((v) => `voice.${v}`),
    ...CHECKPOINTS.map((cp) => `checkin.${cp}`),
    ...c.briefing.map((t) => `briefing.${t.id}`),
    ...c.boats.flatMap((b) => b.hiddenDefects.flatMap((d) => [`defect.${d.id}`, `defect.${d.id}.found`])),
    ...[...damages].map((d) => `damage.${d}`),
    ...c.crew.flatMap((a) => a.wishes.map((w) => `wish.${w}`)),
    ...effects.flatMap((e) => (e.flag ? [`flag.${e.flag}`] : [])),
  ]);
}

export function validateConditions(c: Content): ContentError[] {
  const known = knownIdentifiers(c);
  const errors: ContentError[] = [];
  const check = (src: string, path: string): void => {
    try {
      for (const id of conditionIdentifiers(src)) {
        if (!known.has(id)) errors.push({ file: 'cross', path, message: `Unknown identifier "${id}" in "${src}"` });
      }
    } catch (e) {
      errors.push({ file: 'cross', path, message: (e as Error).message });
    }
  };
  c.events.forEach((ev, i) => {
    ev.trigger.conditions.forEach((src, j) => check(src, `events[${i}].trigger.conditions[${j}]`));
    ev.options.forEach((o, j) => (o.requires ?? []).forEach((src, k) => check(src, `events[${i}].options[${j}].requires[${k}]`)));
  });
  c.maneuvers.forEach((m, i) => m.errors.forEach((e, j) => {
    if (e.mitigatedBy && !known.has(e.mitigatedBy)) {
      errors.push({ file: 'cross', path: `maneuvers[${i}].errors[${j}].mitigatedBy`, message: `Unknown identifier "${e.mitigatedBy}"` });
    }
  }));
  return errors;
}
```

- [ ] **Step 5: Wire into `src/content/parse.ts`**

Добавь импорт и замени строку кросс-валидации:

```ts
import { validateConditions } from './conditions';
```

```ts
  const cross = [...crossValidate(content), ...validateConditions(content)];
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: все тесты PASS, включая тесты T10.

- [ ] **Step 7: Commit**

```bash
git add src/engine/events.ts src/content/conditions.ts src/content/parse.ts tests/engine/events.test.ts tests/content/conditions.test.ts
git commit -m "feat: add event selection/resolution and condition validation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Фазы подготовки — капитан, лодка, приёмка, брифинг (`setup.ts`)

**Files:**
- Create: `src/engine/setup.ts`
- Test: `tests/engine/setup.test.ts`

**Interfaces:**
- Consumes: `assertPhase`, `EngineError`; `appendLog`; `advanceClock`, `requireBoat`, `requireTemplate`; `initialVoices` (T8); `sayDialogue` (T7); типы.
- Produces:
  - `interface NewGameOptions { seed: number; lang: Lang; weatherTemplateId?: string; crewSize?: number }`
  - `newGame(content, opts): GameState` — фаза `captain`, день 0, точка `base`; экипаж циклически по архетипам (`crew_1..N`, имя `names[floor(i / archetypes) % names.length]`); вода/топливо 0 до выбора лодки
  - `assignVoices(state, content, alloc: Partial<Record<TrainableVoice, number>>): GameState` → `boat_select`
  - `boatOffers(state, content): Array<{ boat: Boat; affordable: boolean }>`
  - `chooseBoat(state, content, boatId): GameState` → `checkin`; цена списывается с денег; танки полные; `BUDGET`, если не хватает
  - `performCheckin(state, content, checkpoints: readonly CheckpointId[]): GameState` → `briefing`; суммарное время ≤ `checkin.budgetMin`, иначе `BUDGET`; флаги `checkin.<cp>`, `defect.<id>` / `defect.<id>.found`; лог по словарю
  - `performBriefing(state, content, topicIds: readonly string[], dialogueIds: readonly string[]): GameState` → `morning`, день 1; ровно `briefing.slots` уникальных тем, ≤ `briefing.maxDialogues` реплик с контекстом `briefing`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { assignVoices, boatOffers, chooseBoat, newGame, performBriefing, performCheckin } from '../../src/engine/setup';
import { makeContent } from '../fixtures/content';
import { deepFreeze } from '../fixtures/freeze';

const content = makeContent();
const alloc = { sea_sense: 2, caution: 2, order: 2, mechanic: 2, diplomat: 2, economist: 2 };
const start = () => deepFreeze(newGame(content, { seed: 7, lang: 'ru' }));
const toCheckin = () => chooseBoat(assignVoices(start(), content, alloc), content, 'test_boat');
const toBriefing = () => performCheckin(toCheckin(), content, ['impeller', 'toilets']);
const topics = ['captain_only', 'cleats', 'loaded_lines', 'toilet'];

describe('setup phases', () => {
  it('newGame: captain phase at base with crew', () => {
    const s = start();
    expect(s).toMatchObject({ phase: 'captain', day: 0, locationId: 'base', boatId: null, seed: 7, rng: 7, weatherTemplateId: 'test_week' });
    expect(s.crew.map((m) => [m.archetypeId, m.name.ru])).toEqual([['party', 'Аня'], ['sailor', 'Ира'], ['party', 'Олег'], ['sailor', 'Макс']]);
    expect(s.resources).toMatchObject({ moneyEur: 6000, waterL: 0, fuelL: 0, mood: 70 });
    expect(() => newGame(content, { seed: 1, lang: 'en', crewSize: 0 })).toThrow(/crewSize/);
    expect(() => newGame(content, { seed: 1, lang: 'en', weatherTemplateId: 'nope' })).toThrow(/not found/);
  });

  it('assignVoices validates and advances', () => {
    const s = assignVoices(start(), content, alloc);
    expect(s.phase).toBe('boat_select');
    expect(s.voices.pride).toBe(2);
    expect(s.log.filter((e) => e.cause.startsWith('voices:'))).toHaveLength(6);
    expect(() => assignVoices(start(), content, { sea_sense: 4 })).toThrow(/sum must be 12/);
    expect(() => assignVoices(s, content, alloc)).toThrow(/Expected phase captain/);
  });

  it('boatOffers and chooseBoat', () => {
    const s = assignVoices(start(), content, alloc);
    expect(boatOffers(s, content)).toEqual([{ boat: content.boats[0], affordable: true }]);
    const chosen = chooseBoat(s, content, 'test_boat');
    expect(chosen).toMatchObject({ phase: 'checkin', boatId: 'test_boat', resources: { moneyEur: 2000, waterL: 300, fuelL: 150 } });
    expect(chosen.log.at(-1)).toMatchObject({ kind: 'decision', cause: 'boat:choose:test_boat', pillar: 'boat' });
    const pricey = { ...content, boats: [{ ...content.boats[0]!, priceEur: 9000 }] };
    expect(() => chooseBoat(s, pricey, 'test_boat')).toThrow(/afford/);
    expect(() => chooseBoat(s, content, 'ghost')).toThrow(/not found/);
  });

  it('performCheckin: time budget, flags, hidden defects, log', () => {
    const s = toBriefing();
    expect(s.phase).toBe('briefing');
    expect(s.flags).toMatchObject({ 'checkin.impeller': true, 'checkin.toilets': true, 'defect.worn_impeller.found': true, 'defect.old_scratch': true });
    expect(s.flags['defect.worn_impeller']).toBeUndefined();
    const causes = s.log.map((e) => e.cause);
    expect(causes).toContain('checkin:check:impeller');
    expect(causes).toContain('checkin:skip:damage_photos');
    expect(causes).toContain('checkin:found:worn_impeller');
    expect(causes).toContain('defect:hidden:old_scratch');
    expect(s.clockMin).toBe(toCheckin().clockMin + 35);
    expect(() => performCheckin(toCheckin(), content, ['anchor', 'impeller', 'gas', 'toilets', 'sails', 'electrics', 'damage_photos'])).toThrow(/120 min.*90/);
    expect(() => performCheckin(toCheckin(), content, ['gas', 'gas'])).toThrow(/duplicate/);
    expect(() => performCheckin(toCheckin(), content, ['radio' as never])).toThrow(/unknown checkpoint/);
  });

  it('performBriefing: exactly 4 topics, briefing dialogues, starts day 1', () => {
    const s = performBriefing(toBriefing(), content, topics, ['ten_bonus']);
    expect(s).toMatchObject({ phase: 'morning', day: 1, clockMin: 8 * 60 });
    expect(s.flags).toMatchObject({ 'briefing.captain_only': true, 'briefing.toilet': true });
    expect(s.expectations).toEqual([expect.objectContaining({ dialogueId: 'ten_bonus', dueDay: 1 })]);
    expect(s.log.map((e) => e.cause)).toEqual(expect.arrayContaining(['briefing:topic:cleats', 'briefing:skip:sails', 'dialogue:ten_bonus']));
    expect(() => performBriefing(toBriefing(), content, topics.slice(0, 3), [])).toThrow(/exactly 4/);
    expect(() => performBriefing(toBriefing(), content, ['sails', 'sails', 'mob', 'toilet'], [])).toThrow(/exactly 4/);
    expect(() => performBriefing(toBriefing(), content, ['sails', 'yoga', 'mob', 'toilet'], [])).toThrow(/unknown topic "yoga"/);
    expect(() => performBriefing(toBriefing(), content, topics, ['early_try', 'ten_bonus', 'decide_morning'])).toThrow(/at most 2/);
    expect(() => performBriefing(toBriefing(), content, topics, ['promise_taverna'])).toThrow(/cannot be said during briefing/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/setup.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
import { assertPhase, EngineError } from './errors';
import { appendLog } from './log';
import { sayDialogue } from './promises';
import { advanceClock, requireBoat, requireTemplate } from './state';
import { CHECKPOINTS, TRAINABLE_VOICES, type Boat, type CheckpointId, type Content, type CrewMember, type GameState, type Lang, type TrainableVoice } from './types';
import { initialVoices } from './voices';

export interface NewGameOptions { seed: number; lang: Lang; weatherTemplateId?: string; crewSize?: number }

function makeCrew(content: Content, size: number): CrewMember[] {
  const n = content.crew.length;
  return Array.from({ length: size }, (_, i) => {
    const a = content.crew[i % n]!;
    return { id: `crew_${i + 1}`, archetypeId: a.id, name: a.names[Math.floor(i / n) % a.names.length]! };
  });
}

export function newGame(content: Content, opts: NewGameOptions): GameState {
  const b = content.balance;
  const base = content.map.find((p) => p.kind === 'base');
  if (!base) throw new EngineError('CONTENT', 'Map has no base point');
  const template = opts.weatherTemplateId ? requireTemplate(content, opts.weatherTemplateId) : content.weather[0];
  if (!template) throw new EngineError('CONTENT', 'No weather templates');
  const crewSize = opts.crewSize ?? b.start.crewSize;
  if (!Number.isInteger(crewSize) || crewSize < 1) throw new EngineError('INVALID_INPUT', `crewSize must be a positive integer, got ${crewSize}`);
  return {
    version: 1, seed: opts.seed, rng: opts.seed >>> 0, lang: opts.lang, phase: 'captain', day: 0,
    clockMin: b.start.hour * 60, weatherTemplateId: template.id, locationId: base.id, boatId: null,
    voices: initialVoicesZero(),
    resources: { waterL: 0, fuelL: 0, serviceBankPct: b.start.serviceBankPct, starterBankPct: b.start.starterBankPct, gasPct: b.start.gasPct, moneyEur: b.start.moneyEur, mood: b.start.mood, fatigue: b.start.fatigue },
    flags: {}, damages: [], crew: makeCrew(content, crewSize), expectations: [], moodPerDay: 0, injuries: 0,
    log: [], firedEvents: [], eventQueue: [], weather: null, dayFacts: null, returnedOnTime: null,
  };
}

function initialVoicesZero(): GameState['voices'] {
  return { sea_sense: 0, caution: 0, order: 0, mechanic: 0, diplomat: 0, economist: 0, pride: 0, crew_voice: 0 };
}

export function assignVoices(state: GameState, content: Content, alloc: Partial<Record<TrainableVoice, number>>): GameState {
  assertPhase(state, 'captain');
  const voices = initialVoices(alloc, content.balance);
  const logged = TRAINABLE_VOICES.reduce((s, v) => appendLog(s, { kind: 'decision', cause: `voices:${v}:${voices[v]}` }), state);
  return { ...logged, voices, phase: 'boat_select' };
}

export function boatOffers(state: GameState, content: Content): Array<{ boat: Boat; affordable: boolean }> {
  return content.boats.map((boat) => ({ boat, affordable: boat.priceEur <= state.resources.moneyEur }));
}

export function chooseBoat(state: GameState, content: Content, boatId: string): GameState {
  assertPhase(state, 'boat_select');
  const boat = content.boats.find((b) => b.id === boatId);
  if (!boat) throw new EngineError('NOT_FOUND', `Boat "${boatId}" not found`);
  if (boat.priceEur > state.resources.moneyEur) throw new EngineError('BUDGET', `Cannot afford ${boat.id}: ${boat.priceEur} > ${state.resources.moneyEur}`);
  const s: GameState = {
    ...state,
    boatId: boat.id,
    phase: 'checkin',
    resources: { ...state.resources, moneyEur: state.resources.moneyEur - boat.priceEur, waterL: boat.waterTankL, fuelL: boat.fuelTankL },
  };
  return appendLog(s, { kind: 'decision', cause: `boat:choose:${boat.id}`, pillar: 'boat' });
}

function validateCheckpoints(checkpoints: readonly CheckpointId[], content: Content): number {
  const unknown = checkpoints.find((c) => !CHECKPOINTS.includes(c));
  if (unknown) throw new EngineError('INVALID_INPUT', `unknown checkpoint "${unknown}"`);
  if (new Set(checkpoints).size !== checkpoints.length) throw new EngineError('INVALID_INPUT', 'duplicate checkpoints');
  const cost = checkpoints.reduce((sum, c) => sum + content.balance.checkin.costMin[c], 0);
  if (cost > content.balance.checkin.budgetMin) {
    throw new EngineError('BUDGET', `Check-in takes ${cost} min, budget is ${content.balance.checkin.budgetMin} min`);
  }
  return cost;
}

export function performCheckin(state: GameState, content: Content, checkpoints: readonly CheckpointId[]): GameState {
  assertPhase(state, 'checkin');
  const boat = requireBoat(content, state);
  const cost = validateCheckpoints(checkpoints, content);
  const checked = new Set<CheckpointId>(checkpoints);
  let s = CHECKPOINTS.reduce((acc, cp) => appendLog(acc, { kind: 'decision', cause: `checkin:${checked.has(cp) ? 'check' : 'skip'}:${cp}`, pillar: 'boat' }), state);
  const flags: Record<string, boolean> = { ...s.flags };
  for (const cp of checked) flags[`checkin.${cp}`] = true;
  for (const d of boat.hiddenDefects) {
    const found = checked.has(d.checkpoint);
    flags[found ? `defect.${d.id}.found` : `defect.${d.id}`] = true;
    s = appendLog(s, { kind: 'info', cause: found ? `checkin:found:${d.id}` : `defect:hidden:${d.id}`, pillar: 'boat' });
  }
  return { ...advanceClock({ ...s, flags }, cost), phase: 'briefing' };
}

function validateTopics(topicIds: readonly string[], content: Content): void {
  const slots = content.balance.briefing.slots;
  if (topicIds.length !== slots || new Set(topicIds).size !== slots) {
    throw new EngineError('INVALID_INPUT', `Choose exactly ${slots} different briefing topics`);
  }
  const unknown = topicIds.find((id) => !content.briefing.some((t) => t.id === id));
  if (unknown) throw new EngineError('INVALID_INPUT', `unknown topic "${unknown}"`);
}

export function performBriefing(state: GameState, content: Content, topicIds: readonly string[], dialogueIds: readonly string[]): GameState {
  assertPhase(state, 'briefing');
  validateTopics(topicIds, content);
  const max = content.balance.briefing.maxDialogues;
  if (dialogueIds.length > max) throw new EngineError('INVALID_INPUT', `Say at most ${max} lines at the briefing`);
  const chosen = new Set(topicIds);
  let s = content.briefing.reduce(
    (acc, t) => appendLog(acc, { kind: 'decision', cause: `briefing:${chosen.has(t.id) ? 'topic' : 'skip'}:${t.id}`, pillar: 'briefing' }),
    state,
  );
  const flags = { ...s.flags };
  for (const id of chosen) flags[`briefing.${id}`] = true;
  s = { ...s, flags };
  s = dialogueIds.reduce((acc, id) => sayDialogue(acc, content, id, 'briefing'), s);
  return { ...s, phase: 'morning', day: 1, clockMin: content.balance.start.hour * 60 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/setup.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/setup.ts tests/engine/setup.test.ts
git commit -m "feat: add pre-week phases (captain, boat, check-in, briefing)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 14: Контент мира MVP (лодки, карта, маршруты, погода, экипаж, брифинг, манёвры)

**Files:**
- Create: `content/boats.json`, `content/map.json`, `content/routes.json`, `content/weather.json`, `content/crew.json`, `content/briefing.json`, `content/maneuvers.json`
- Test: `tests/content/world-content.test.ts`

**Interfaces:**
- Consumes: `parseContent` (T10), `content/balance.json` (T1).
- Produces: id, на которые опираются T15 и T18 (менять нельзя):
  - лодки `aurora_45` (блестящая: подрулька, большой плоттер, электрогальюны; **один общий банк**, танк 300 л на 8 мест), `meltemi_40` (скромная, но правильная: 450 л, 3×110 Ач + отдельный стартовый, солнце 200 Вт), `calypso_38` (дешёвая и старая)
  - дефекты `worn_impeller`, `toilet_valve`, `old_scratch`, `torn_genoa_seam`, `loose_anchor_shackle`, `gas_leak`
  - точки `base_marina`, `cala_azzurra`, `vela_bay`, `kastri_marina`, `nisi_quay`, `capo_rosso_bay`, `porto_lungo_marina`, `blue_lagoon`, `fjord_bay`
  - маршруты `r_<from>_<to>` (13 штук, таблица ниже)
  - шаблон погоды `meltemi_week`; архетипы `party_guest`, `keen_sailor`
  - темы брифинга `sails`, `cleats`, `fenders`, `captain_only`, `anchor`, `loaded_lines`, `toilet`, `mob`
  - манёвры `departure_med`, `mooring_med`, `anchoring_bay`, `anchor_up_bay`

Задача — дизайн-данные, а не код: каждая цифра здесь — это урок. Аврора соблазняет блестящим, но вода кончается на второй день, а общий банк сажает стартовый. Причал марины Порто-Лунго заканчивается в 14:00 (сложная «турецкая» марина), бухты на севере открыты мельтеми.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseContent } from '../../src/content/parse';

const read = (f: string): unknown => JSON.parse(readFileSync(`content/${f}.json`, 'utf8'));
const WORLD = ['boats', 'map', 'routes', 'weather', 'crew', 'briefing', 'maneuvers', 'balance'] as const;

function worldOnly() {
  const raw: Record<string, unknown> = Object.fromEntries(WORLD.map((f) => [f, read(f)]));
  return parseContent({ ...raw, events: [], dialogues: [], debrief: [] });
}

describe('world content', () => {
  it('validates (with empty narrative files)', () => {
    expect(worldOnly().errors).toEqual([]);
  });

  it('has the MVP scope from ТЗ 7.2', () => {
    const c = worldOnly().content!;
    expect(c.boats).toHaveLength(3);
    expect(c.map.length).toBeGreaterThanOrEqual(8);
    expect(c.map.length).toBeLessThanOrEqual(10);
    expect(c.weather).toHaveLength(1);
    expect(c.crew).toHaveLength(2);
    expect(c.briefing).toHaveLength(8);
  });

  it('encodes the newbie traps (ТЗ раздел 2)', () => {
    const c = worldOnly().content!;
    const aurora = c.boats.find((b) => b.id === 'aurora_45')!;
    const meltemi = c.boats.find((b) => b.id === 'meltemi_40')!;
    expect(aurora.shinyFeatures.length).toBeGreaterThan(meltemi.shinyFeatures.length);
    expect(aurora.waterTankL / aurora.berths).toBeLessThan(meltemi.waterTankL / meltemi.berths);
    expect(aurora.starterSeparate).toBe(false);
    expect(meltemi.starterSeparate).toBe(true);
    const porto = c.map.find((p) => p.id === 'porto_lungo_marina')!;
    expect(porto.placesGoneHour).toBeLessThan(15);
    expect(c.weather[0]!.days.find((d) => d.day === 3)!.frontChance).toBeGreaterThan(0.3);
  });

  it('route ids follow r_<from>_<to>', () => {
    const c = worldOnly().content!;
    for (const r of c.routes) expect(r.id).toBe(`r_${r.from}_${r.to}`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/world-content.test.ts`
Expected: FAIL — `ENOENT: content/boats.json`.

- [ ] **Step 3: Write `content/boats.json`**

```json
[
  {
    "id": "aurora_45",
    "name": { "ru": "Аврора 45", "en": "Aurora 45" },
    "lengthFt": 45, "cabins": 4, "berths": 8,
    "waterTankL": 300, "fuelTankL": 160,
    "serviceBankAh": 140, "serviceBanks": 1, "starterSeparate": false,
    "solarW": 0, "generator": false, "electricToilet": true, "bowThruster": true,
    "motorKn": 7, "hullSpeedKn": 8.2, "priceEur": 5200, "depositEur": 3000,
    "shinyFeatures": [
      { "ru": "Подруливающее устройство", "en": "Bow thruster" },
      { "ru": "Плоттер 12 дюймов с радаром", "en": "12-inch chartplotter with radar" },
      { "ru": "Электрические гальюны", "en": "Electric heads" },
      { "ru": "Аудиосистема в кокпите", "en": "Cockpit sound system" }
    ],
    "hiddenDefects": [
      { "id": "worn_impeller", "checkpoint": "impeller", "description": { "ru": "Импеллер забортной воды изношен", "en": "The raw-water impeller is worn" } },
      { "id": "toilet_valve", "checkpoint": "toilets", "description": { "ru": "Клапан носового гальюна подтекает", "en": "The forward head valve is leaking" } },
      { "id": "old_scratch", "checkpoint": "damage_photos", "description": { "ru": "Старая царапина на правом борту", "en": "An old scratch on the starboard side" }, "chargedOnReturn": "hull_scratch" }
    ]
  },
  {
    "id": "meltemi_40",
    "name": { "ru": "Мельтеми 40", "en": "Meltemi 40" },
    "lengthFt": 40, "cabins": 3, "berths": 6,
    "waterTankL": 450, "fuelTankL": 140,
    "serviceBankAh": 110, "serviceBanks": 3, "starterSeparate": true,
    "solarW": 200, "generator": false, "electricToilet": false, "bowThruster": false,
    "motorKn": 6.5, "hullSpeedKn": 7.6, "priceEur": 4300, "depositEur": 2500,
    "shinyFeatures": [
      { "ru": "Новый бимини", "en": "New bimini" }
    ],
    "hiddenDefects": [
      { "id": "torn_genoa_seam", "checkpoint": "sails", "description": { "ru": "Шов на генуе расходится у шкотового угла", "en": "The genoa seam is opening near the clew" } },
      { "id": "loose_anchor_shackle", "checkpoint": "anchor", "description": { "ru": "Скоба якоря не законтрена", "en": "The anchor shackle is not moused" } }
    ]
  },
  {
    "id": "calypso_38",
    "name": { "ru": "Калипсо 38", "en": "Calypso 38" },
    "lengthFt": 38, "cabins": 3, "berths": 6,
    "waterTankL": 330, "fuelTankL": 120,
    "serviceBankAh": 90, "serviceBanks": 2, "starterSeparate": true,
    "solarW": 0, "generator": false, "electricToilet": false, "bowThruster": false,
    "motorKn": 6, "hullSpeedKn": 7.2, "priceEur": 3400, "depositEur": 2000,
    "shinyFeatures": [
      { "ru": "Стереосистема", "en": "Stereo" },
      { "ru": "Тиковая палуба", "en": "Teak deck" }
    ],
    "hiddenDefects": [
      { "id": "gas_leak", "checkpoint": "gas", "description": { "ru": "Шланг газа к плите потрескался", "en": "The stove gas hose is cracked" } },
      { "id": "worn_impeller", "checkpoint": "impeller", "description": { "ru": "Импеллер забортной воды изношен", "en": "The raw-water impeller is worn" } },
      { "id": "old_scratch", "checkpoint": "damage_photos", "description": { "ru": "Скол гелькоута на носу", "en": "A gelcoat chip on the bow" }, "chargedOnReturn": "hull_scratch" }
    ]
  }
]
```

- [ ] **Step 4: Write `content/map.json`**

Координаты в милях (x — восток, y — север). Мельтеми дует с NW; фронт сдвигает ветер на NE.

```json
[
  { "id": "base_marina", "name": { "ru": "Марина Порто-Кало (база)", "en": "Porto Calo Marina (base)" }, "kind": "base", "x": 0, "y": 0, "seabed": "mud", "depthM": 4,
    "shelter": { "N": 0.9, "NE": 0.9, "E": 0.9, "SE": 0.9, "S": 0.9, "SW": 0.9, "W": 0.9, "NW": 0.9 },
    "priceEur": 0, "placesGoneHour": null,
    "services": { "water": true, "fuel": true, "shorePower": true, "gas": true, "taverna": true, "beach": false } },
  { "id": "cala_azzurra", "name": { "ru": "Кала-Адзурра", "en": "Cala Azzurra" }, "kind": "bay", "x": 4, "y": 6, "seabed": "sand", "depthM": 6,
    "shelter": { "N": 0.9, "NE": 0.6, "E": 0.4, "SE": 0.2, "S": 0.2, "SW": 0.5, "W": 0.9, "NW": 0.9 },
    "priceEur": 0, "placesGoneHour": null,
    "services": { "water": false, "fuel": false, "shorePower": false, "gas": false, "taverna": false, "beach": true } },
  { "id": "vela_bay", "name": { "ru": "Бухта Вела", "en": "Vela Bay" }, "kind": "bay", "x": -6, "y": 10, "seabed": "weed", "depthM": 8,
    "shelter": { "N": 0.2, "NE": 0.7, "E": 0.9, "SE": 0.9, "S": 0.8, "SW": 0.5, "W": 0.3, "NW": 0.1 },
    "priceEur": 0, "placesGoneHour": null,
    "services": { "water": false, "fuel": false, "shorePower": false, "gas": false, "taverna": true, "beach": true } },
  { "id": "kastri_marina", "name": { "ru": "Марина Кастри", "en": "Kastri Marina" }, "kind": "marina", "x": 2, "y": 16, "seabed": "mud", "depthM": 5,
    "shelter": { "N": 0.95, "NE": 0.95, "E": 0.95, "SE": 0.95, "S": 0.95, "SW": 0.95, "W": 0.95, "NW": 0.95 },
    "priceEur": 85, "placesGoneHour": 15,
    "services": { "water": true, "fuel": true, "shorePower": true, "gas": true, "taverna": true, "beach": false } },
  { "id": "nisi_quay", "name": { "ru": "Городская набережная Ниси", "en": "Nisi Town Quay" }, "kind": "quay", "x": 10, "y": 12, "seabed": "sand", "depthM": 4,
    "shelter": { "N": 0.7, "NE": 0.3, "E": 0.4, "SE": 0.7, "S": 0.7, "SW": 0.7, "W": 0.7, "NW": 0.7 },
    "priceEur": 40, "placesGoneHour": 16,
    "services": { "water": true, "fuel": false, "shorePower": true, "gas": false, "taverna": true, "beach": false } },
  { "id": "capo_rosso_bay", "name": { "ru": "Бухта Капо-Россо", "en": "Capo Rosso Bay" }, "kind": "bay", "x": 14, "y": 4, "seabed": "sand", "depthM": 7,
    "shelter": { "N": 0.8, "NE": 0.7, "E": 0.3, "SE": 0.1, "S": 0.1, "SW": 0.4, "W": 0.7, "NW": 0.8 },
    "priceEur": 0, "placesGoneHour": null,
    "services": { "water": false, "fuel": false, "shorePower": false, "gas": false, "taverna": false, "beach": true } },
  { "id": "porto_lungo_marina", "name": { "ru": "Марина Порто-Лунго", "en": "Porto Lungo Marina" }, "kind": "marina", "x": 12, "y": -6, "seabed": "mud", "depthM": 5,
    "shelter": { "N": 0.9, "NE": 0.9, "E": 0.9, "SE": 0.9, "S": 0.9, "SW": 0.9, "W": 0.9, "NW": 0.9 },
    "priceEur": 110, "placesGoneHour": 14,
    "services": { "water": true, "fuel": true, "shorePower": true, "gas": true, "taverna": true, "beach": false } },
  { "id": "blue_lagoon", "name": { "ru": "Голубая лагуна", "en": "Blue Lagoon" }, "kind": "bay", "x": -4, "y": -8, "seabed": "rock", "depthM": 5,
    "shelter": { "N": 0.95, "NE": 0.95, "E": 0.95, "SE": 0.7, "S": 0.6, "SW": 0.95, "W": 0.95, "NW": 0.95 },
    "priceEur": 0, "placesGoneHour": null,
    "services": { "water": false, "fuel": false, "shorePower": false, "gas": false, "taverna": false, "beach": true } },
  { "id": "fjord_bay", "name": { "ru": "Фьорд Скрадин", "en": "Skradin Fjord" }, "kind": "bay", "x": 6, "y": 24, "seabed": "mud", "depthM": 12,
    "shelter": { "N": 0.6, "NE": 0.3, "E": 0.5, "SE": 0.9, "S": 0.9, "SW": 0.9, "W": 0.9, "NW": 0.9 },
    "priceEur": 0, "placesGoneHour": null,
    "services": { "water": false, "fuel": false, "shorePower": false, "gas": false, "taverna": true, "beach": false } }
]
```

- [ ] **Step 5: Write `content/routes.json`**

| id | from | to | distanceNm | kLocal | features |
|---|---|---|---|---|---|
| r_base_marina_cala_azzurra | base_marina | cala_azzurra | 7.2 | 1.0 | open |
| r_base_marina_blue_lagoon | base_marina | blue_lagoon | 8.9 | 1.0 | open |
| r_base_marina_porto_lungo_marina | base_marina | porto_lungo_marina | 13.4 | 1.3 | strait |
| r_cala_azzurra_kastri_marina | cala_azzurra | kastri_marina | 10.2 | 1.2 | gulf |
| r_cala_azzurra_nisi_quay | cala_azzurra | nisi_quay | 8.5 | 1.0 | open |
| r_cala_azzurra_vela_bay | cala_azzurra | vela_bay | 10.8 | 1.0 | open |
| r_vela_bay_kastri_marina | vela_bay | kastri_marina | 10.0 | 1.0 | open |
| r_vela_bay_blue_lagoon | vela_bay | blue_lagoon | 18.1 | 1.0 | open |
| r_kastri_marina_fjord_bay | kastri_marina | fjord_bay | 8.9 | 1.4 | cape |
| r_kastri_marina_nisi_quay | kastri_marina | nisi_quay | 8.9 | 1.2 | gulf |
| r_nisi_quay_capo_rosso_bay | nisi_quay | capo_rosso_bay | 8.9 | 1.4 | cape |
| r_nisi_quay_fjord_bay | nisi_quay | fjord_bay | 12.6 | 1.3 | strait |
| r_capo_rosso_bay_porto_lungo_marina | capo_rosso_bay | porto_lungo_marina | 10.2 | 1.5 | gulf |

Запиши таблицу как JSON-массив объектов `{ "id", "from", "to", "distanceNm", "kLocal", "features": ["…"] }`, ровно 13 элементов в этом порядке. Пример первой строки:

```json
{ "id": "r_base_marina_cala_azzurra", "from": "base_marina", "to": "cala_azzurra", "distanceNm": 7.2, "kLocal": 1.0, "features": ["open"] }
```

- [ ] **Step 6: Write `content/weather.json`**

```json
[
  {
    "id": "meltemi_week",
    "name": { "ru": "Неделя мельтеми", "en": "Meltemi week" },
    "afternoonFactor": 1.25,
    "days": [
      { "day": 1, "windKn": 12, "gustKn": 18, "dir": "NW", "frontChance": 0.05, "barometerHpa": 1014 },
      { "day": 2, "windKn": 14, "gustKn": 20, "dir": "NW", "frontChance": 0.1, "barometerHpa": 1013 },
      { "day": 3, "windKn": 16, "gustKn": 24, "dir": "NW", "frontChance": 0.45, "barometerHpa": 1010 },
      { "day": 4, "windKn": 15, "gustKn": 22, "dir": "NW", "frontChance": 0.4, "barometerHpa": 1009 },
      { "day": 5, "windKn": 13, "gustKn": 19, "dir": "NW", "frontChance": 0.15, "barometerHpa": 1012 },
      { "day": 6, "windKn": 14, "gustKn": 21, "dir": "NW", "frontChance": 0.2, "barometerHpa": 1013 }
    ]
  }
]
```

- [ ] **Step 7: Write `content/crew.json`**

```json
[
  {
    "id": "party_guest",
    "name": { "ru": "Гость-отпускник", "en": "Holiday guest" },
    "names": [ { "ru": "Аня", "en": "Anya" }, { "ru": "Олег", "en": "Oleg" }, { "ru": "Света", "en": "Sveta" } ],
    "wishes": ["taverna", "beach", "swim", "rest"],
    "seasickness": 0.35, "patience": 0.4, "promiseSensitivity": 1.2
  },
  {
    "id": "keen_sailor",
    "name": { "ru": "Яхтсмен-энтузиаст", "en": "Keen sailor" },
    "names": [ { "ru": "Ира", "en": "Ira" }, { "ru": "Макс", "en": "Max" }, { "ru": "Денис", "en": "Denis" } ],
    "wishes": ["sailing", "early_start"],
    "seasickness": 0.1, "patience": 0.7, "promiseSensitivity": 0.8
  }
]
```

- [ ] **Step 8: Write `content/briefing.json`**

```json
[
  { "id": "sails", "title": { "ru": "Настройка парусов", "en": "Sail trim" }, "description": { "ru": "Как работают шкоты и где стоит каретка.", "en": "How the sheets work and where the car goes." } },
  { "id": "cleats", "title": { "ru": "Швартовы и утка", "en": "Lines and cleats" }, "description": { "ru": "Как закладывать конец на утку и держать его под нагрузкой.", "en": "How to make a line fast on a cleat and hold it under load." } },
  { "id": "fenders", "title": { "ru": "Кранцы", "en": "Fenders" }, "description": { "ru": "На какой высоте вешать кранцы и когда их убирать.", "en": "How high to hang fenders and when to stow them." } },
  { "id": "captain_only", "title": { "ru": "Слушаем только капитана", "en": "Only the skipper gives orders" }, "description": { "ru": "Маринер кричит — экипаж ждёт команды капитана.", "en": "The marinero shouts; the crew waits for the skipper." } },
  { "id": "anchor", "title": { "ru": "Работа с якорем", "en": "Anchor work" }, "description": { "ru": "Знаки руками на баке, сколько травить цепи.", "en": "Hand signals at the bow and how much chain to let out." } },
  { "id": "loaded_lines", "title": { "ru": "Безопасность и нагруженные концы", "en": "Safety and loaded lines" }, "description": { "ru": "Нагруженный конец не держат руками; сначала оборот на лебёдку.", "en": "Never hold a loaded line by hand; take a turn on the winch first." } },
  { "id": "toilet", "title": { "ru": "Гальюн и вода", "en": "Heads and water" }, "description": { "ru": "Что нельзя бросать в гальюн и как экономить воду в душе.", "en": "What never goes in the head and how to save water in the shower." } },
  { "id": "mob", "title": { "ru": "Человек за бортом", "en": "Man overboard" }, "description": { "ru": "Кто показывает рукой, кто бросает круг, кто жмёт MOB.", "en": "Who points, who throws the ring, who presses MOB." } }
]
```

- [ ] **Step 9: Write `content/maneuvers.json`**

Шаги перечислены в **правильном** порядке. `wrongIf.first` поставлен раньше `wrongIf.then` → ошибка.

```json
[
  {
    "id": "departure_med", "kind": "departure", "title": { "ru": "Отход от причала кормой", "en": "Leaving a stern-to berth" },
    "steps": [
      { "id": "check_neutral", "text": { "ru": "Рычаг в нейтраль, двигатель прогрет", "en": "Throttle in neutral, engine warm" } },
      { "id": "brief_roles", "text": { "ru": "Команда рулевому и экипажу: кто что отдаёт", "en": "Brief helm and crew: who releases what" } },
      { "id": "drop_mooring", "text": { "ru": "Отдать муринг и дождаться, пока он утонет", "en": "Drop the lazy line and let it sink" } },
      { "id": "release_stern", "text": { "ru": "Отдать кормовые по команде", "en": "Release stern lines on command" } },
      { "id": "engage_ahead", "text": { "ru": "Малый вперёд", "en": "Slow ahead" } }
    ],
    "errors": [
      { "id": "mooring_before_neutral", "wrongIf": { "first": "drop_mooring", "then": "check_neutral" }, "effect": { "damage": "prop_line", "mood": -5 }, "injuryChance": 0, "text": { "ru": "Муринг намотался на винт", "en": "The lazy line wrapped the prop" } },
      { "id": "release_before_brief", "wrongIf": { "first": "release_stern", "then": "brief_roles" }, "effect": { "mood": -6, "fatigue": 6 }, "injuryChance": 0.2, "mitigatedBy": "briefing.loaded_lines", "text": { "ru": "Кормовой вырвало из рук", "en": "A stern line was ripped from someone's hands" } },
      { "id": "release_before_mooring", "wrongIf": { "first": "release_stern", "then": "drop_mooring" }, "effect": { "damage": "hull_scratch", "mood": -8 }, "injuryChance": 0.05, "mitigatedBy": "briefing.captain_only", "text": { "ru": "Корму повело на соседа", "en": "The stern swung into the neighbour" } },
      { "id": "gear_before_mooring_sinks", "wrongIf": { "first": "engage_ahead", "then": "drop_mooring" }, "effect": { "damage": "prop_line", "mood": -6 }, "injuryChance": 0, "text": { "ru": "Пошли вперёд с мурингом под винтом", "en": "Went ahead with the lazy line under the prop" } }
    ]
  },
  {
    "id": "mooring_med", "kind": "mooring", "title": { "ru": "Швартовка кормой", "en": "Stern-to mooring" },
    "steps": [
      { "id": "fenders_ready", "text": { "ru": "Кранцы на высоте причала", "en": "Fenders at dock height" } },
      { "id": "brief_roles", "text": { "ru": "Роли: корма, муринг, багор", "en": "Roles: stern lines, lazy line, boat hook" } },
      { "id": "stern_lines_ashore", "text": { "ru": "Подать кормовые маринеру", "en": "Pass stern lines to the marinero" } },
      { "id": "cleat_stern", "text": { "ru": "Заложить кормовые на утку", "en": "Make the stern lines fast" } },
      { "id": "pick_mooring", "text": { "ru": "Выбрать и натянуть муринг", "en": "Pick up and tension the lazy line" } }
    ],
    "errors": [
      { "id": "lines_before_brief", "wrongIf": { "first": "stern_lines_ashore", "then": "brief_roles" }, "effect": { "mood": -5, "fatigue": 5 }, "injuryChance": 0.15, "mitigatedBy": "briefing.captain_only", "text": { "ru": "Экипаж слушал маринера, а не капитана", "en": "The crew followed the marinero, not the skipper" } },
      { "id": "mooring_before_cleat", "wrongIf": { "first": "pick_mooring", "then": "cleat_stern" }, "effect": { "fatigue": 8 }, "injuryChance": 0.25, "mitigatedBy": "briefing.cleats", "text": { "ru": "Кормовой поехал по утке и обжёг ладони", "en": "The stern line ran over the cleat and burned palms" } },
      { "id": "no_fenders_first", "wrongIf": { "first": "stern_lines_ashore", "then": "fenders_ready" }, "effect": { "damage": "hull_scratch", "mood": -6 }, "injuryChance": 0, "text": { "ru": "Борт прошёлся по соседу без кранцев", "en": "The hull rubbed the neighbour with no fenders" } }
    ]
  },
  {
    "id": "anchoring_bay", "kind": "anchoring", "title": { "ru": "Постановка на якорь", "en": "Anchoring" },
    "steps": [
      { "id": "choose_spot", "text": { "ru": "Выбрать место: глубина, грунт, радиус", "en": "Pick a spot: depth, seabed, swing radius" } },
      { "id": "brief_bow", "text": { "ru": "Команда на бак: сколько цепи, знаки руками", "en": "Brief the bow: chain length, hand signals" } },
      { "id": "stop_boat", "text": { "ru": "Остановить лодку носом к ветру", "en": "Stop the boat head to wind" } },
      { "id": "drop_anchor", "text": { "ru": "Отдать якорь", "en": "Drop the anchor" } },
      { "id": "back_down", "text": { "ru": "Отработать задним, натянуть цепь", "en": "Back down to set the chain" } }
    ],
    "errors": [
      { "id": "drop_before_stop", "wrongIf": { "first": "drop_anchor", "then": "stop_boat" }, "effect": { "time_hours": 0.5, "fatigue": 8 }, "injuryChance": 0, "text": { "ru": "Цепь легла кучей на якорь", "en": "The chain piled on top of the anchor" } },
      { "id": "drop_before_brief", "wrongIf": { "first": "drop_anchor", "then": "brief_bow" }, "effect": { "fatigue": 5, "mood": -3 }, "injuryChance": 0.1, "mitigatedBy": "briefing.anchor", "text": { "ru": "На баке не поняли знаков, цепь ушла рывком", "en": "The bow missed the signals; the chain ran out with a jerk" } },
      { "id": "drop_before_spot", "wrongIf": { "first": "drop_anchor", "then": "choose_spot" }, "effect": { "time_hours": 0.5, "mood": -4 }, "injuryChance": 0, "text": { "ru": "Встали слишком близко к соседу, переставляемся", "en": "Too close to a neighbour; re-anchoring" } }
    ]
  },
  {
    "id": "anchor_up_bay", "kind": "anchor_up", "title": { "ru": "Съёмка с якоря", "en": "Weighing anchor" },
    "steps": [
      { "id": "engine_on", "text": { "ru": "Завести двигатель", "en": "Start the engine" } },
      { "id": "brief_bow", "text": { "ru": "Команда на бак: знаки руками", "en": "Brief the bow: hand signals" } },
      { "id": "motor_to_anchor", "text": { "ru": "Подработать мотором к якорю", "en": "Motor up towards the anchor" } },
      { "id": "raise_anchor", "text": { "ru": "Выбирать цепь брашпилем", "en": "Raise the chain with the windlass" } }
    ],
    "errors": [
      { "id": "raise_before_motor", "wrongIf": { "first": "raise_anchor", "then": "motor_to_anchor" }, "effect": { "fatigue": 8, "mood": -3 }, "injuryChance": 0.1, "mitigatedBy": "briefing.anchor", "text": { "ru": "Брашпиль тащит лодку на якорь и перегревается", "en": "The windlass drags the boat and overheats" } },
      { "id": "raise_before_engine", "wrongIf": { "first": "raise_anchor", "then": "engine_on" }, "effect": { "damage": "hull_scratch", "mood": -8 }, "injuryChance": 0.05, "text": { "ru": "Без хода лодку сдуло на камни", "en": "With no way on, the boat was blown onto the rocks" } }
    ]
  }
]
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `npx vitest run tests/content/world-content.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add content/boats.json content/map.json content/routes.json content/weather.json content/crew.json content/briefing.json content/maneuvers.json tests/content/world-content.test.ts
git commit -m "feat: add MVP world content (boats, archipelago, weather, crew, maneuvers)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 15: Нарративный контент MVP (30 событий, диалоги, правила разбора)

**Files:**
- Create: `content/events.json`, `content/dialogues.json`, `content/debrief.json`
- Test: `tests/content/narrative-content.test.ts`

**Interfaces:**
- Consumes: id из T14 (точки, дефекты, темы брифинга, архетипы, damage-id из `balance.json`); словарь причин лога (раздел «Контракты»); `loadContentDir` (T10); `validateConditions` (T12). **Мержить после T12**, потому что полная валидация включает условия.
- Produces: `events.json` (30), `dialogues.json` (8), `debrief.json` (20). T18 опирается на диалоги `early_try`, `ten_bonus`, `decide_morning`, `promise_taverna`.

**Правила контента** (обязательны для каждого события):
- `options[0]` — интуитивный выбор новичка (стратегия `newbie` в T18 всегда берёт первый доступный).
- Минимум одна реплика голоса. Ложные голоса (`pride`, `economist`) толкают к риску или экономии.
- `text` — 1–3 предложения в настоящем времени, конкретно и телесно (Disco Elysium: «Ключ. Щелчок. Тишина.»). EN — естественный перевод, не калька; `ru !== en`.
- `debrief` — одна фраза «что было причиной», без морали.
- Тексты вариантов ниже даны на RU; EN напиши сам.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import { PILLARS } from '../../src/engine/types';

const CAUSE_ROOTS = ['voices', 'boat', 'checkin', 'defect', 'briefing', 'dialogue', 'barometer', 'signal', 'plan', 'order', 'leg', 'weather', 'engine', 'zero', 'consumption', 'sail', 'injury', 'maneuver', 'anchor', 'marina', 'activity', 'rest', 'fatigue', 'event', 'choice', 'promise', 'charge', 'refill', 'mood_per_day', 'night', 'return', 'deposit'];

const { content, errors } = await loadContentDir('content');

describe('narrative content', () => {

  it('whole content directory validates', () => {
    expect(errors).toEqual([]);
  });

  it('25–30 events, at least 3 per pillar (ТЗ 7.2)', () => {
    const events = content!.events;
    expect(events.length).toBeGreaterThanOrEqual(25);
    expect(events.length).toBeLessThanOrEqual(30);
    for (const p of PILLARS) expect(events.filter((e) => e.pillar === p).length, p).toBeGreaterThanOrEqual(3);
  });

  it('every event has a voice line and a real translation', () => {
    for (const e of content!.events) {
      expect(e.voices.length, e.id).toBeGreaterThanOrEqual(1);
      expect(e.text.ru, e.id).not.toBe(e.text.en);
    }
  });

  it('dialogues match the ТЗ 4.7 table', () => {
    const d = (id: string) => content!.dialogues.find((x) => x.id === id)!;
    expect([d('early_try').strength, d('ten_bonus').strength, d('decide_morning').strength]).toEqual([0.9, 0.6, 0.2]);
    expect(d('promise_taverna').contexts).toContain('evening');
  });

  it('debrief rules reference known log cause roots', () => {
    for (const r of content!.debrief) {
      for (const pattern of [r.decision, r.consequence, ...(r.signal ? [r.signal] : [])]) {
        expect(CAUSE_ROOTS, `${r.id}: ${pattern}`).toContain(pattern.split(':')[0]);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/narrative-content.test.ts`
Expected: FAIL — `Cannot read events.json`.

- [ ] **Step 3: Write `content/dialogues.json`**

```json
[
  { "id": "early_try", "contexts": ["briefing", "morning", "evening"], "strength": 0.9, "expectation": { "kind": "depart_by", "hour": 8 },
    "said": { "ru": "Постараемся выйти пораньше", "en": "We'll try to leave early" }, "heard": { "ru": "Выходим в 8", "en": "We leave at 8" } },
  { "id": "ten_bonus", "contexts": ["briefing", "evening"], "strength": 0.6, "expectation": { "kind": "depart_by", "hour": 10 },
    "said": { "ru": "Выходим в 10, если получится раньше — бонус", "en": "We leave at 10; if it's earlier, that's a bonus" }, "heard": { "ru": "Выходим в 10", "en": "We leave at 10" } },
  { "id": "decide_morning", "contexts": ["briefing", "morning", "evening"], "strength": 0.2, "expectation": { "kind": "none" },
    "said": { "ru": "Решим утром по погоде", "en": "We'll decide in the morning, depending on the weather" }, "heard": { "ru": "Пока неясно", "en": "Nothing is decided yet" } },
  { "id": "promise_taverna", "contexts": ["evening"], "strength": 0.7, "expectation": { "kind": "activity", "activity": "taverna" },
    "said": { "ru": "Завтра ужинаем в таверне", "en": "Tomorrow we dine at a taverna" }, "heard": { "ru": "Завтра точно таверна", "en": "Taverna tomorrow, guaranteed" } },
  { "id": "maybe_taverna", "contexts": ["evening"], "strength": 0.3, "expectation": { "kind": "activity", "activity": "taverna" },
    "said": { "ru": "Если дойдём до города — можно в таверну", "en": "If we reach a town, maybe a taverna" }, "heard": { "ru": "Может быть, таверна", "en": "Maybe a taverna" } },
  { "id": "swim_tomorrow", "contexts": ["morning", "evening"], "strength": 0.6, "expectation": { "kind": "activity", "activity": "swim" },
    "said": { "ru": "Обязательно искупаемся", "en": "We'll definitely have a swim" }, "heard": { "ru": "Купаемся точно", "en": "Swimming is guaranteed" } },
  { "id": "marina_tomorrow", "contexts": ["evening"], "strength": 0.7, "expectation": { "kind": "arrive_at_kind", "pointKind": "marina" },
    "said": { "ru": "Завтра ночуем в марине, будет душ", "en": "Tomorrow night in a marina, with showers" }, "heard": { "ru": "Завтра марина и душ", "en": "Marina and showers tomorrow" } },
  { "id": "beach_week", "contexts": ["briefing"], "strength": 0.8, "expectation": { "kind": "activity", "activity": "beach" },
    "said": { "ru": "Пляжей будет много", "en": "There'll be plenty of beaches" }, "heard": { "ru": "Завтра пляж", "en": "Beach tomorrow" } }
]
```

- [ ] **Step 4: Write `content/debrief.json`**

```json
[
  { "id": "injury_loaded_lines", "pillar": "safety", "priority": 10, "decision": "briefing:skip:loaded_lines", "consequence": "injury",
    "text": { "ru": "На брифинге не было темы «нагруженные концы» → гость взялся за нагруженный конец и травмировался.", "en": "No briefing on loaded lines → a guest grabbed a loaded line and got hurt." } },
  { "id": "injury_cleats", "pillar": "safety", "priority": 9, "decision": "briefing:skip:cleats", "consequence": "injury",
    "text": { "ru": "Экипаж не учили работать с уткой → конец хватали руками.", "en": "The crew never learned cleats → lines were grabbed by hand." } },
  { "id": "maneuver_order", "pillar": "safety", "priority": 8, "decision": "order:wrong", "consequence": "maneuver",
    "text": { "ru": "Порядок команд на манёвре был нарушен → лодка поплатилась на причале.", "en": "Commands came in the wrong order → the boat paid for it at the dock." } },
  { "id": "barometer_ignored", "pillar": "weather", "priority": 8, "decision": "barometer:ignored", "consequence": "sail:break", "signal": "signal:local_warning",
    "text": { "ru": "Барометр утром не открывали, местных не послушали → фронт порвал парус.", "en": "Nobody checked the barometer or listened to the locals → the front tore the sail." } },
  { "id": "full_sails_front", "pillar": "weather", "priority": 7, "decision": "plan:reefs:0", "consequence": "sail:reef_underway", "signal": "signal:front",
    "text": { "ru": "Вышли без рифов в день фронта → рифились в пути, на волне и в спешке.", "en": "Left unreefed on a front day → reefed underway, in a hurry, in the waves." } },
  { "id": "shared_bank", "pillar": "boat", "priority": 7, "decision": "boat:choose:aurora_45", "consequence": "zero:starter",
    "text": { "ru": "Выбрали лодку за подрульку и плоттер → у неё один аккумулятор на всё, утром не завелись.", "en": "Chose the boat for its thruster and plotter → one battery for everything, no start in the morning." } },
  { "id": "shared_bank_event", "pillar": "boat", "priority": 6, "decision": "boat:choose:aurora_45", "consequence": "event:dead_starter_morning",
    "text": { "ru": "Общий банк: ночной холодильник съел заряд стартера.", "en": "Shared bank: the fridge drained the starter overnight." } },
  { "id": "loose_shower", "pillar": "boat", "priority": 6, "decision": "plan:shower:loose", "consequence": "zero:water", "signal": "event:water_low_warning",
    "text": { "ru": "Душ без ограничений → танк пуст посреди недели.", "en": "Unlimited showers → an empty tank by midweek." } },
  { "id": "gas_unchecked", "pillar": "boat", "priority": 6, "decision": "checkin:skip:gas", "consequence": "event:gas_smell",
    "text": { "ru": "Газ не проверили на приёмке → утечка нашлась у открытого огня.", "en": "Gas skipped at check-in → the leak was found next to an open flame." } },
  { "id": "toilet_unchecked", "pillar": "boat", "priority": 5, "decision": "checkin:skip:toilets", "consequence": "event:toilet_clog",
    "text": { "ru": "Не проверили гальюны → засор на третий день.", "en": "Heads unchecked → a clog on day three." } },
  { "id": "impeller_unchecked", "pillar": "boat", "priority": 5, "decision": "checkin:skip:impeller", "consequence": "event:impeller_overheat",
    "text": { "ru": "Импеллер не смотрели → двигатель перегрелся на переходе.", "en": "Impeller unchecked → the engine overheated mid-passage." } },
  { "id": "photos_unchecked", "pillar": "boat", "priority": 5, "decision": "checkin:skip:damage_photos", "consequence": "deposit:unrecorded",
    "text": { "ru": "Не сфотографировали старые повреждения → их списали с вашего депозита.", "en": "No photos of old damage → it came out of your deposit." } },
  { "id": "busy_route_refused", "pillar": "time", "priority": 6, "decision": "plan:route:busy", "consequence": "marina:refused",
    "text": { "ru": "Насыщенный маршрут → пришли поздно, мест в марине не осталось.", "en": "Packed route → arrived late, no berths left." } },
  { "id": "busy_route_dusk", "pillar": "time", "priority": 4, "decision": "plan:route:busy", "consequence": "event:sunset_arrival",
    "text": { "ru": "Слишком много точек за день → швартовка в сумерках.", "en": "Too many stops in a day → mooring at dusk." } },
  { "id": "late_departure_refused", "pillar": "time", "priority": 5, "decision": "plan:depart:late", "consequence": "marina:refused",
    "text": { "ru": "Поздний выход → поздний приход → отказ в марине.", "en": "Late start → late arrival → turned away from the marina." } },
  { "id": "early_promise", "pillar": "promises", "priority": 7, "decision": "dialogue:early_try", "consequence": "promise:early_try:broken",
    "text": { "ru": "«Постараемся пораньше» экипаж услышал как «в восемь» → сорванное обещание.", "en": "\"We'll try to leave early\" was heard as \"at eight\" → a broken promise." } },
  { "id": "taverna_promise", "pillar": "promises", "priority": 5, "decision": "dialogue:promise_taverna", "consequence": "promise:promise_taverna:broken",
    "text": { "ru": "Пообещали таверну, а встали в пустой бухте.", "en": "Promised a taverna, anchored in an empty bay." } },
  { "id": "captain_only", "pillar": "briefing", "priority": 5, "decision": "briefing:skip:captain_only", "consequence": "event:marinero_commands",
    "text": { "ru": "Не договорились «слушаем только капитана» → экипаж работал на маринера.", "en": "No \"skipper's orders only\" rule → the crew worked for the marinero." } },
  { "id": "autopilot_drain", "pillar": "boat", "priority": 4, "decision": "plan:autopilot:on", "consequence": "zero:service",
    "text": { "ru": "Автопилот весь день без зарядки → сервисный банк в ноль.", "en": "Autopilot all day with no charging → a flat service bank." } },
  { "id": "sails_unchecked", "pillar": "boat", "priority": 4, "decision": "checkin:skip:sails", "consequence": "event:genoa_seam_rip",
    "text": { "ru": "Паруса не осмотрели → расходящийся шов порвался под ветром.", "en": "Sails not inspected → the opening seam tore in the wind." } }
]
```

- [ ] **Step 5: Write `content/events.json` — 30 событий**

Формат спецификации ниже (переведи каждый блок в объект `GameEvent`):

```
<id> · pillar · phase · chance · scene
  conditions: [...]                      → trigger.conditions
  text: «…»                              → text.ru (EN переведи)
  voice <voiceId> ≥<min_level>: «…»      → voices[]
  [n] <optionId> «…»: {effects}          → options[n] с effects
  [n] <optionId> «…»: check <voice> <difficulty> → success {…} / fail {…}
  [n] … requires [...]                   → options[n].requires
  debrief: «…»
```

Первый блок как образец, в полном JSON (остальные оформи так же):

```json
{
  "id": "toilet_clog", "pillar": "boat",
  "trigger": { "phase": "evening", "conditions": ["day >= 3", "!checkin.toilets", "!briefing.toilet"], "chance": 0.35 },
  "scene": "cabin_night",
  "text": { "ru": "Из носового гальюна доносится крик. Насос не качает.", "en": "A shout from the forward head. The pump won't move." },
  "voices": [ { "voice": "mechanic", "min_level": 2, "text": { "ru": "Клапан забит. Это час работы и перчатки.", "en": "Valve's clogged. An hour of work and gloves." } } ],
  "options": [
    { "id": "fix_self", "text": { "ru": "Чинить самому", "en": "Fix it yourself" }, "check": { "voice": "mechanic", "difficulty": 2 }, "success": { "fatigue": 15, "mood": 5 }, "fail": { "fatigue": 25, "mood": -10, "damage": "toilet_broken" } },
    { "id": "call_base", "text": { "ru": "Звонить на базу", "en": "Call the base" }, "effects": { "money": -80, "time_hours": 4 } },
    { "id": "endure", "text": { "ru": "Терпеть до марины", "en": "Put up with it until the marina" }, "effects": { "mood_per_day": -8 } }
  ],
  "debrief": { "ru": "Гальюны не проверены на приёмке и не было брифинга по их использованию.", "en": "Heads were not checked at check-in and the crew got no briefing on them." }
}
```

**Лодка (9)**

```
toilet_clog · boat · evening · 0.35 · cabin_night            (образец выше)

impeller_overheat · boat · passage · 0.5 · engine_bay
  conditions: ["defect.worn_impeller"]
  text: «Сигнал перегрева. Из выхлопа валит пар, а воды почти нет.»
  voice mechanic ≥1: «Импеллер. Его надо было смотреть на приёмке.»
  voice pride ≥1: «Дотянем. Не позорься перед гостями.»
  [0] keep_motoring «Идти дальше на моторе»: {damage:"impeller", mood:-5, time_hours:1}
  [1] change_impeller «Встать и поменять импеллер»: check mechanic 2 → success {time_hours:0.75, fatigue:10} / fail {time_hours:1.5, fatigue:15, money:-150}
  [2] sail_on «Заглушить и идти под парусом»: {time_hours:1, mood:-2}
  debrief: «Импеллер не проверили на приёмке — двигатель перегрелся на переходе.»

warm_fridge · boat · evening · 0.7 · galley
  conditions: ["service_bank < 30"]
  text: «Пиво тёплое, масло растаяло. Холодильник гудит из последних сил.»
  voice mechanic ≥2: «Сервисный банк почти пуст. Холодильник съедает половину заряда.»
  [0] ignore «Переживём»: {mood_per_day:-3}
  [1] run_engine «Погонять двигатель час»: {fuel:-5, service_bank:25, mood:-3}
  [2] fridge_off «Выключить холодильник на ночь»: {service_bank:10, mood:-5}
  debrief: «Электричество конечно: автопилот, плоттер и холодильник съели банк без зарядки.»

water_low_warning · boat · morning · 0.8 · cabin_day
  conditions: ["water_pct < 30"]
  text: «Насос захлёбывается воздухом. Танк почти сухой, до марины полдня.»
  voice mechanic ≥2: «Литров на день — если без душа.»
  voice crew_voice ≥0: «Я только голову помою, быстро!»
  [0] carry_on «Ничего страшного»: {mood:2}
  [1] ration «Объявить экономию воды»: {mood:-4, water:20}
  debrief: «Свободный душ опустошил танк к середине недели.»

dead_starter_morning · boat · morning · 0.6 · cockpit_morning
  conditions: ["boat.shared_bank", "starter_bank < 50"]
  text: «Ключ. Щелчок. Тишина.»
  voice mechanic ≥2: «Банк один на всё. Холодильник ночью выпил и стартовый.»
  [0] try_again «Крутить ещё»: {starter_bank:-10, fatigue:5}
  [1] ask_neighbors «Попросить соседей прикурить»: check diplomat 1 → success {time_hours:1, mood:2, starter_bank:40} / fail {time_hours:2, money:-120, starter_bank:50}
  [2] call_base «Звонить на базу»: {money:-120, time_hours:3, starter_bank:50}
  debrief: «Один общий аккумулятор: ночной расход посадил и стартовый.»

gas_smell · boat · evening · 0.6 · galley
  conditions: ["defect.gas_leak"]
  text: «У плиты пахнет газом. Света уже чиркает спичкой.»
  voice caution ≥1: «Стоп. Сначала кран баллона.»
  voice economist ≥2: «Таверна на берегу дешевле новой лодки.»
  [0] cook_anyway «Готовить, проветрим потом»: check caution 3 → success {mood:2} / fail {injury:true, mood:-30, gas:-30}
  [1] close_valve «Перекрыть газ, ужин холодный»: {mood:-6}
  [2] taverna_ashore «Ужин на берегу» requires ["at_marina || at_quay"]: {money:-140, mood:4}
  debrief: «Газ не проверен на приёмке: треснувший шланг нашёлся у открытого огня.»

toilet_misuse · boat · evening · 0.4 · cabin_night
  conditions: ["boat.electric_toilet", "!briefing.toilet"]
  text: «Электрогальюн взвыл и замолчал. Кто-то спустил салфетки.»
  voice mechanic ≥2: «Мацератор забит бумагой. Разбирать снизу.»
  [0] fix_self «Разобрать самому»: check mechanic 2 → success {fatigue:15} / fail {fatigue:25, mood:-8, damage:"toilet_broken"}
  [1] call_base «Звонить на базу»: {money:-100, time_hours:3}
  [2] close_it «Закрыть гальюн до марины»: {mood_per_day:-5}
  debrief: «Не было брифинга по гальюнам — электрогальюн забили в первую же неделю.»

genoa_seam_rip · boat · passage · 0.5 · deck_wind
  conditions: ["defect.torn_genoa_seam", "wind >= 14"]
  text: «Треск над головой. Шов на генуе разошёлся на ладонь.»
  voice sea_sense ≥2: «Ещё час под нагрузкой — и паруса не будет.»
  voice pride ≥1: «Дойдём, не сворачивать же из-за ниток.»
  [0] keep_sailing «Идти дальше под генуей»: {damage:"sail_torn", mood:-5}
  [1] furl_and_motor «Свернуть геную, идти на моторе»: {fuel:-6, time_hours:0.5}
  debrief: «Паруса не осмотрели на приёмке — шов порвался под ветром.»

anchor_shackle_loose · boat · arrival · 0.5 · bow_anchor
  conditions: ["defect.loose_anchor_shackle", "at_bay"]
  text: «Брашпиль травит цепь, а скоба на якоре держится на последнем витке.»
  voice order ≥2: «Проверь скобу, прежде чем травить.»
  [0] drop_anyway «Отдавать как есть»: check order 3 → success {} / fail {damage:"anchor_lost", time_hours:1, mood:-8}
  [1] mouse_shackle «Затянуть и законтрить скобу»: {time_hours:0.5, fatigue:5}
  debrief: «Якорное устройство не проверено: скоба не была законтрена.»
```

**Погода (5)**

```
front_squall · weather · passage · 0.7 · deck_squall
  conditions: ["front", "hour >= 13"]
  text: «С запада стена серого. Первый порыв кладёт лодку на борт.»
  voice sea_sense ≥1: «Это не прогнозные двадцать. Это тридцать.»
  voice pride ≥1: «Держи курс. Гости смотрят.»
  [0] hold_course «Держать курс под всеми парусами»: check sea_sense 3 → success {mood:-5, fatigue:10} / fail {damage:"sail_torn", mood:-15, fatigue:15}
  [1] reef_now «Взять риф прямо сейчас»: {time_hours:0.5, fatigue:10, mood:-3}
  [2] motor_to_shelter «Убрать паруса, уйти в укрытие на моторе»: {fuel:-8, time_hours:1, mood:-2}
  debrief: «Прогноз обещал 20 узлов, с фронтом в заливе пришло 30. Барометр и облака предупреждали.»

local_warning · weather · morning · 0.6 · quay_morning
  conditions: ["front"]
  text: «Старый рыбак на причале смотрит на запад и качает головой: «После обеда будет плохо».»
  voice sea_sense ≥2: «Перистые на западе. Он прав.»
  [0] laugh_off «Улыбнуться и выйти по плану»: {signal:"local_warning"}
  [1] listen «Расспросить и сократить переход»: {signal:"local_warning", time_hours:0.25, mood:-1}
  debrief: «Местные предупреждали о фронте — сигнал был, его не услышали.»

barometer_drop · weather · morning · 1.0 · cabin_day
  conditions: ["front", "voice.sea_sense >= 2"]
  text: «Стрелка барометра ушла на пять гектопаскалей за ночь.»
  voice sea_sense ≥2: «Падает быстро. После обеда придёт фронт.»
  [0] noted «Отметить в журнале»: {signal:"barometer"}
  [1] short_day «Сократить переход и рифиться в бухте»: {signal:"barometer", mood:-2}
  debrief: «Барометр падал с утра — это был самый ранний сигнал фронта.»

rolly_anchorage · weather · evening · 0.4 · anchorage_night
  conditions: ["at_bay", "wind >= 15"]
  text: «Зыбь заходит в бухту. Посуда звенит, цепь стонет.»
  voice caution ≥2: «Поползём ночью — проснёмся на камнях.»
  [0] sleep_on «Ложиться спать»: {mood:-6, fatigue:10}
  [1] anchor_watch «Назначить якорную вахту»: {fatigue:15}
  [2] re_anchor «Переставиться глубже в бухту»: check order 2 → success {fatigue:8, mood:2} / fail {fatigue:15, mood:-5}
  debrief: «Бухта открыта ветру этого направления — выбор стоянки решил ночь.»

strait_chop · weather · passage · 0.4 · deck_spray
  conditions: ["wind >= 18"]
  text: «В проливе ветер против течения. Короткая злая волна бьёт в скулу.»
  voice sea_sense ≥1: «Пролив усиливает ветер. Здесь всегда так.»
  voice pride ≥1: «Пробьёмся.»
  [0] bash_through «Пробиваться напрямую»: {mood:-10, fatigue:10}
  [1] detour «Уйти полным курсом, крюк»: {time_hours:1.5, mood:-3}
  debrief: «Проливы и мысы добавляют к прогнозу треть ветра — их лучше проходить утром.»
```

**Время (5)**

```
late_marina_queue · time · arrival · 0.6 · marina_entrance
  conditions: ["at_marina", "hour >= 15"]
  text: «У входа в марину очередь из пяти лодок. Маринер машет: «Ждите!»»
  voice diplomat ≥2: «Улыбнись и скажи, что вы на две ночи. Маринеры это любят.»
  voice pride ≥1: «Скажи, что у тебя бронь.»
  [0] argue «Спорить с маринером»: check diplomat 3 → success {money:-20} / fail {mood:-8, time_hours:1}
  [1] tip «Дать на чай»: {money:-30}
  [2] wait «Ждать на входе»: {time_hours:1, mood:-4}
  debrief: «Поздний приход в марину — очередь и риск отказа: места кончаются после обеда.»

crew_wants_more_stops · time · morning · 0.6 · cockpit_morning
  conditions: ["wish.beach", "day <= 2"]
  text: «За завтраком гости листают путеводитель: «Давайте сегодня ещё два пляжа и пещеру!»»
  voice crew_voice ≥0: «Мы же в отпуске!»
  voice caution ≥2: «Каждая остановка — якорь, купание и снова якорь. Час минимум.»
  [0] add_stops «Конечно, всё успеем»: {mood:3, time_hours:1.5}
  [1] one_good_stop «Одна хорошая бухта и долгое купание»: {mood:2}
  [2] explain «Объяснить, почему меньше — значит лучше»: check diplomat 2 → success {mood:2} / fail {mood:-4}
  debrief: «Насыщенный маршрут съедает отдых: экипаж ценит время в бухте больше числа точек.»

lunch_stop_drags · time · passage · 0.3 · bay_lunch
  conditions: ["day <= 3"]
  text: «Обеденная стоянка. Гости в воде и явно никуда не торопятся.»
  voice crew_voice ≥0: «Ещё десять минуточек!»
  [0] wait «Пусть купаются»: {time_hours:1, mood:3}
  [1] hurry «Поторопить всех на борт»: {mood:-5}
  debrief: «Остановки в пути всегда длиннее плана — нужен запас.»

sunset_arrival · time · arrival · 0.8 · dusk_harbour
  conditions: ["hour >= 19"]
  text: «Солнце садится. Входим в сумерках, огни на берегу путают глаз.»
  voice order ≥2: «Медленно. Каждому — одна задача.»
  [0] rush «Швартоваться быстро, пока видно»: check order 2 → success {fatigue:10} / fail {fatigue:15, damage:"hull_scratch"}
  [1] slow_and_safe «Медленно, с фонарём и багром»: {fatigue:12, mood:-4}
  debrief: «Слишком длинный день закончился швартовкой в темноте.»

fuel_dock_queue · time · arrival · 0.5 · fuel_dock
  conditions: ["at_marina", "fuel_pct < 40"]
  text: «На заправке три лодки и один заправщик, у которого обед.»
  voice mechanic ≥2: «Топлива на завтра впритык.»
  [0] skip «Заправимся потом»: {}
  [1] queue_now «Встать в очередь»: {time_hours:1.5, mood:-2}
  debrief: «Заправка занимает больше времени, чем кажется, — лучше утром до выхода.»
```

**Брифинг (5)**

```
marinero_commands · briefing · arrival · 0.7 · marina_berth
  conditions: ["at_marina || at_quay", "!briefing.captain_only"]
  text: «Маринер кричит «Давай-давай!», и Олег бросает ему кормовой, хотя команды не было.»
  voice order ≥2: «Твой экипаж — твои команды.»
  voice pride ≥1: «Перекричи его!»
  [0] shout_over «Перекричать маринера»: check order 3 → success {mood:-2} / fail {damage:"hull_scratch", mood:-5}
  [1] abort_redo «Отойти и зайти заново»: {time_hours:0.5, fatigue:10}
  debrief: «Не было брифинга «слушаем только капитана» — экипаж выполнял команды маринера.»

line_not_cleated · briefing · arrival · 0.4 · marina_berth
  conditions: ["!briefing.cleats", "!at_bay"]
  text: «Кормовой лёг на утку одним шлагом. Лодку тянет ветром, конец ползёт.»
  voice order ≥1: «Не хватай руками!»
  [0] grab_line «Схватить конец руками»: check order 3 → success {fatigue:5} / fail {injury:true, mood:-30}
  [1] let_go «Отдать и зайти заново»: {time_hours:0.5, fatigue:8}
  debrief: «Экипаж не умел закладывать на утку — нагруженный конец хватали руками.»

fenders_wrong_height · briefing · arrival · 0.35 · marina_berth
  conditions: ["!briefing.fenders", "at_marina || at_quay"]
  text: «Кранцы болтаются у ватерлинии, причал на полметра выше.»
  voice order ≥2: «Кранцы — до захода, а не после.»
  [0] ignore «Да ладно, аккуратно зайдём»: {damage:"hull_scratch"}
  [1] fix_now «Остановиться и перевесить»: {time_hours:0.25, fatigue:5}
  debrief: «Не было брифинга по кранцам — борт прошёлся по причалу.»

anchor_chain_pile · briefing · arrival · 0.4 · bow_anchor
  conditions: ["at_bay", "!briefing.anchor"]
  text: «На баке отдали всю цепь разом, она легла горкой прямо на якорь.»
  voice caution ≥2: «Так он не возьмёт. Ночью поползём.»
  [0] hope_holds «Авось держит»: {mood:-6, fatigue:10}
  [1] redo «Выбрать и поставить заново»: {time_hours:0.75, fatigue:10}
  debrief: «Не было брифинга по якорю — цепь отдали кучей, ночь прошла на якорной вахте.»

hat_overboard · briefing · passage · 0.15 · deck_wind
  conditions: ["!briefing.mob", "day >= 2"]
  text: «Шляпа Иры улетает за борт. Все кричат, никто не показывает рукой.»
  voice order ≥2: «Это учения. Кто показывает? Кто на руле?»
  [0] chase «Развернуться и ловить»: check order 2 → success {mood:4, fatigue:5} / fail {mood:-5, fatigue:10}
  [1] let_go «Пусть плывёт»: {mood:-2}
  [2] drill «Сделать из этого учебную тревогу»: {time_hours:0.5, mood:1, flag:"mob_drill_done"}
  debrief: «Без брифинга «человек за бортом» даже шляпа за бортом превращается в хаос.»
```

**Обещания (3)**

```
crew_grumbles_departure · promises · morning · 0.5 · cockpit_morning
  conditions: ["mood < 50"]
  text: «За завтраком тихо. Кто-то вспоминает, что вчера «выходили в восемь».»
  voice diplomat ≥2: «Не обещай снова. Объясни, что изменилось.»
  voice crew_voice ≥0: «Нам обещали!»
  [0] promise_early «Сегодня точно выйдем пораньше»: {promise:"early_try", mood:3}
  [1] explain «Честно объяснить, почему не вышло»: check diplomat 2 → success {mood:4} / fail {mood:-3}
  [2] ignore «Сменить тему»: {mood:-5}
  debrief: «Новое обещание поверх сорванного бьёт по настроению сильнее первого.»

taverna_question · promises · evening · 0.5 · anchorage_sunset
  conditions: ["wish.taverna", "!at_marina", "!at_quay"]
  text: «Аня смотрит на огни на берегу: «А завтра будет таверна?»»
  voice diplomat ≥2: «Скажи «если дойдём до города». Не «да».»
  [0] of_course «Конечно, завтра таверна!»: {promise:"promise_taverna", mood:4}
  [1] maybe «Если дойдём до города — можно»: {promise:"maybe_taverna", mood:1}
  [2] no_promises «Посмотрим по ветру»: {mood:-2}
  debrief: «Экипаж слышит «да» там, где капитан сказал «постараемся».»

sailor_wants_sailing · promises · morning · 0.3 · cockpit_morning
  conditions: ["wish.sailing", "day >= 2"]
  text: «Макс уже у мачты: «Сегодня ведь весь день под парусом?»»
  voice crew_voice ≥0: «Мы же на яхте, а не на катере!»
  [0] promise_sail_day «Конечно, весь день под парусом!»: {mood:4, flag:"promised_sailing"}
  [1] honest «Посмотрим по ветру, пару часов обещаю»: check diplomat 2 → success {mood:2} / fail {mood:-3}
  debrief: «Обещание «весь день под парусом» зависит от ветра, а не от капитана.»
```

**Безопасность (3)**

```
loaded_sheet · safety · passage · 0.4 · deck_winch
  conditions: ["!briefing.loaded_lines", "wind >= 16"]
  text: «Денис тянется снять шкот с лебёдки голыми руками. Шкот звенит от нагрузки.»
  voice order ≥1: «Стоп! Сначала команда рулевому — привестись.»
  voice pride ≥1: «Пусть учится, он взрослый.»
  [0] let_him «Пусть попробует»: check order 3 → success {} / fail {injury:true, mood:-30}
  [1] stop_explain «Остановить и показать, как правильно»: {time_hours:0.25, mood:-1}
  debrief: «Нагруженный конец нельзя брать руками — без брифинга это закончилось травмой.»

swimmer_near_prop · safety · arrival · 0.25 · anchorage_day
  conditions: ["at_bay"]
  text: «Двигатель ещё работает на заднем, а Олег уже прыгает с кормы.»
  voice caution ≥1: «Глуши! Винт!»
  [0] ignore «Он же умеет плавать»: check caution 2 → success {} / fail {injury:true, mood:-30}
  [1] kill_engine «Заглушить двигатель и крикнуть»: {mood:-1}
  debrief: «Купание у работающего винта — правило «двигатель заглушен» надо проговаривать заранее.»

guest_seasick · safety · passage · 0.4 · deck_spray
  conditions: ["wind >= 16"]
  text: «Света побледнела и просится вниз полежать.»
  voice caution ≥2: «Вниз нельзя — там будет хуже. Горизонт и свежий воздух.»
  [0] send_below «Отправить вниз отдохнуть»: {mood:-12}
  [1] horizon «Посадить на подветренный борт, смотреть на горизонт»: {mood:-4}
  [2] change_course «Сменить курс, уменьшить качку»: {time_hours:1, mood:-2}
  debrief: «Укачивание лечится горизонтом и воздухом, а не каютой.»
```

- [ ] **Step 6: Run validation and tests**

Run: `npm run validate-content && npx vitest run tests/content`
Expected: `Content OK: 3 boats, 9 points, 30 events`; все тесты PASS. Если валидатор ругается на идентификатор, исправь JSON, а не валидатор.

- [ ] **Step 7: Commit**

```bash
git add content/events.json content/dialogues.json content/debrief.json tests/content/narrative-content.test.ts
git commit -m "feat: add MVP narrative content (30 events, dialogues, debrief rules)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## Wave 3 (параллельно, 2 задачи)

### Task 16: Дневной цикл — утро и переход (`day/morning.ts`, `day/passage.ts`, `day/legs.ts`, `day/arrival.ts`)

**Files:**
- Create: `src/engine/day/morning.ts`, `src/engine/day/passage.ts`, `src/engine/day/legs.ts`, `src/engine/day/arrival.ts`
- Test: `tests/engine/day/morning.test.ts`, `tests/engine/day/passage.test.ts`

**Interfaces:**
- Consumes: `rollDayWeather`, `realWind`, `signalsVisible` (T3); `planLeg`, `bearingDeg`, `dirToDeg` (T4); `anchoring`, `marinaArrival`, `restHours` (T5); `applyOutcome`, `applyOutcomes` (T6); `sayDialogue` (T7); `maneuverRiskFactor`, `cautionTimeFactor` (T8); `maneuverForKind`, `correctOrder`, `evaluateManeuver` (T9); `queueEvent` (T12); хелперы T1.
- Produces:
  - `morning.ts`: `interface MorningChoice { openBarometer: boolean; dialogueId?: string | null }`, `startDay(state, content, choice): GameState` — `morning` → `planning`; погода дня; лог `barometer:open|ignored`; при фронте и видимых сигналах — `signal:front`; утренняя реплика (контекст `morning`); утреннее событие в очередь
  - `passage.ts`: `validatePlan(state, content, plan): void` (бросает `INVALID_INPUT`), `planDay(state, content, plan: DayPlan): GameState` — `planning` → `evening`; заполняет `dayFacts`; на последнем дне ставит `returnedOnTime`; ставит в очередь события `passage`, `arrival`, `evening` (без движения — только `evening`)
  - `legs.ts`: `startEngine(state, content, boat): GameState`, `runLeg(state, content, boat, leg, from): { state; to; motorHours; sailHours }`, `avgSeasickness(state, content): number`
  - `arrival.ts`: `runManeuver(state, content, kind, orders?): GameState`, `arrive(state, content, boat, orders?): { state; mooring: 'anchor' | 'berth' }`

Последовательность `planDay` (так и писать, иначе разбор потеряет связи):
1. проверки фазы/очереди → `validatePlan` → логи решений (`plan:shower`, `plan:autopilot:on`, `plan:depart`, `plan:route`, `plan:mode`/`plan:reefs` по ногам);
2. если есть ноги: часы = `max(clock, departureHour)` → `startEngine` (при севшем стартовом: `zero:starter`, прикурка, задержка) → манёвр `anchor_up` (из бухты) или `departure` → `+departureMin` (считается моторным временем);
3. ноги по порядку (`runLeg`): реальный ветер на участке, фронт после обеда, мотор/парус, топливо, перепарусение, поломка, вынужденное рифление;
4. купания (`swimStops × swimStopMin`, +настроение);
5. прибытие (`arrive`): бухта → якорь; марина/причал/база → отказ при позднем приходе (тогда якорь рядом) или швартовка + плата;
6. отдых до заката (+настроение), усталость за переход, `dayFacts`, проверка возврата на последнем дне;
7. события `passage` → `arrival` → `evening` в очередь, фаза `evening`.

- [ ] **Step 1: Write the failing tests**

`tests/engine/day/morning.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { startDay } from '../../../src/engine/day/morning';
import type { Content } from '../../../src/engine/types';
import { makeContent } from '../../fixtures/content';
import { deepFreeze } from '../../fixtures/freeze';
import { makeState } from '../../fixtures/state';

const content = makeContent();
const frontEveryDay: Content = {
  ...content,
  weather: [{ ...content.weather[0]!, days: content.weather[0]!.days.map((d) => ({ ...d, frontChance: 1 })) }],
};
const morning = (over = {}) => deepFreeze(makeState({ phase: 'morning', weather: null, ...over }));

describe('startDay', () => {
  it('rolls weather and moves to planning', () => {
    const s = startDay(morning(), content, { openBarometer: false });
    expect(s.phase).toBe('planning');
    expect(s.weather).toMatchObject({ day: 1, forecastKn: 12, forecastDir: 'NW', front: false });
    expect(s.rng).not.toBe(42);
    expect(s.log.map((e) => e.cause)).toContain('barometer:ignored');
  });

  it('front is visible with sea sense or an opened barometer → signal logged', () => {
    const seen = startDay(morning(), frontEveryDay, { openBarometer: false });
    expect(seen.weather!.signalsVisible).toBe(true);
    expect(seen.log.map((e) => e.cause)).toContain('signal:front');
    const blind = startDay(morning({ voices: { ...makeState().voices, sea_sense: 0 } }), frontEveryDay, { openBarometer: false });
    expect(blind.weather!.front).toBe(true);
    expect(blind.log.map((e) => e.cause)).not.toContain('signal:front');
    const opened = startDay(morning({ voices: { ...makeState().voices, sea_sense: 0 } }), frontEveryDay, { openBarometer: true });
    expect(opened.log.map((e) => e.cause)).toEqual(expect.arrayContaining(['barometer:open', 'signal:front']));
  });

  it('morning line creates a same-day expectation', () => {
    const s = startDay(morning(), content, { openBarometer: true, dialogueId: 'early_try' });
    expect(s.expectations).toEqual([expect.objectContaining({ dialogueId: 'early_try', dueDay: 1 })]);
  });

  it('rejects wrong phase (Review Focus #5)', () => {
    expect(() => startDay(makeState(), content, { openBarometer: false })).toThrow(/Expected phase morning/);
  });
});
```

`tests/engine/day/passage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { planDay } from '../../../src/engine/day/passage';
import type { DayPlan, LegPlan } from '../../../src/engine/types';
import { makeContent } from '../../fixtures/content';
import { deepFreeze } from '../../fixtures/freeze';
import { makeState } from '../../fixtures/state';

const content = makeContent();
const sail = (routeId: string, over: Partial<LegPlan> = {}): LegPlan => ({ routeId, mode: 'sail', reefs: 0, genoa: 'full', course: 'direct', ...over });
const plan = (over: Partial<DayPlan> = {}): DayPlan => ({ departureHour: 9, legs: [sail('r_base_bay_a')], swimStops: 0, shower: 'normal', autopilot: false, ...over });
const causes = (s: { log: { cause: string }[] }) => s.log.map((e) => e.cause);

describe('planDay', () => {
  it('sails to a bay, anchors, fills dayFacts, queues to evening', () => {
    const s = planDay(deepFreeze(makeState()), content, plan());
    expect(s.phase).toBe('evening');
    expect(s.locationId).toBe('bay_a');
    expect(s.dayFacts).toMatchObject({ day: 1, departureHour: 9, arrivalPointKind: 'bay', mooring: 'anchor', motorHours: 0.5, sailHours: 2.44, autopilotHours: 0, shower: 'normal' });
    expect(s.clockMin).toBeGreaterThan(11 * 60 + 50);
    expect(causes(s)).toEqual(expect.arrayContaining([
      'plan:shower:normal', 'plan:depart:early', 'plan:route:easy', 'plan:mode:sail', 'plan:reefs:0',
      'engine:start', 'order:ok:dep_test', 'leg:r_base_bay_a', 'order:ok:anchoring_test', 'rest', 'fatigue:passage',
    ]));
    expect(causes(s).some((c) => c.startsWith('anchor:attempts:'))).toBe(true);
  });

  it('motor leg burns fuel', () => {
    const s = planDay(makeState(), content, plan({ legs: [sail('r_base_bay_a', { mode: 'motor' })] }));
    expect(s.resources.fuelL).toBe(143.1);
    expect(s.dayFacts!.motorHours).toBe(2.04);
  });

  it('fuel runs out mid-day: clamp to 0, log, next motor leg sails (Review Focus #3)', () => {
    const start = makeState({ resources: { ...makeState().resources, fuelL: 2 } });
    const s = planDay(start, content, plan({ legs: [sail('r_base_bay_a', { mode: 'motor' }), sail('r_bay_a_marina_b', { mode: 'motor' })] }));
    expect(s.resources.fuelL).toBe(0);
    expect(Number.isNaN(s.resources.fuelL)).toBe(false);
    expect(causes(s)).toContain('zero:fuel');
    const legs = s.log.filter((e) => e.cause.startsWith('leg:'));
    expect(legs.map((e) => e.data!.mode)).toEqual(['motor', 'sail']);
  });

  it('dead starter: jump start costs money and time', () => {
    const start = makeState({ resources: { ...makeState().resources, starterBankPct: 10 } });
    const s = planDay(start, content, plan());
    expect(causes(s)).toContain('zero:starter');
    expect(s.resources.moneyEur).toBeLessThanOrEqual(1500 - 120);
    expect(s.dayFacts!.departureHour).toBe(12);
  });

  it('busy route ending at base on the last day → on time', () => {
    const s = planDay(makeState({ day: 6 }), content, plan({
      departureHour: 6,
      legs: [sail('r_base_bay_a'), sail('r_bay_a_marina_b'), sail('r_marina_b_base')],
    }));
    expect(causes(s)).toContain('plan:route:busy');
    expect(s.returnedOnTime).toBe(true);
    expect(causes(s)).toContain('return:on_time');
    expect(s.dayFacts!.mooring).toBe('berth');
  });

  it('last day not at base → late', () => {
    const s = planDay(makeState({ day: 6 }), content, plan());
    expect(s.returnedOnTime).toBe(false);
    expect(causes(s)).toContain('return:late');
  });

  it('staying in place: no engine, only evening events, rest counted', () => {
    const s = planDay(makeState(), content, plan({ legs: [], swimStops: 1 }));
    expect(s.locationId).toBe('base');
    expect(causes(s)).not.toContain('engine:start');
    expect(causes(s)).toContain('activity:swim');
    expect(s.dayFacts).toMatchObject({ departureHour: null, arrivalPointKind: null, activities: ['swim'] });
  });

  it('wrong maneuver order is logged and costs fatigue', () => {
    const s = planDay(makeState(), content, plan({ maneuverOrders: { departure: ['release_lines', 'neutral', 'command_helm', 'engage_gear'] } }));
    expect(causes(s)).toEqual(expect.arrayContaining(['order:wrong:dep_test', 'maneuver:dep_test:release_before_neutral', 'fatigue:maneuver:dep_test']));
    expect(s.damages).toContain('prop_line');
  });

  it('invalid plans throw and leave state untouched (Review Focus #2)', () => {
    const s = deepFreeze(makeState());
    const snapshot = JSON.stringify(s);
    expect(() => planDay(s, content, plan({ legs: [sail('r_nowhere')] }))).toThrow(/unknown route "r_nowhere"/);
    expect(() => planDay(s, content, plan({ legs: [sail('r_bay_a_marina_b')] }))).toThrow(/does not start at base/);
    expect(() => planDay(s, content, plan({ departureHour: 3 }))).toThrow(/departureHour/);
    expect(() => planDay(s, content, plan({ swimStops: 9 }))).toThrow(/swimStops/);
    expect(() => planDay(s, content, plan({ maneuverOrders: { departure: ['neutral'] } }))).toThrow(/4 steps/);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('wrong phase or pending event (Review Focus #5)', () => {
    expect(() => planDay(makeState({ phase: 'morning' }), content, plan())).toThrow(/Expected phase planning/);
    expect(() => planDay(makeState({ eventQueue: ['toilet_clog'] }), content, plan())).toThrow(/Resolve event toilet_clog/);
  });
});
```

Расчёты для ожиданий (фикстура: ветер NW 12 уз, база (0,0) → бухта (0,10), курс 0°, ветер с 315° → upwind): парус 7.5 × 0.55 = 4.1 уз → 10 / 4.1 = 2.44 ч; мотор 6.5 уз → 1.54 ч → топливо 1.54 × 4.5 = 6.9 л → 143.1; моторных часов 1.54 + 0.5 (отход) = 2.04. Севший стартер: выход 9:00 + 180 мин прикурки = 12:00.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/day`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/engine/day/morning.ts`**

```ts
import { assertNoPendingEvent, assertPhase } from '../errors';
import { queueEvent } from '../events';
import { appendLog } from '../log';
import { sayDialogue } from '../promises';
import { requireTemplate } from '../state';
import type { Content, GameState } from '../types';
import { rollDayWeather, signalsVisible } from '../weather';

export interface MorningChoice { openBarometer: boolean; dialogueId?: string | null }

export function startDay(state: GameState, content: Content, choice: MorningChoice): GameState {
  assertPhase(state, 'morning');
  assertNoPendingEvent(state);
  const b = content.balance;
  const r = rollDayWeather(state.rng, requireTemplate(content, state.weatherTemplateId), state.day, b);
  const visible = signalsVisible(state.voices.sea_sense, choice.openBarometer, b);
  let s: GameState = { ...state, rng: r.next, clockMin: b.start.hour * 60, weather: { ...r.value, signalsVisible: visible } };
  s = appendLog(s, { kind: 'decision', cause: `barometer:${choice.openBarometer ? 'open' : 'ignored'}`, pillar: 'weather' });
  if (r.value.front && visible) {
    s = appendLog(s, { kind: 'signal', cause: 'signal:front', pillar: 'weather', data: { barometerTrendHpa: r.value.barometerTrendHpa, frontAddKn: r.value.frontAddKn } });
  }
  if (choice.dialogueId) s = sayDialogue(s, content, choice.dialogueId, 'morning');
  s = queueEvent(s, content, 'morning');
  return { ...s, phase: 'planning' };
}
```

- [ ] **Step 4: Write `src/engine/day/legs.ts`**

```ts
import { EngineError } from '../errors';
import { appendLog } from '../log';
import { applyOutcome } from '../resources';
import { chance } from '../rng';
import { bearingDeg, dirToDeg, planLeg, type LegResult } from '../sailing';
import { advanceClock, otherEnd, requirePoint, requireRoute, requireTemplate, round1 } from '../state';
import type { Boat, Content, GameState, LegPlan } from '../types';
import { maneuverRiskFactor } from '../voices';
import { realWind } from '../weather';

export interface LegRun { state: GameState; to: string; motorHours: number; sailHours: number }

export function avgSeasickness(state: GameState, content: Content): number {
  if (state.crew.length === 0) return 0;
  const total = state.crew.reduce((sum, m) => sum + (content.crew.find((a) => a.id === m.archetypeId)?.seasickness ?? 0), 0);
  return total / state.crew.length;
}

export function startEngine(state: GameState, content: Content, boat: Boat): GameState {
  const b = content.balance;
  let s = state;
  if (s.resources.starterBankPct < b.electric.starterMinPct) {
    s = applyOutcome(s, boat, {
      cause: 'zero:starter',
      pillar: 'boat',
      effect: { money: -b.rescue.jumpStartEur, mood: -b.rescue.moodPenalty, starter_bank: b.electric.starterMinPct },
    });
    s = advanceClock(s, b.rescue.jumpStartDelayMin);
  }
  return applyOutcome(s, boat, { cause: 'engine:start', pillar: 'boat', effect: { starter_bank: -b.electric.starterStartPct } });
}

function sailRisks(state: GameState, content: Content, boat: Boat, res: LegResult): { state: GameState; extraMin: number } {
  const b = content.balance;
  const risk = maneuverRiskFactor(state.voices, b);
  let s = state;
  if (res.overpowered) {
    const mood = -round1(b.mood.overpowerPerHour * res.hours * (1 + avgSeasickness(s, content)));
    s = applyOutcome(s, boat, { cause: 'sail:overpowered', pillar: 'weather', effect: { mood } });
  }
  const brk = chance(s.rng, res.breakChance * risk);
  s = { ...s, rng: brk.next };
  if (brk.value) s = applyOutcome(s, boat, { cause: 'sail:break', pillar: 'weather', effect: { damage: 'sail_torn' } });
  if (!res.forcedReef) return { state: s, extraMin: 0 };
  const mitigation = s.flags['briefing.loaded_lines'] ? b.safety.mitigationFactor : 1;
  const inj = chance(s.rng, b.sails.reefUnderwayInjuryChance * risk * mitigation);
  s = applyOutcome({ ...s, rng: inj.next }, boat, { cause: 'sail:reef_underway', pillar: 'safety', effect: { fatigue: b.fatigue.maneuverError } });
  if (inj.value) s = applyOutcome(s, boat, { cause: 'injury:reef_underway', pillar: 'safety', effect: { injury: true, mood: -b.mood.injury } });
  return { state: s, extraMin: b.sails.reefUnderwayMin };
}

export function runLeg(state: GameState, content: Content, boat: Boat, leg: LegPlan, from: string): LegRun {
  const b = content.balance;
  const route = requireRoute(content, leg.routeId);
  const to = otherEnd(route, from);
  if (!to) throw new EngineError('INVALID_INPUT', `Route ${route.id} does not start at ${from}`);
  if (!state.weather) throw new EngineError('WRONG_PHASE', 'No weather for today: call startDay first');
  const wind = realWind(state.weather, route.kLocal, state.clockMin / 60, requireTemplate(content, state.weatherTemplateId), b);
  let s = state;
  const mode = leg.mode === 'motor' && s.resources.fuelL <= 0 ? 'sail' : leg.mode;
  if (mode !== leg.mode) s = applyOutcome(s, boat, { cause: 'zero:fuel', pillar: 'boat', effect: {} });
  const res = planLeg({
    mode, windKn: wind.windKn, windFromDeg: dirToDeg(wind.dir),
    courseDeg: bearingDeg(requirePoint(content, from), requirePoint(content, to)),
    reefs: leg.reefs, genoa: leg.genoa, course: leg.course, distanceNm: route.distanceNm,
    hullSpeedKn: boat.hullSpeedKn, motorKn: boat.motorKn,
  }, b);
  s = appendLog(s, { kind: 'info', cause: `leg:${route.id}`, pillar: 'time', data: { mode, windKn: wind.windKn, speedKn: res.speedKn, hours: res.hours, pos: res.pos } });
  if (wind.frontActive && !s.log.some((e) => e.day === state.day && e.cause === 'weather:front')) {
    s = appendLog(s, { kind: 'info', cause: 'weather:front', pillar: 'weather', data: { windKn: wind.windKn } });
  }
  let extraMin = 0;
  if (mode === 'motor') {
    s = applyOutcome(s, boat, { cause: 'consumption:fuel', pillar: 'boat', effect: { fuel: -round1(res.hours * b.fuel.motorLph) } });
    if (s.resources.fuelL <= 0) s = applyOutcome(s, boat, { cause: 'zero:fuel', pillar: 'boat', effect: {} });
  } else {
    const risks = sailRisks(s, content, boat, res);
    s = risks.state;
    extraMin = risks.extraMin;
  }
  return {
    state: advanceClock(s, res.hours * 60 + extraMin),
    to,
    motorHours: mode === 'motor' ? res.hours : 0,
    sailHours: mode === 'sail' ? res.hours : 0,
  };
}
```

- [ ] **Step 5: Write `src/engine/day/arrival.ts`**

```ts
import { EngineError } from '../errors';
import { appendLog } from '../log';
import { correctOrder, evaluateManeuver, maneuverForKind } from '../maneuver';
import { applyOutcome, applyOutcomes } from '../resources';
import { advanceClock, requireBoat, requirePoint, requireTemplate } from '../state';
import { anchoring, marinaArrival } from '../time';
import type { Boat, Content, DayPlan, GameState, ManeuverKind, MapPoint } from '../types';
import { cautionTimeFactor, maneuverRiskFactor } from '../voices';
import { realWind } from '../weather';

export interface ArrivalResult { state: GameState; mooring: 'anchor' | 'berth' }
type Orders = DayPlan['maneuverOrders'];

export function runManeuver(state: GameState, content: Content, kind: ManeuverKind, orders?: Orders): GameState {
  const m = maneuverForKind(content, kind);
  if (!m) return state;
  const b = content.balance;
  const boat = requireBoat(content, state);
  const r = evaluateManeuver(state.rng, m, orders?.[kind] ?? correctOrder(m), state.flags, maneuverRiskFactor(state.voices, b), b);
  const wrong = r.value.errors.length > 0;
  let s = appendLog({ ...state, rng: r.next }, { kind: 'decision', cause: `order:${wrong ? 'wrong' : 'ok'}:${m.id}`, pillar: 'safety' });
  s = applyOutcomes(s, boat, r.value.outcomes);
  if (wrong) {
    s = applyOutcome(s, boat, { cause: `fatigue:maneuver:${m.id}`, pillar: 'safety', effect: { fatigue: r.value.errors.length * b.fatigue.maneuverError } });
  }
  return s;
}

function anchorHere(state: GameState, content: Content, boat: Boat, point: MapPoint, orders?: Orders): ArrivalResult {
  const b = content.balance;
  if (!state.weather) throw new EngineError('WRONG_PHASE', 'No weather for today: call startDay first');
  const wind = realWind(state.weather, 1, state.clockMin / 60, requireTemplate(content, state.weatherTemplateId), b);
  const r = anchoring(state.rng, { seabed: point.seabed, windKn: wind.windKn, briefed: state.flags['briefing.anchor'] === true }, b);
  let s = appendLog({ ...state, rng: r.next }, { kind: 'info', cause: `anchor:attempts:${r.value.attempts}`, pillar: 'time' });
  s = advanceClock(s, r.value.minutes * cautionTimeFactor(s.voices.caution, b));
  s = runManeuver(s, content, 'anchoring', orders);
  if (!r.value.held) s = applyOutcome(s, boat, { cause: 'anchor:dragging', pillar: 'time', effect: { fatigue: b.fatigue.rollyNightPenalty } });
  return { state: s, mooring: 'anchor' };
}

export function arrive(state: GameState, content: Content, boat: Boat, orders?: Orders): ArrivalResult {
  const b = content.balance;
  const point = requirePoint(content, state.locationId);
  if (point.kind === 'bay') return anchorHere(state, content, boat, point, orders);
  const m = marinaArrival(state.rng, { arrivalHour: state.clockMin / 60, placesGoneHour: point.placesGoneHour }, b);
  let s = advanceClock({ ...state, rng: m.next }, m.value.waitMin);
  if (m.value.refused) {
    s = applyOutcome(s, boat, { cause: 'marina:refused', pillar: 'time', effect: { mood: -b.mood.marinaRefused } });
    return anchorHere(s, content, boat, point, orders);
  }
  s = advanceClock(s, b.time.marinaMooringMin * cautionTimeFactor(s.voices.caution, b));
  s = runManeuver(s, content, 'mooring', orders);
  if (point.priceEur > 0) s = applyOutcome(s, boat, { cause: 'marina:fee', pillar: 'boat', effect: { money: -point.priceEur } });
  return { state: s, mooring: 'berth' };
}
```

- [ ] **Step 6: Write `src/engine/day/passage.ts`**

```ts
import { assertNoPendingEvent, assertPhase, EngineError } from '../errors';
import { queueEvent } from '../events';
import { appendLog } from '../log';
import { applyOutcome } from '../resources';
import { advanceClock, otherEnd, requireBoat, requirePoint, requireRoute, round1, round2 } from '../state';
import { restHours } from '../time';
import type { Activity, Balance, Boat, Content, DayPlan, EventPhase, GameState, MapPoint } from '../types';
import { arrive, runManeuver } from './arrival';
import { runLeg, startEngine } from './legs';

const SHOWERS = ['strict', 'normal', 'loose'];
const MODES = ['motor', 'sail'];
const GENOAS = ['full', 'partial'];
const COURSES = ['direct', 'detour'];
const REEFS = [0, 1, 2];

interface DaySummary { moving: boolean; departureHour: number | null; mooring: 'anchor' | 'berth'; motor: number; sail: number; legHours: number }

function invalid(msg: string): never {
  throw new EngineError('INVALID_INPUT', msg);
}

export function validatePlan(state: GameState, content: Content, plan: DayPlan): void {
  const t = content.balance.time;
  if (!Number.isFinite(plan.departureHour) || plan.departureHour < t.earliestDepartureHour || plan.departureHour > t.sunsetHour) {
    invalid(`departureHour must be within ${t.earliestDepartureHour}..${t.sunsetHour}`);
  }
  if (!Number.isInteger(plan.swimStops) || plan.swimStops < 0 || plan.swimStops > t.maxSwimStops) invalid(`swimStops must be 0..${t.maxSwimStops}`);
  if (!SHOWERS.includes(plan.shower)) invalid(`unknown shower discipline "${plan.shower}"`);
  let at = state.locationId;
  plan.legs.forEach((leg, i) => {
    const route = content.routes.find((r) => r.id === leg.routeId);
    if (!route) invalid(`Leg ${i + 1}: unknown route "${leg.routeId}"`);
    const next = otherEnd(route, at);
    if (!next) invalid(`Leg ${i + 1}: route ${route.id} does not start at ${at}`);
    if (!MODES.includes(leg.mode) || !REEFS.includes(leg.reefs) || !GENOAS.includes(leg.genoa) || !COURSES.includes(leg.course)) {
      invalid(`Leg ${i + 1}: invalid sail settings`);
    }
    at = next;
  });
}

function logPlanDecisions(state: GameState, content: Content, plan: DayPlan): GameState {
  const t = content.balance.time;
  let s = appendLog(state, { kind: 'decision', cause: `plan:shower:${plan.shower}`, pillar: 'boat' });
  if (plan.legs.length === 0) return s;
  if (plan.autopilot) s = appendLog(s, { kind: 'decision', cause: 'plan:autopilot:on', pillar: 'boat' });
  const distance = plan.legs.reduce((sum, l) => sum + requireRoute(content, l.routeId).distanceNm, 0);
  const busy = distance >= t.busyRouteNm || plan.legs.length >= t.busyRouteLegs;
  s = appendLog(s, { kind: 'decision', cause: `plan:depart:${plan.departureHour > t.lateDepartureHour ? 'late' : 'early'}`, pillar: 'time', data: { hour: plan.departureHour } });
  s = appendLog(s, { kind: 'decision', cause: `plan:route:${busy ? 'busy' : 'easy'}`, pillar: 'time', data: { distanceNm: round1(distance), legs: plan.legs.length } });
  return plan.legs.reduce((acc, leg) => {
    const withMode = appendLog(acc, { kind: 'decision', cause: `plan:mode:${leg.mode}`, pillar: 'weather' });
    return leg.mode === 'sail' ? appendLog(withMode, { kind: 'decision', cause: `plan:reefs:${leg.reefs}`, pillar: 'weather' }) : withMode;
  }, s);
}

function swimStops(state: GameState, boat: Boat, n: number, b: Balance): GameState {
  let s = state;
  for (let i = 0; i < n; i++) {
    s = applyOutcome(advanceClock(s, b.time.swimStopMin), boat, { cause: 'activity:swim', pillar: 'time', effect: { mood: b.mood.swimStop } });
  }
  return s;
}

function checkReturn(state: GameState, content: Content, point: MapPoint): GameState {
  const sch = content.balance.schedule;
  if (state.day !== sch.days) return state;
  const onTime = point.kind === 'base' && state.clockMin <= sch.returnDeadlineHour * 60;
  return appendLog({ ...state, returnedOnTime: onTime }, { kind: 'info', cause: `return:${onTime ? 'on_time' : 'late'}`, pillar: 'time' });
}

function settleDay(state: GameState, content: Content, boat: Boat, plan: DayPlan, d: DaySummary): GameState {
  const b = content.balance;
  const point = requirePoint(content, state.locationId);
  const rest = restHours(state.clockMin, b);
  let s = applyOutcome(state, boat, { cause: 'rest', pillar: 'time', effect: { mood: round1(rest * b.mood.restPerHour) } });
  if (d.moving) s = applyOutcome(s, boat, { cause: 'fatigue:passage', pillar: 'time', effect: { fatigue: round1(d.legHours * b.fatigue.passagePerHour) } });
  const activities: Activity[] = [];
  if (plan.swimStops > 0) activities.push('swim');
  if (point.services.beach && rest > 0) activities.push('beach');
  const arrivalKind = d.mooring === 'anchor' && point.kind !== 'bay' ? 'bay' : point.kind;
  s = {
    ...s,
    dayFacts: {
      day: s.day,
      departureHour: d.departureHour,
      arrivalHour: d.moving ? s.clockMin / 60 : null,
      arrivalPointKind: d.moving ? arrivalKind : null,
      mooring: d.mooring,
      activities,
      motorHours: round2(d.motor),
      sailHours: round2(d.sail),
      autopilotHours: plan.autopilot ? round2(d.legHours) : 0,
      shower: plan.shower,
    },
  };
  return checkReturn(s, content, point);
}

function sail(state: GameState, content: Content, boat: Boat, plan: DayPlan): { state: GameState; summary: DaySummary } {
  const b = content.balance;
  const origin = requirePoint(content, state.locationId);
  let s = startEngine({ ...state, clockMin: Math.max(state.clockMin, Math.round(plan.departureHour * 60)) }, content, boat);
  const departureHour = s.clockMin / 60;
  s = runManeuver(s, content, origin.kind === 'bay' ? 'anchor_up' : 'departure', plan.maneuverOrders);
  s = advanceClock(s, b.time.departureMin);
  const summary: DaySummary = { moving: true, departureHour, mooring: 'anchor', motor: b.time.departureMin / 60, sail: 0, legHours: 0 };
  let at = s.locationId;
  for (const leg of plan.legs) {
    const r = runLeg(s, content, boat, leg, at);
    s = r.state;
    at = r.to;
    summary.motor += r.motorHours;
    summary.sail += r.sailHours;
    summary.legHours += r.motorHours + r.sailHours;
  }
  s = swimStops({ ...s, locationId: at }, boat, plan.swimStops, b);
  const arrival = arrive(s, content, boat, plan.maneuverOrders);
  return { state: arrival.state, summary: { ...summary, mooring: arrival.mooring } };
}

export function planDay(state: GameState, content: Content, plan: DayPlan): GameState {
  assertPhase(state, 'planning');
  assertNoPendingEvent(state);
  validatePlan(state, content, plan);
  const boat = requireBoat(content, state);
  let s = logPlanDecisions(state, content, plan);
  let summary: DaySummary;
  if (plan.legs.length > 0) {
    const r = sail(s, content, boat, plan);
    s = r.state;
    summary = r.summary;
  } else {
    s = swimStops(s, boat, plan.swimStops, content.balance);
    const here = requirePoint(content, s.locationId);
    summary = { moving: false, departureHour: null, mooring: here.kind === 'bay' ? 'anchor' : 'berth', motor: 0, sail: 0, legHours: 0 };
  }
  s = settleDay(s, content, boat, plan, summary);
  const phases: EventPhase[] = summary.moving ? ['passage', 'arrival', 'evening'] : ['evening'];
  s = phases.reduce((acc, phase) => queueEvent(acc, content, phase), s);
  return { ...s, phase: 'evening' };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/engine/day && npx tsc --noEmit`
Expected: PASS. Если в тесте «busy route on time» прибытие позже 17:00, проверь, что фронт не активен (в фикстуре `frontChance` дня 6 = 0), а не меняй ожидание.

- [ ] **Step 8: Commit**

```bash
git add src/engine/day/morning.ts src/engine/day/passage.ts src/engine/day/legs.ts src/engine/day/arrival.ts tests/engine/day/morning.test.ts tests/engine/day/passage.test.ts
git commit -m "feat: add morning and passage phases of the daily loop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Дневной цикл — вечер, ночь, сдача лодки (`day/evening.ts`)

**Files:**
- Create: `src/engine/day/evening.ts`
- Test: `tests/engine/day/evening.test.ts`

**Interfaces:**
- Consumes: `applyOutcome`, `applyOutcomes`, `dailyConsumption`, `refillAt`, `zeroResourceOutcomes` (T6); `resolveDueExpectations`, `crewSensitivity`, `sayDialogue` (T7); `exposure` (T3); хелперы T1. **Не** зависит от T16: тест строит вечернее состояние через `makeState({ phase: 'evening', dayFacts })`.
- Produces:
  - `interface EveningChoice { dinner: 'cook' | 'taverna'; dialogueId?: string | null }`
  - `endDay(state, content, choice): GameState` — `evening` → `morning` (день + 1) или `return` (после последнего дня). Порядок: ужин → оценка ожиданий дня → вечерняя реплика → заправка (если у причала) → ночной расход → нули → `mood_per_day` (сбрасывается у причала) → качка на якоре (если `exposure > fatigue.rollyExposure`) → сон
  - `finishWeek(state, content): GameState` — `return` → `debrief`; штраф за опоздание; непойманные дефекты с `chargedOnReturn` → повреждение `deposit:unrecorded:<id>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { endDay, finishWeek } from '../../../src/engine/day/evening';
import { createExpectation } from '../../../src/engine/promises';
import type { DayFacts, GameState } from '../../../src/engine/types';
import { makeContent } from '../../fixtures/content';
import { deepFreeze } from '../../fixtures/freeze';
import { makeState } from '../../fixtures/state';

const content = makeContent();
const facts = (over: Partial<DayFacts> = {}): DayFacts => ({
  day: 1, departureHour: 9, arrivalHour: 14, arrivalPointKind: 'marina', mooring: 'berth', activities: [],
  motorHours: 2, sailHours: 0, autopilotHours: 0, shower: 'normal', ...over,
});
const evening = (over: Partial<GameState> = {}) => deepFreeze(makeState({ phase: 'evening', locationId: 'marina_b', dayFacts: facts(), ...over }));
const causes = (s: GameState) => s.log.map((e) => e.cause);
const res = makeState().resources;

describe('endDay', () => {
  it('at a marina: refill, shore power, night consumption, next morning', () => {
    const s = endDay(evening({ resources: { ...res, waterL: 100, serviceBankPct: 40 } }), content, { dinner: 'cook' });
    expect(s).toMatchObject({ phase: 'morning', day: 2, clockMin: 8 * 60, weather: null, dayFacts: null });
    expect(s.resources.waterL).toBe(200);
    expect(s.resources.serviceBankPct).toBe(100);
    expect(s.resources.gasPct).toBe(91);
    expect(causes(s)).toEqual(expect.arrayContaining(['refill:water', 'consumption:water', 'charge:shore', 'consumption:gas', 'night:sleep']));
  });

  it('at anchor: no refill; exposed bay gives a rolly night', () => {
    const s = endDay(evening({ locationId: 'bay_a', dayFacts: facts({ mooring: 'anchor', arrivalPointKind: 'bay' }) }), content, { dinner: 'cook' });
    expect(causes(s)).not.toContain('refill:water');
    expect(causes(s)).toContain('night:rolly');
    expect(causes(s)).toContain('consumption:electric');
  });

  it('broken promise hurts more than a kept one helps', () => {
    const early = createExpectation(content.dialogues[0]!, 'briefing', 0)!;
    const kept = endDay(evening({ expectations: [early], dayFacts: facts({ departureHour: 8 }) }), content, { dinner: 'cook' });
    const broken = endDay(evening({ expectations: [early], dayFacts: facts({ departureHour: 10 }) }), content, { dinner: 'cook' });
    expect(kept.log.find((e) => e.cause === 'promise:early_try:kept')!.delta!.mood).toBe(4.5);
    expect(broken.log.find((e) => e.cause === 'promise:early_try:broken')!.delta!.mood).toBe(-10.8);
    expect(broken.expectations[0]!.status).toBe('broken');
  });

  it('taverna dinner costs money, lifts mood and keeps a taverna promise', () => {
    const promise = createExpectation(content.dialogues.find((d) => d.id === 'promise_taverna')!, 'evening', 0)!;
    const s = endDay(evening({ expectations: [promise] }), content, { dinner: 'taverna' });
    expect(s.log.find((e) => e.cause === 'activity:taverna')!.delta).toMatchObject({ moneyEur: -140 });
    expect(causes(s)).toContain('promise:promise_taverna:kept');
    expect(() => endDay(evening({ locationId: 'bay_a' }), content, { dinner: 'taverna' })).toThrow(/No taverna at bay_a/);
  });

  it('no gas → no hot food', () => {
    const s = endDay(evening({ resources: { ...res, gasPct: 5 } }), content, { dinner: 'cook' });
    expect(causes(s)).toContain('zero:gas');
    expect(causes(s)).not.toContain('consumption:gas');
  });

  it('mood_per_day applies every night and resets at a berth', () => {
    const atAnchor = endDay(evening({ locationId: 'bay_a', moodPerDay: -8, dayFacts: facts({ mooring: 'anchor' }) }), content, { dinner: 'cook' });
    expect(atAnchor.moodPerDay).toBe(-8);
    expect(causes(atAnchor)).toContain('mood_per_day');
    expect(endDay(evening({ moodPerDay: -8 }), content, { dinner: 'cook' }).moodPerDay).toBe(0);
  });

  it('evening line creates an expectation for tomorrow', () => {
    const s = endDay(evening(), content, { dinner: 'cook', dialogueId: 'promise_taverna' });
    expect(s.expectations).toEqual([expect.objectContaining({ dialogueId: 'promise_taverna', dueDay: 2 })]);
  });

  it('after the last day → return phase', () => {
    expect(endDay(evening({ day: 6, dayFacts: facts({ day: 6 }) }), content, { dinner: 'cook' }).phase).toBe('return');
  });

  it('guards (Review Focus #5)', () => {
    expect(() => endDay(evening({ eventQueue: ['toilet_clog'] }), content, { dinner: 'cook' })).toThrow(/Resolve event/);
    expect(() => endDay(makeState(), content, { dinner: 'cook' })).toThrow(/Expected phase evening/);
    expect(() => endDay(evening({ dayFacts: null }), content, { dinner: 'cook' })).toThrow(/planDay/);
  });
});

describe('finishWeek', () => {
  it('late return pays a fee; unrecorded old damage is charged', () => {
    const s = finishWeek(deepFreeze(makeState({ phase: 'return', day: 7, returnedOnTime: false, flags: { 'defect.old_scratch': true } })), content);
    expect(s.phase).toBe('debrief');
    expect(s.resources.moneyEur).toBe(1100);
    expect(s.damages).toContain('hull_scratch');
    expect(causes(s)).toEqual(expect.arrayContaining(['return:late_fee', 'deposit:unrecorded:old_scratch']));
  });

  it('on time with photos taken: nothing charged', () => {
    const s = finishWeek(makeState({ phase: 'return', returnedOnTime: true, flags: { 'defect.old_scratch.found': true } }), content);
    expect(s.resources.moneyEur).toBe(1500);
    expect(s.damages).toEqual([]);
  });
});
```

Расчёты: вода 100 → заправка до 300 → ночь «normal» 4 × 25 = −100 → 200; газ 100 − 9 = 91; обещание `early_try` (сила 0.9) при дипломате 2 и средней чувствительности экипажа 1.0: выполнено +4.5, сорвано −13.5 × 0.8 = −10.8; таверна 4 × 35 = 140 €.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/day/evening.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
import { assertNoPendingEvent, assertPhase, EngineError } from '../errors';
import { crewSensitivity, resolveDueExpectations, sayDialogue } from '../promises';
import { applyOutcome, applyOutcomes, dailyConsumption, refillAt, zeroResourceOutcomes } from '../resources';
import { requireBoat, requirePoint } from '../state';
import type { Activity, Balance, Boat, Content, DayFacts, GameState, MapPoint, Outcome } from '../types';
import { exposure } from '../weather';

export interface EveningChoice { dinner: 'cook' | 'taverna'; dialogueId?: string | null }

function dinner(state: GameState, b: Balance, choice: EveningChoice['dinner']): { outcomes: Outcome[]; cooked: boolean; activity: Activity | null } {
  if (choice === 'taverna') {
    const effect = { money: -state.crew.length * b.mood.tavernaEurPerPerson, mood: b.mood.tavernaDinner };
    return { outcomes: [{ cause: 'activity:taverna', pillar: 'promises', effect }], cooked: false, activity: 'taverna' };
  }
  if (state.resources.gasPct < b.gas.pctPerDay) {
    return { outcomes: [{ cause: 'zero:gas', pillar: 'boat', effect: { mood: -b.gas.noHotFoodMoodPenalty } }], cooked: false, activity: null };
  }
  return { outcomes: [], cooked: true, activity: null };
}

function night(state: GameState, content: Content, boat: Boat, point: MapPoint, facts: DayFacts, cooked: boolean): GameState {
  const b = content.balance;
  const atBerth = facts.mooring === 'berth';
  let s = atBerth ? applyOutcomes(state, boat, refillAt(state, boat, point, b)) : state;
  s = applyOutcomes(s, boat, dailyConsumption({
    crewSize: s.crew.length, shower: facts.shower, boat,
    motorHours: facts.motorHours, sailHours: facts.sailHours, autopilotHours: facts.autopilotHours,
    shorePower: atBerth && point.services.shorePower, cookedDinner: cooked,
  }, b));
  s = applyOutcomes(s, boat, zeroResourceOutcomes(s, b));
  if (s.moodPerDay !== 0) s = applyOutcome(s, boat, { cause: 'mood_per_day', pillar: 'boat', effect: { mood: s.moodPerDay } });
  if (atBerth) s = { ...s, moodPerDay: 0 };
  const w = s.weather;
  const dir = w ? (w.front ? w.frontDir : w.forecastDir) : null;
  if (facts.mooring === 'anchor' && dir && exposure(point, dir) > b.fatigue.rollyExposure) {
    s = applyOutcome(s, boat, { cause: 'night:rolly', pillar: 'weather', effect: { mood: -b.mood.rollyNight, fatigue: b.fatigue.rollyNightPenalty } });
  }
  return applyOutcome(s, boat, { cause: 'night:sleep', pillar: 'time', effect: { fatigue: -b.fatigue.nightRecovery } });
}

export function endDay(state: GameState, content: Content, choice: EveningChoice): GameState {
  assertPhase(state, 'evening');
  assertNoPendingEvent(state);
  const facts = state.dayFacts;
  if (!facts) throw new EngineError('WRONG_PHASE', 'No day facts: call planDay first');
  const b = content.balance;
  const boat = requireBoat(content, state);
  const point = requirePoint(content, state.locationId);
  if (choice.dinner === 'taverna' && !point.services.taverna) throw new EngineError('INVALID_INPUT', `No taverna at ${point.id}`);
  const meal = dinner(state, b, choice.dinner);
  let s = applyOutcomes(state, boat, meal.outcomes);
  const dayFacts = meal.activity ? { ...facts, activities: [...facts.activities, meal.activity] } : facts;
  const resolved = resolveDueExpectations(s.expectations, dayFacts, s.voices.diplomat, crewSensitivity(s, content), b);
  s = applyOutcomes({ ...s, expectations: resolved.expectations }, boat, resolved.outcomes);
  if (choice.dialogueId) s = sayDialogue(s, content, choice.dialogueId, 'evening');
  s = night(s, content, boat, point, facts, meal.cooked);
  const day = s.day + 1;
  return { ...s, day, phase: day > b.schedule.days ? 'return' : 'morning', clockMin: b.start.hour * 60, weather: null, dayFacts: null };
}

export function finishWeek(state: GameState, content: Content): GameState {
  assertPhase(state, 'return');
  const b = content.balance;
  const boat = requireBoat(content, state);
  let s = state;
  if (s.returnedOnTime !== true) s = applyOutcome(s, boat, { cause: 'return:late_fee', pillar: 'time', effect: { money: -b.schedule.lateFeeEur } });
  for (const d of boat.hiddenDefects) {
    if (d.chargedOnReturn && s.flags[`defect.${d.id}`]) {
      s = applyOutcome(s, boat, { cause: `deposit:unrecorded:${d.id}`, pillar: 'boat', effect: { damage: d.chargedOnReturn } });
    }
  }
  return { ...s, phase: 'debrief' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/day/evening.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/day/evening.ts tests/engine/day/evening.test.ts
git commit -m "feat: add evening, night and check-out phases

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## Wave 4

### Task 18: Публичный API, симуляция недели, приёмочные тесты (ТЗ 7.4)

**Files:**
- Create: `src/engine/index.ts`, `src/sim/strategies.ts`, `src/sim/run.ts`, `src/sim/report.ts`, `scripts/simulate.ts`
- Test: `tests/sim/acceptance.test.ts`, `tests/sim/report.test.ts`
- Modify (только значения, не ключи): `content/balance.json`, шансы и эффекты в `content/events.json`, если приёмка не проходит (см. Step 6)

**Interfaces:**
- Consumes: всё из Волн 0–3.
- Produces:
  - `src/engine/index.ts` — публичный API для UI Этапа 2 (re-export: типы, `EngineError`, setup-функции, `startDay`, `planDay`, `validatePlan`, `endDay`, `finishWeek`, `presentEvent`, `resolvePendingEvent`, `buildDebrief`, `buildConditionContext`, `formatClock`, `resourceReadout`, `realWind`)
  - `src/sim/strategies.ts`: `interface Strategy`, `newbie`, `expert`
  - `src/sim/run.ts`: `setupWeek(content, seed, strategy, lang?)`, `playDay(state, content, strategy)`, `drainEvents(state, content, strategy)`, `runWeek(content, seed, strategy): { state: GameState; debrief: Debrief }`, `weekScore(d: Debrief): number` (good 2 / ok 1 / bad 0, максимум 8), `pillarsAffected(state): Set<Pillar>`
  - `src/sim/report.ts`: `formatWeek(result, content, lang): string`
  - `npm run simulate -- --seed 42 --strategy newbie` (одна неделя по дням) и `npm run simulate -- --batch 50` (сравнение стратегий)

Стратегии — это прокси игроков, а не ИИ. `newbie` делает всё «блестящее» из таблицы ловушек ТЗ раздела 2: Аврора, насыщенный маршрут, паруса на брифинге, «постараемся пораньше», душ без ограничений, автопилот, полные паруса, барометр не смотрит, порядок команд перевёрнут, `options[0]`. `expert` делает обратное и выбирает вариант событий по ожидаемой ценности.

- [ ] **Step 1: Write the failing tests**

`tests/sim/acceptance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import { parseContent } from '../../src/content/parse';
import { finishWeek, presentEvent } from '../../src/engine';
import { buildConditionContext } from '../../src/engine/expr';
import { PILLARS, type GameEvent } from '../../src/engine/types';
import { pillarsAffected, playDay, runWeek, setupWeek, weekScore } from '../../src/sim/run';
import { expert, newbie } from '../../src/sim/strategies';

const loaded = await loadContentDir('content');
if (!loaded.content) throw new Error(JSON.stringify(loaded.errors));
const content = loaded.content;

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const newbieRuns = SEEDS.map((seed) => runWeek(content, seed, newbie));
const expertRuns = SEEDS.map((seed) => runWeek(content, seed, expert));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('ТЗ 7.4 acceptance', () => {
  it('#1 the week runs from boat choice to debrief with no dead ends', () => {
    for (const r of [...newbieRuns, ...expertRuns]) {
      expect(r.state.phase).toBe('debrief');
      expect(r.state.day).toBe(content.balance.schedule.days + 1);
      expect(r.state.eventQueue).toEqual([]);
    }
  });

  it('#2 every pillar influences a typical game', () => {
    const counts = newbieRuns.map((r) => pillarsAffected(r.state).size).sort((a, b) => a - b);
    expect(counts[Math.floor(counts.length / 2)]).toBeGreaterThanOrEqual(5);
    const union = new Set(newbieRuns.flatMap((r) => [...pillarsAffected(r.state)]));
    expect([...union].sort()).toEqual([...PILLARS].sort());
  });

  it('#3 the newbie strategy clearly loses to the right one', () => {
    expect(mean(expertRuns.map((r) => weekScore(r.debrief)))).toBeGreaterThanOrEqual(mean(newbieRuns.map((r) => weekScore(r.debrief))) + 2);
    expect(mean(newbieRuns.map((r) => r.debrief.depositLossEur))).toBeGreaterThan(mean(expertRuns.map((r) => r.debrief.depositLossEur)));
    expect(mean(newbieRuns.map((r) => r.state.resources.mood))).toBeLessThan(mean(expertRuns.map((r) => r.state.resources.mood)));
  });

  it('#4 the debrief shows at least 3 decision → consequence links', () => {
    const withThree = newbieRuns.filter((r) => r.debrief.links.length >= 3).length;
    expect(withThree / newbieRuns.length).toBeGreaterThanOrEqual(0.8);
  });

  it('#5 texts come out in both languages', () => {
    const s = setupWeek(content, 1, expert, 'en');
    const ev = content.events[0]!;
    expect(presentEvent(ev, s, buildConditionContext(s, content), content.balance).text).toBe(ev.text.en);
  });

  it('#6 a new event works by editing JSON only', () => {
    const extra: GameEvent = {
      id: 'json_only_test', pillar: 'time', trigger: { phase: 'morning', conditions: ['day == 1'], chance: 1 }, scene: 'cockpit_morning',
      text: { ru: 'Тестовое событие.', en: 'A test event.' },
      voices: [{ voice: 'caution', min_level: 0, text: { ru: 'Проверка.', en: 'Check.' } }],
      options: [
        { id: 'a', text: { ru: 'А', en: 'A' }, effects: { mood: 1 } },
        { id: 'b', text: { ru: 'Б', en: 'B' }, effects: { mood: -1 } },
      ],
      debrief: { ru: 'Тест.', en: 'Test.' },
    };
    const raw = JSON.parse(JSON.stringify({ ...content, events: [extra, ...content.events] }));
    const parsed = parseContent(raw);
    expect(parsed.errors).toEqual([]);
    expect(runWeek(parsed.content!, 1, newbie).state.firedEvents).toContain('json_only_test');
  });

  it('#7 the same seed gives the same week; different seeds differ', () => {
    expect(runWeek(content, 42, newbie)).toEqual(runWeek(content, 42, newbie));
    expect(runWeek(content, 42, newbie).state.log).not.toEqual(runWeek(content, 43, newbie).state.log);
  });

  it('save/load mid-week continues identically (Review Focus #4)', () => {
    let s = setupWeek(content, 7, newbie);
    for (let i = 0; i < 3; i++) s = playDay(s, content, newbie);
    let restored = JSON.parse(JSON.stringify(s));
    while (s.phase === 'morning') s = playDay(s, content, newbie);
    while (restored.phase === 'morning') restored = playDay(restored, content, newbie);
    expect(finishWeek(restored, content)).toEqual(finishWeek(s, content));
  });
});
```

`tests/sim/report.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import { formatWeek } from '../../src/sim/report';
import { runWeek } from '../../src/sim/run';
import { newbie } from '../../src/sim/strategies';

const { content } = await loadContentDir('content');

describe('formatWeek', () => {
  it('prints days, scales and links in the chosen language', () => {
    const r = runWeek(content!, 3, newbie);
    const ru = formatWeek(r, content!, 'ru');
    expect(ru).toMatch(/День 1/);
    expect(ru).toMatch(/Безопасность: (good|ok|bad)/);
    expect(formatWeek(r, content!, 'en')).toMatch(/Day 1/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/sim`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/engine/index.ts`**

```ts
// Public engine API for the UI (Stage 2). Import from here, not from internal modules.
export * from './types';
export { EngineError, type EngineErrorCode } from './errors';
export { newGame, assignVoices, boatOffers, chooseBoat, performCheckin, performBriefing, type NewGameOptions } from './setup';
export { startDay, type MorningChoice } from './day/morning';
export { planDay, validatePlan } from './day/passage';
export { endDay, finishWeek, type EveningChoice } from './day/evening';
export { presentEvent, resolvePendingEvent, type EventView } from './events';
export { buildDebrief, type Debrief, type DebriefLink, type WeekScales } from './debrief';
export { buildConditionContext } from './expr';
export { formatClock } from './time';
export { resourceReadout } from './voices';
export { realWind } from './weather';
```

- [ ] **Step 4: Write `src/sim/strategies.ts`**

```ts
import type { EveningChoice } from '../engine/day/evening';
import type { MorningChoice } from '../engine/day/morning';
import { optionAvailable } from '../engine/events';
import { buildConditionContext } from '../engine/expr';
import { correctOrder } from '../engine/maneuver';
import { MANEUVER_KINDS, type CheckpointId, type Content, type DayPlan, type Effect, type EventOption, type GameEvent, type GameState, type LegPlan, type ManeuverKind, type TrainableVoice } from '../engine/types';
import { checkChance } from '../engine/voices';

export interface Strategy {
  name: 'newbie' | 'expert';
  voices: Partial<Record<TrainableVoice, number>>;
  boatId: string;
  checkpoints: CheckpointId[];
  briefingTopics: string[];
  briefingDialogues: string[];
  morning(s: GameState, c: Content): MorningChoice;
  plan(s: GameState, c: Content): DayPlan;
  chooseOption(s: GameState, c: Content, ev: GameEvent): string;
  evening(s: GameState, c: Content): EveningChoice;
}

// Sim heuristics (not game balance): below this expected wind both proxies motor.
const SAIL_MIN_WIND_KN = 8;
const EXPERT_TAVERNA_MIN_MONEY = 600;

const EXPERT_ITINERARY: Record<number, string[]> = {
  1: ['r_base_marina_cala_azzurra'],
  2: ['r_cala_azzurra_kastri_marina'],
  3: ['r_kastri_marina_nisi_quay'],
  4: ['r_cala_azzurra_nisi_quay'],
  5: ['r_base_marina_cala_azzurra', 'r_base_marina_blue_lagoon'],
  6: ['r_base_marina_blue_lagoon'],
};

const NEWBIE_ITINERARY: Record<number, string[]> = {
  1: ['r_base_marina_cala_azzurra', 'r_cala_azzurra_nisi_quay', 'r_nisi_quay_capo_rosso_bay'],
  2: ['r_capo_rosso_bay_porto_lungo_marina'],
  3: ['r_base_marina_porto_lungo_marina', 'r_base_marina_cala_azzurra', 'r_cala_azzurra_kastri_marina'],
  4: ['r_kastri_marina_fjord_bay'],
  5: ['r_kastri_marina_fjord_bay', 'r_kastri_marina_nisi_quay', 'r_cala_azzurra_nisi_quay'],
  6: ['r_cala_azzurra_vela_bay', 'r_vela_bay_blue_lagoon', 'r_base_marina_blue_lagoon'],
};

/** Today's legs if they chain from the current location; otherwise stay put. */
function todaysLegs(itinerary: Record<number, string[]>, s: GameState, c: Content): string[] {
  const legs = itinerary[s.day] ?? [];
  let at = s.locationId;
  for (const id of legs) {
    const r = c.routes.find((x) => x.id === id);
    const next = r ? (r.from === at ? r.to : r.to === at ? r.from : null) : null;
    if (!next) return [];
    at = next;
  }
  return legs;
}

function expectedWind(s: GameState, c: Content, routeId: string, readsSignals: boolean): number {
  const w = s.weather!;
  const route = c.routes.find((r) => r.id === routeId)!;
  const template = c.weather.find((t) => t.id === s.weatherTemplateId)!;
  const front = readsSignals && w.signalsVisible && w.front ? w.frontAddKn : 0;
  return w.forecastKn * template.afternoonFactor * route.kLocal + front;
}

function reefsFor(windKn: number, c: Content): 0 | 1 | 2 {
  const [r0, r1] = c.balance.sails.reefThresholdKn;
  if (windKn <= r0) return 0;
  return windKn <= r1 ? 1 : 2;
}

function scoreEffect(e: Effect | undefined): number {
  if (!e) return 0;
  return (e.mood ?? 0) + (e.money ?? 0) / 20 - (e.fatigue ?? 0) / 2 - (e.time_hours ?? 0) * 3
    + (e.mood_per_day ?? 0) * 3 - (e.damage ? 40 : 0) - (e.injury ? 100 : 0) - (e.promise ? 5 : 0);
}

function scoreOption(o: EventOption, s: GameState, c: Content): number {
  if (!o.check) return scoreEffect(o.effects);
  const p = checkChance(s.voices[o.check.voice], o.check.difficulty, s.resources.fatigue, c.balance);
  return p * scoreEffect(o.success) + (1 - p) * scoreEffect(o.fail);
}

const available = (s: GameState, c: Content, ev: GameEvent): EventOption[] => {
  const ctx = buildConditionContext(s, c);
  return ev.options.filter((o) => optionAvailable(o, ctx));
};

const hasTaverna = (s: GameState, c: Content): boolean => c.map.find((p) => p.id === s.locationId)?.services.taverna ?? false;

function reversedOrders(c: Content): Partial<Record<ManeuverKind, string[]>> {
  const orders: Partial<Record<ManeuverKind, string[]>> = {};
  for (const kind of MANEUVER_KINDS) {
    const m = c.maneuvers.find((x) => x.kind === kind);
    if (m) orders[kind] = [...correctOrder(m)].reverse();
  }
  return orders;
}

export const expert: Strategy = {
  name: 'expert',
  voices: { sea_sense: 2, caution: 2, order: 3, mechanic: 2, diplomat: 2, economist: 1 },
  boatId: 'meltemi_40',
  checkpoints: ['impeller', 'toilets', 'gas', 'damage_photos', 'electrics'],
  briefingTopics: ['captain_only', 'cleats', 'loaded_lines', 'toilet'],
  briefingDialogues: ['ten_bonus'],
  morning: () => ({ openBarometer: true, dialogueId: null }),
  plan(s, c) {
    const legs = todaysLegs(EXPERT_ITINERARY, s, c);
    const legPlans: LegPlan[] = legs.map((routeId) => {
      const wind = expectedWind(s, c, routeId, true);
      return { routeId, mode: wind >= SAIL_MIN_WIND_KN ? 'sail' : 'motor', reefs: reefsFor(wind, c), genoa: 'full', course: 'direct' };
    });
    const nm = legs.reduce((sum, id) => sum + c.routes.find((r) => r.id === id)!.distanceNm, 0);
    return { departureHour: 8.5, legs: legPlans, swimStops: nm < 12 ? 1 : 0, shower: 'strict', autopilot: false };
  },
  chooseOption(s, c, ev) {
    const opts = available(s, c, ev);
    return opts.reduce((best, o) => (scoreOption(o, s, c) > scoreOption(best, s, c) ? o : best), opts[0]!).id;
  },
  evening: (s, c) => ({ dinner: hasTaverna(s, c) && s.resources.moneyEur > EXPERT_TAVERNA_MIN_MONEY ? 'taverna' : 'cook', dialogueId: 'decide_morning' }),
};

export const newbie: Strategy = {
  name: 'newbie',
  voices: { sea_sense: 0, caution: 0, order: 0, mechanic: 4, diplomat: 4, economist: 4 },
  boatId: 'aurora_45',
  checkpoints: ['sails', 'anchor'],
  briefingTopics: ['sails', 'mob', 'fenders', 'anchor'],
  briefingDialogues: ['early_try', 'beach_week'],
  morning: () => ({ openBarometer: false, dialogueId: 'early_try' }),
  plan(s, c) {
    const legs = todaysLegs(NEWBIE_ITINERARY, s, c).map((routeId): LegPlan => ({
      routeId, mode: expectedWind(s, c, routeId, false) >= SAIL_MIN_WIND_KN ? 'sail' : 'motor', reefs: 0, genoa: 'full', course: 'direct',
    }));
    return { departureHour: 10.5, legs, swimStops: 2, shower: 'loose', autopilot: true, maneuverOrders: reversedOrders(c) };
  },
  chooseOption: (s, c, ev) => available(s, c, ev)[0]!.id,
  evening: (s, c) => ({ dinner: hasTaverna(s, c) ? 'taverna' : 'cook', dialogueId: 'promise_taverna' }),
};
```

- [ ] **Step 5: Write `src/sim/run.ts`, `src/sim/report.ts`, `scripts/simulate.ts`**

```ts
// src/sim/run.ts
import { buildDebrief, type Debrief } from '../engine/debrief';
import { endDay, finishWeek } from '../engine/day/evening';
import { startDay } from '../engine/day/morning';
import { planDay } from '../engine/day/passage';
import { resolvePendingEvent } from '../engine/events';
import { assignVoices, chooseBoat, newGame, performBriefing, performCheckin } from '../engine/setup';
import { requireEvent } from '../engine/state';
import type { Content, GameState, Grade, Lang, Pillar } from '../engine/types';
import type { Strategy } from './strategies';

export interface WeekResult { state: GameState; debrief: Debrief }

const GRADE_POINTS: Record<Grade, number> = { good: 2, ok: 1, bad: 0 };

export function setupWeek(content: Content, seed: number, strategy: Strategy, lang: Lang = 'ru'): GameState {
  let s = newGame(content, { seed, lang });
  s = assignVoices(s, content, strategy.voices);
  s = chooseBoat(s, content, strategy.boatId);
  s = performCheckin(s, content, strategy.checkpoints);
  return performBriefing(s, content, strategy.briefingTopics, strategy.briefingDialogues);
}

export function drainEvents(state: GameState, content: Content, strategy: Strategy): GameState {
  let s = state;
  while (s.eventQueue.length > 0) {
    const ev = requireEvent(content, s.eventQueue[0]!);
    s = resolvePendingEvent(s, content, strategy.chooseOption(s, content, ev));
  }
  return s;
}

export function playDay(state: GameState, content: Content, strategy: Strategy): GameState {
  let s = drainEvents(startDay(state, content, strategy.morning(state, content)), content, strategy);
  s = drainEvents(planDay(s, content, strategy.plan(s, content)), content, strategy);
  return endDay(s, content, strategy.evening(s, content));
}

export function runWeek(content: Content, seed: number, strategy: Strategy): WeekResult {
  let s = setupWeek(content, seed, strategy);
  while (s.phase === 'morning') s = playDay(s, content, strategy);
  s = finishWeek(s, content);
  return { state: s, debrief: buildDebrief(s, content) };
}

export function weekScore(d: Debrief): number {
  const grades: Grade[] = [d.scales.safety, d.scales.crew, d.scales.boat, d.scales.schedule];
  return grades.reduce((sum, g) => sum + GRADE_POINTS[g], 0);
}

/** Pillars that changed resources, damages, flags or injuries at least once. */
export function pillarsAffected(state: GameState): Set<Pillar> {
  return new Set(state.log.filter((e) => e.kind === 'effect' && e.pillar && (e.delta || e.data)).map((e) => e.pillar!));
}
```

```ts
// src/sim/report.ts
import { formatClock } from '../engine/time';
import type { Content, Lang } from '../engine/types';
import type { WeekResult } from './run';

const L = {
  ru: { day: 'День', scales: { safety: 'Безопасность', crew: 'Экипаж', boat: 'Лодка', schedule: 'Расписание' }, deposit: 'Депозит возвращён', links: 'Связи' },
  en: { day: 'Day', scales: { safety: 'Safety', crew: 'Crew', boat: 'Boat', schedule: 'Schedule' }, deposit: 'Deposit returned', links: 'Links' },
} as const;

export function formatWeek(result: WeekResult, content: Content, lang: Lang): string {
  const t = L[lang];
  const lines: string[] = [];
  const days = [...new Set(result.state.log.map((e) => e.day))].filter((d) => d >= 1);
  for (const day of days) {
    lines.push(`\n${t.day} ${day}`);
    for (const e of result.state.log.filter((x) => x.day === day && (x.kind === 'event' || x.kind === 'signal' || x.delta || x.data?.damage || x.data?.injury))) {
      const ev = e.kind === 'event' ? content.events.find((x) => `event:${x.id}` === e.cause) : undefined;
      const delta = e.delta ? ` ${JSON.stringify(e.delta)}` : '';
      lines.push(`  ${formatClock(e.clockMin)} ${e.cause}${delta}${ev ? ` — ${ev.text[lang]}` : ''}`);
    }
  }
  const d = result.debrief;
  lines.push('');
  for (const [k, g] of Object.entries(d.scales)) lines.push(`${t.scales[k as keyof typeof t.scales]}: ${g}`);
  lines.push(`${t.deposit}: ${d.depositReturnedEur} €`);
  lines.push(`${t.links}:`);
  for (const l of d.links) lines.push(`  • ${l.text[lang]}`);
  for (const n of d.eventNotes) lines.push(`  • ${n[lang]}`);
  return lines.join('\n');
}
```

```ts
// scripts/simulate.ts
import { parseArgs } from 'node:util';
import { loadContentDir } from '../src/content/load-node';
import { formatErrors } from '../src/content/parse';
import { PILLARS, type Lang } from '../src/engine/types';
import { formatWeek } from '../src/sim/report';
import { pillarsAffected, runWeek, weekScore } from '../src/sim/run';
import { expert, newbie } from '../src/sim/strategies';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '42' },
    strategy: { type: 'string', default: 'newbie' },
    batch: { type: 'string' },
    lang: { type: 'string', default: 'ru' },
  },
});

const { content, errors } = await loadContentDir('content');
if (!content) {
  console.error(formatErrors(errors));
  process.exit(1);
}

const mean = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);

if (values.batch) {
  const n = Number(values.batch);
  for (const strategy of [newbie, expert]) {
    const runs = Array.from({ length: n }, (_, i) => runWeek(content, i + 1, strategy));
    const pillarFreq = PILLARS.map((p) => `${p}:${runs.filter((r) => pillarsAffected(r.state).has(p)).length}/${n}`).join(' ');
    console.log(`${strategy.name.padEnd(7)} score ${mean(runs.map((r) => weekScore(r.debrief)))}/8 | mood ${mean(runs.map((r) => r.state.resources.mood))} | deposit loss ${mean(runs.map((r) => r.debrief.depositLossEur))} € | injuries ${mean(runs.map((r) => r.state.injuries))} | links ${mean(runs.map((r) => r.debrief.links.length))}`);
    console.log(`        pillars ${pillarFreq}`);
  }
} else {
  const strategy = values.strategy === 'expert' ? expert : newbie;
  console.log(formatWeek(runWeek(content, Number(values.seed), strategy), content, values.lang as Lang));
}
```

- [ ] **Step 6: Run tests; tune balance only if acceptance fails**

Run: `npx vitest run && npx tsc --noEmit && npm run simulate -- --batch 40`
Expected: все тесты PASS; в batch-выводе у `expert` score заметно выше, чем у `newbie`.

Если падает приёмочный тест #2, #3 или #4, это сигнал баланса, а не ошибка теста. Порядок действий:
1. Посмотри `npm run simulate -- --seed <N> --strategy newbie` на проблемных сидах и найди столп, который не срабатывает, или ловушку, которая не наказывает.
2. Меняй **значения** в `content/balance.json` или `chance`/эффекты в `content/events.json`. Ключи, типы и тесты не трогай: юнит-тесты читают замороженную `tests/fixtures/balance.json`.
3. Ослабить порог в тесте можно только с явного согласия координатора и с записью причины в commit message.
4. Каждую правку баланса сопровождай строкой в commit body: `balance: <ключ> <старое> → <новое> (<почему>)`.

- [ ] **Step 7: Commit**

```bash
git add src/engine/index.ts src/sim scripts/simulate.ts tests/sim content/balance.json content/events.json
git commit -m "feat: add week simulation, strategies and ТЗ 7.4 acceptance tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review (выполнено при написании плана)

**Покрытие ТЗ:**

| Раздел ТЗ | Задача |
|---|---|
| 2 Столпы и ловушки | T14 (данные ловушек), T15 (события по 6 столпам), T18 (#2, #3) |
| 3 Фазы партии, дневной цикл, драматургия | T13 (фазы 1–4), T16/T17 (дни 1–6, возврат), T12 (`drama.pillarWeightByDay`), T11 (разбор) |
| 4.1 Ресурсы | T6, T16 (топливо на ноге), T17 (ночь) |
| 4.2 Голоса | T8, T12 (реплики, проверки) |
| 4.3 Погода | T3, T16 (`signal:front`) |
| 4.4 Паруса | T4, T16 (`sailRisks`) |
| 4.5 Время | T5, T16 |
| 4.6 Брифинг | T13, T15 (события проверяют флаги), T9 (`mitigatedBy`) |
| 4.7 Обещания | T7, T12 (`effect.promise`), T17 |
| 4.8 Манёвры | T9, T14, T16 (`runManeuver`) |
| 4.9 Оценка недели | T11 |
| 5 Модель данных, формат событий | T1 (типы), T10 (схемы), T12 (условия), T14/T15 (JSON) |
| 5.3 Лог причин, seed, валидатор | T1/T6 (лог), T1 (rng), T10/T12 (валидатор), T18 (#7) |
| 7.1 Движок отдельно от UI, тесты, симуляция без UI | Global Constraints, T18 (`simulate`) |
| 7.2 Объём MVP | T14 (3 лодки, 9 точек, 1 погода, 2 архетипа, 8 тем), T15 (30 событий, RU+EN) |
| 7.4 Критерии готовности | T18 (по тесту на каждый пункт) |
| 6 Экраны и стиль | **Вне Этапа 1** — отдельный план Этапа 2/4. `EventView` и `index.ts` — контракт для UI |

**Решения, принятые по неоднозначностям ТЗ** (вынести в ТЗ v0.2):
- «6 прокачиваемых голосов» из 8: прокачиваются все, кроме Гордости и Голоса экипажа. У них фиксированный уровень из баланса.
- Добавлен 11-й файл контента `maneuvers.json` (эпизоды 4.8 — это данные, ТЗ 5.1 их не перечисляет).
- Фронт приходит после `afternoonFromHour` (13:00): так ранний выход становится осмысленным решением.
- Экипаж по умолчанию — 4 гостя (`balance.start.crewSize`), открытый вопрос 7.5 закрыт конфигом.
- Сломанный гальюн/`mood_per_day` сбрасывается ночёвкой у причала («терпеть до марины»).

**Dry-run плана (2026-10-18).** Все блоки кода извлечены в чистый проект, `events.json` собран из спец-блоков T15 (EN временно заглушкой). Результат: `tsc --noEmit` чистый, **22 файла / 138 тестов зелёные**, включая приёмку 7.4. `npm run simulate -- --batch 40`:

```
newbie  score 0.1/8 | mood 2.6   | deposit loss 2322 € | injuries 3.5 | links 5.0
expert  score 8.0/8 | mood 100.0 | deposit loss 0 €    | injuries 0.0 | links 1.1
```

Механика работает, но баланс слишком поляризован: новичок проигрывает всё, у эксперта настроение упирается в 100, а травм в среднем 3.5 за неделю. Это вход для Этапа 3 (плейтест-баланс), Этап 1 он не блокирует. Цель Этапа 3: newbie 2–4/8, expert 6–7/8, травмы у новичка ≤ 1 за неделю.

**Проверки:** плейсхолдеров нет; имена функций и типов сверены между задачами (`applyOutcome`, `sayDialogue`, `queueEvent`, `runManeuver`, `maneuverOrders: Partial<Record<ManeuverKind, string[]>>`, cause `order:wrong:<id>`). Числовые ожидания тестов пересчитаны вручную, расчёты приведены рядом с тестами T6, T16, T17.
