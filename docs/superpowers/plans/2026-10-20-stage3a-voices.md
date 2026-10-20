# Stage 3a: Content Foundation and Visible, Growing Voices — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every random roll in the engine becomes a data-described chance with a visible per-source breakdown, voices gain XP and level up during the week, every trainable voice has a player-visible job, and content moves into packs with a dead-content validator and an extended simulator.

**Architecture:** A new pure module `src/engine/chance.ts` evaluates `ChanceSpec` (base + additive/multiplicative mods over the existing condition context) and returns `{ value, parts }`. `src/engine/odds.ts` builds specs for the engine's built-in rules from `balance.json` so numbers stay identical. XP lives in `GameState.voiceXp`, is granted through `Effect.xp`, and converts to levels in `endDay`. The UI renders `ChanceValue` through one `ChanceBadge` component; the debrief adds a "Voices of the week" block computed from log entries.

**Tech Stack:** TypeScript 5, React 19, Vite 5.4, Vitest 2, zod 3, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-stage3-mechanics-design.md` (§3 and §4; §7 for saves and tests).

## Global Constraints

- The UI imports the engine only via `src/engine/index.ts`; `tests/ui/boundaries.test.ts` enforces it.
- The engine stays pure and deterministic. All randomness goes through `src/engine/rng.ts`, with state in `GameState.rng`. One seed and the same decisions give the same week.
- `chance(` from `rng.ts` may be called only inside `src/engine/rng.ts` and `src/engine/chance.ts` (spec §4.5).
- Every user-facing string exists in RU and EN. `tests/ui/i18n.test.ts` must stay green. Content texts are `{ ru, en }`.
- Hex colours only in `src/ui/styles/tokens.css`. CSS Modules for components.
- Immutable updates only (spread), no mutation of state objects.
- Content numbers are copied exactly from the spec:
  - `voices.xpToLevel: [6, 10, 15, 21]`;
  - default XP: check success +1, check fail +3, maneuver error `order +3`, clean maneuver `order +1` at most once per day;
  - `xpExempt: ['pride', 'crew_voice', 'economist']`;
  - economist −5% per level on marina, fuel, gas and taverna spending;
  - Sea Sense: level 3 shows the front chance, level 4 shows the front hour;
  - `maxLevel` 4, start 12 points.
- Save key becomes `skipper.save.v2`. A v1 save is not migrated: the menu shows the incompatibility message and clears it.
- Commits use conventional format with the session attribution trailer.

## Review Focus

1. **Odds shown vs odds rolled.** The percentage the UI shows for an option or risk must equal the probability the engine rolls in the same state. Task 3 adds a test that rolls via `rollChance` with the same spec the view used.
2. **Level-up mid-day.** XP earned during the day must not change any chance until the evening. Task 4 tests that a check after an XP gain on the same day uses the old level.
3. **XP at level 4 and for exempt voices.** XP is not stored beyond the cap and never for exempt voices, so a save cannot grow unbounded counters. Task 4 tests both.
4. **Old save in localStorage.** A player with a v1 mid-week save opens the new version. They must see a clear message and a working menu, not a crash or a corrupt-save banner loop. Task 10 tests it.
5. **Determinism across the refactor.** Migrating the rolls to specs must not change any seeded week. Task 3 snapshots final-state hashes for seeds 1–20 before the change and asserts them after.

## Rulings Made While Planning

- **The Order level 3+ maneuver hint** (spec §4.2) depends on the berth situation, which arrives in 3c. Deferred to plan 3c. In 3a, Order has visible risk and check effects only.
- **Dead content assigned to 3b** (spec §5.5: `bowThruster`, `generator`, `toilet_valve`, checkpoint `electrics`, topic `sails`) goes into a validator allowlist with reason `plan-3b`. 3a removes or wires everything else. 3b must empty the allowlist.
- **Simulator** already exists (`src/sim`, `scripts/simulate.ts`, strategies `newbie` and `expert`). 3a extends it. New strategies (`careful`, `reckless`, `ignore-weakness`) arrive with 3b, where boat weaknesses exist.
- **Sim thresholds** live in `balance.simTargets` (spec §7.4: "threshold in data, not in test").
- **Crew names in event texts** (Sveta/Denis) are a 3c item (placeholders). Not touched here.

---

## File Structure

| File | Responsibility |
|---|---|
| `content/core/*.json` | balance, boats, maneuvers, crew, briefing, dialogues, debrief (moved) |
| `content/regions/archipelago/region.json` | `{ id, name, map, routes }` (from map.json and routes.json) |
| `content/regions/archipelago/weather/*.json` | one weather template per file |
| `content/regions/archipelago/events.json` | events (moved) |
| `content/core/dead-content-allow.json` | allowlist `[{ ref, reason }]` |
| `src/content/files.ts` | single map: logical file → relative path, shared by node and Vite loaders |
| `src/content/load-node.ts`, `src/ui/content.ts` | load packs |
| `src/content/dead.ts` | dead-content detector |
| `src/engine/chance.ts` | `ChanceSpec` evaluation and roll |
| `src/engine/odds.ts` | specs for built-in rules (check, injury, sail break, reef, anchor, marina, event trigger, front) |
| `src/engine/xp.ts` | grant XP, evening level-ups |
| `src/engine/perks.ts` | `voicePerks()` for captain screen, economist pricing, sea-sense insight |
| `src/engine/voice-report.ts` | "Voices of the week" from log |
| `src/sim/batch.ts` | batch statistics |
| `src/ui/components/ChanceBadge.tsx` | percentage plus expandable breakdown |
| `src/ui/screens/debrief/VoicesBlock.tsx` | debrief block |

---

### Task 1: Content packs

**Files:**
- Move: `content/{balance,boats,maneuvers,crew,briefing,dialogues,debrief}.json` → `content/core/`
- Create: `content/regions/archipelago/region.json` (from `map.json` and `routes.json`), `content/regions/archipelago/weather/meltemi_week.json` (the single template object from `weather.json`), `content/regions/archipelago/events.json`
- Create: `src/content/files.ts`
- Modify: `src/content/parse.ts`, `src/content/load-node.ts`, `src/ui/content.ts`, `src/content/schema.ts`, `src/engine/types.ts` (`Content.region`), `scripts/validate-content.ts`, `scripts/simulate.ts`, `tests/sim/acceptance.test.ts`, `tests/content/*.test.ts` (paths), `README.md` (content section)
- Test: `tests/content/packs.test.ts`

**Interfaces:**
- Produces:
  - `Content.region: { id: string; name: LocalizedText }`;
  - `loadContentDir(dir: string, regionId = 'archipelago'): Promise<ParseResult>`;
  - `loadBundledContent(regionId = 'archipelago'): ParseResult`.
- `ContentFile` gains `'region'`. `map`, `routes` and `weather` are still `Content` fields, filled from the region pack.

- [ ] **Step 1: Write the failing test** `tests/content/packs.test.ts`:
  - `loadContentDir('content')` returns content with `region.id === 'archipelago'`, 3 boats, the same `map.length`, `routes.length` and `events.length` as before the move (hard-code today's counts: 30 events);
  - `weather.length === 1`;
  - a missing `content/regions/nope` gives an error, not a throw;
  - `loadBundledContent()` deep-equals the node-loaded content.
- [ ] **Step 2: Run** `npx vitest run tests/content/packs.test.ts`. Expected: FAIL.
- [ ] **Step 3: Move the files with `git mv`, then implement.**
  - `files.ts` exports `CORE_FILES` and `REGION_FILES`.
  - Node: weather is every `*.json` in `weather/`, sorted by name.
  - Vite: `import.meta.glob('../../content/regions/*/weather/*.json', { eager: true })`, filtered by region.
  - `region.json` schema: `{ id, name, map: MapPoint[], routes: Route[] }`.
- [ ] **Step 4: Run** `npm test && npm run validate-content && npm run typecheck && npm run build`. Expected: all green; validate prints "Content OK".
- [ ] **Step 5: Commit** `refactor: split content into core and region packs`.

---

### Task 2: Chance specs

**Files:**
- Create: `src/engine/chance.ts`
- Modify: `src/engine/types.ts`, `src/content/schema.ts`
- Test: `tests/engine/chance.test.ts`

**Interfaces:**
- Produces in `types.ts`:
```ts
export const CHANCE_LABELS = ['base', 'difficulty', 'fatigue', 'mitigation', 'seabed', 'wind', 'night', 'briefing', 'late', 'drama', 'checkin', 'worn'] as const;
export type ChanceLabel = (typeof CHANCE_LABELS)[number];
/** add: value += add. mul: value *= mul. `per` scales by a numeric context key (e.g. 'voice.caution', 'fatigue'): add → add*ctx[per]; mul → factor (1 + mul*ctx[per]). `if` gates the mod. */
export interface ChanceMod { if?: string; per?: string; add?: number; mul?: number; label?: ChanceLabel }
export interface ChanceSpec { base: number; mods?: ChanceMod[]; min?: number; max?: number }
export type ChanceInput = number | ChanceSpec;
/** source: a ChanceLabel, or the `per` key (e.g. 'voice.caution') when no label is given. */
export interface ChancePart { source: string; delta: number }
export interface ChanceValue { value: number; parts: ChancePart[] }
```
- Produces in `chance.ts`:
  - `evaluateChance(input: ChanceInput, ctx: CondContext): ChanceValue`;
  - `rollChance(rng: number, input: ChanceInput, ctx: CondContext): RngResult<{ hit: boolean; odds: ChanceValue }>`.
- Order of evaluation: base, then all `add` mods in order, then all `mul` mods in order, then clamp to `[min ?? 0, max ?? 1]`. Each mod yields one part whose delta is the change it caused at its point in the sequence. A clamp that changes the value adds a part `{ source: 'clamp', delta }`. Parts sum to `value` (within 1e-9).
- A mod with exactly one of `add` or `mul` is valid. Both or neither is a content error (zod refine).

- [ ] **Step 1: Write the failing tests** `tests/engine/chance.test.ts`:
  - `evaluateChance(0.3, {})` gives `{ value: 0.3, parts: [{ source: 'base', delta: 0.3 }] }`;
  - spec `{ base: 0.5, mods: [{ per: 'voice.order', add: 0.15 }, { per: 'fatigue', add: -0.004, label: 'fatigue' }] }` with ctx `{ 'voice.order': 2, fatigue: 25 }` gives value `0.7`, parts `base 0.5`, `voice.order 0.3`, `fatigue −0.1`;
  - mul: `{ base: 0.2, mods: [{ per: 'voice.caution', mul: -0.08 }, { per: 'voice.order', mul: -0.1 }] }` with caution 2, order 1: value `0.2*0.84*0.9 = 0.1512`, parts sum to value;
  - `if` false leaves the mod out of the parts entirely;
  - clamp: `{ base: 0.9, mods: [{ add: 0.3, label: 'wind' }], max: 0.95 }` gives value 0.95 and a clamp part of −0.25;
  - `rollChance` consumes exactly one draw whatever the value (compare `next` with `nextFloat(rng).next`);
  - unknown `per` key throws `EngineError('CONTENT')`.
  - Schema test: `ChanceInputSchema` accepts a number and a spec, and rejects a mod with both `add` and `mul`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/chance.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `chance.ts` and `ChanceInputSchema` in `schema.ts`. `per` keys resolve via the same lookup rules as `expr.ts` (export a `lookupNumber(ctx, key)` from `expr.ts`).
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): chance specs with per-source breakdown`.

---

### Task 3: Route every roll through chance specs

**Files:**
- Create: `src/engine/odds.ts`
- Modify:
  - `src/engine/voices.ts` (`rollCheck`, `checkChance`);
  - `src/engine/maneuver.ts`;
  - `src/engine/time.ts` (`anchoring`, `anchorFailChance`, `marinaArrival`);
  - `src/engine/events.ts` (trigger roll, `EventView`);
  - `src/engine/day/legs.ts` (sail break, reef injury);
  - `src/engine/weather.ts` (front);
  - `src/engine/expr.ts` (context keys);
  - `src/engine/types.ts` (`EventTrigger.chance: ChanceInput`, `LogEntry.odds?`, `LogKind` + `'roll'`);
  - `src/engine/preview.ts`;
  - `src/engine/index.ts`;
  - `src/content/schema.ts`.
- Test: `tests/engine/odds.test.ts`, `tests/engine/determinism.test.ts`, `tests/engine/no-raw-chance.test.ts`, existing tests updated only where an API's return type changed.

**Interfaces:**
- Consumes: `evaluateChance` and `rollChance` from Task 2.
- New context keys in `buildConditionContext`, also added to `CONTEXT_KEYS`:
  - `night` (`clockMin >= sunsetHour*60`);
  - `place.seabed` (string, current point);
  - `marina.late` (boolean, set by caller only; default false).
- Produces in `odds.ts`. All are pure and reproduce today's formulas exactly:
  - `checkSpec(check: VoiceCheck, b: Balance): ChanceSpec`. Base `b.checks.base - difficulty*perLevel` (label `difficulty`), `per voice.<v> add perLevel`, `per fatigue add -checkPenaltyPerPoint` (label `fatigue`), min and max from `b.checks`.
  - `injurySpec(baseChance: number, mitigatedBy: string | undefined, b: Balance): ChanceSpec`. Mods: `per voice.caution mul -cautionRiskPerLevel`, `per voice.order mul -orderRiskPerLevel`, `if mitigatedBy mul (mitigationFactor-1)` (label `mitigation`).
  - `sailBreakSpec(breakChance: number, b: Balance): ChanceSpec`. Same caution and order muls.
  - `anchorFailSpec(b: Balance): ChanceSpec`. Base `lo`. Per seabed: `if "place.seabed == '<s>'" add (hi-lo)*factor` (label `seabed`, only for factor > 0). `if "wind >= <kn>" add` (label `wind`). `if night add` (label `night`). `if briefing.anchor add -reduction` (label `briefing`). max 0.95.
  - `marinaRefusalSpec(b: Balance): ChanceSpec`. Base 0, `if marina.late add marinaLateRefusalChance` (label `late`).
  - `eventTriggerSpec(e: GameEvent, day: number, b: Balance): ChanceSpec`. The trigger input normalised to a spec, plus `mul (pillarWeight-1)` (label `drama`) when the weight is not 1, and `max: 1`.
- Changed public types:
  - `EventView.options[].chance: ChanceValue | null`;
  - `LegPreview.breakChance: ChanceValue`;
  - `PlanPreview.marinaRefusal: ChanceValue | null` (destination marina or quay);
  - `PlanPreview.anchorFail: ChanceValue | null` (destination bay, per attempt);
  - `PlanPreview.destinationSeabed: Seabed`.
- New engine API (`index.ts`):
  - `maneuverRisk(state, content, kind: ManeuverKind): ChanceValue | null`. The injury spec of that maneuver's highest-`injuryChance` error, with mitigation flags applied; null if the maneuver has no injurable error.
  - Export `evaluateChance` and the types.
- Logging: every roll appends `{ kind: 'roll', cause: 'roll:<what>:<id>', odds, data: { hit } }`. Causes:
  - `roll:check:<event>:<option>` (replaces the old `check:` entry; keep `data.success` and `data.chance`, logbook depends on them);
  - `roll:injury:maneuver:<m>:<err>`;
  - `roll:sail_break:<route>`;
  - `roll:injury:reef:<route>`;
  - `roll:anchor:<attempt>`;
  - `roll:marina:<point>`;
  - `roll:front:<day>`.

  Event-trigger rolls are not logged (hidden from the player).

- [ ] **Step 1: Snapshot before changing code.** Write `tests/engine/determinism.test.ts`, which runs `runWeek(content, seed, newbie|expert)` for seeds 1..20 and compares a stable hash of each `(state.resources, state.damages, state.injuries, state.firedEvents, state.rng)` with a JSON fixture `tests/fixtures/determinism.json`. Generate the fixture on the current code (`UPDATE_SNAPSHOT=1` env path in the test), commit it, and confirm the test passes **before** Step 3.
- [ ] **Step 2: Write the failing tests.**
  - `tests/engine/odds.test.ts`: for a grid of levels, difficulties, fatigue, seabeds, winds, night, briefing and mitigation, each `odds.ts` builder evaluated by `evaluateChance` equals the old formula (copy today's formulas into the test as reference functions).
  - `maneuverRisk` for `mooring_med` with caution 2, order 1 and no briefing equals `maxInjury*0.84*0.9`.
  - Review Focus 1: `presentEvent(...).options[i].chance.value` equals the `odds.value` that `resolvePendingEvent` logs for the same state.
  - `tests/engine/no-raw-chance.test.ts`: read every `src/engine/**/*.ts` and assert `/\bchance\(/` matches only in `rng.ts` and `chance.ts`.
- [ ] **Step 3: Implement.** Replace each raw `chance(...)` with `rollChance(rng, spec, ctx)`. Where a call site lacks a context, build it with `buildConditionContext(state, content)` plus the per-call keys (`'marina.late'`). Keep the draw order identical: one draw per roll in the same sequence as today.
- [ ] **Step 4: Run** `npm test`. Expected: all green, including the determinism snapshot **unchanged**.
- [ ] **Step 5: Commit** `refactor(engine): route all rolls through chance specs and log their odds`.

---

### Task 4: XP and evening level-ups

**Files:**
- Create: `src/engine/xp.ts`
- Modify:
  - `src/engine/types.ts`: `Effect.xp`, `GameState.voiceXp`, `GameState.version: 2`, `Balance.voices.xpToLevel/xpExempt/cleanManeuverXp/maneuverErrorXp/checkXp`, `ManeuverError.xp?`, `EventOption.xp?`;
  - `src/engine/resources.ts` (`applyOutcome`);
  - `src/engine/events.ts`;
  - `src/engine/day/arrival.ts` (`runManeuver`);
  - `src/engine/day/evening.ts`;
  - `src/engine/setup.ts`;
  - `content/core/balance.json`, `tests/fixtures/balance.json`;
  - `src/content/schema.ts`.
- Test: `tests/engine/xp.test.ts`

**Interfaces:**
- Balance additions (exact values):
```json
"voices": { ..., "xpToLevel": [6, 10, 15, 21], "xpExempt": ["pride", "crew_voice", "economist"],
  "checkXp": { "success": 1, "fail": 3 }, "maneuverErrorXp": 3, "cleanManeuverXp": 1 }
```
- `Effect.xp?: Partial<Record<TrainableVoice, number>>`.
- `GameState.voiceXp: Record<TrainableVoice, number>`, all 0 at `newGame`.
- `xp.ts`:
  - `grantXp(state: GameState, xp: Partial<Record<TrainableVoice, number>>, cause: string, b: Balance): GameState`. Skips exempt voices and voices at `maxLevel`. Logs `{ kind: 'info', cause: 'xp:<voice>:<cause>', data: { xp } }` per voice granted.
  - `applyLevelUps(state: GameState, b: Balance): GameState`. For each trainable voice: at most one level per call; if `xp >= xpToLevel[level]`, level +1 and xp −threshold; at `maxLevel`, xp becomes 0. Logs `{ kind: 'info', cause: 'levelup:<voice>:<newLevel>', data: { from, to } }`.
- Grants:
  - `applyOutcome` calls `grantXp` when `effect.xp` is present;
  - check result: `checkXp` to the checked voice unless `option.xp` overrides;
  - each maneuver error: `order: maneuverErrorXp` unless `error.xp` overrides;
  - a maneuver with no errors: `order: cleanManeuverXp` if no `xp:order:order:ok:*` entry exists for today. Use cause `order:ok:<maneuverId>`.
- `endDay` calls `applyLevelUps` after expectations, before `night`.

- [ ] **Step 1: Write the failing tests** `tests/engine/xp.test.ts`:
  - a failed check grants +3 to that voice, a success +1;
  - a maneuver with two errors grants `order +6`;
  - two clean maneuvers on one day grant `order +1` once;
  - a voice at level 4 gets no XP;
  - `economist` gets no XP even from an explicit `effect.xp`;
  - `applyLevelUps` with `order` level 1 and xp 12 gives level 2 and xp 2 (threshold 10), and logs `levelup:order:2`;
  - with xp 40 at level 1, one call raises only one level;
  - Review Focus 2: after a failed check in the morning, a second check the same day uses the original level, and the level changes only after `endDay`;
  - `newGame(...).version === 2` and `voiceXp` all zero.
- [ ] **Step 2: Run** `npx vitest run tests/engine/xp.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as specified. Regenerate the determinism fixture (XP adds log entries but no RNG draws; the `rng` part of the hash must stay equal — if it does not, stop and report).
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): voice XP from checks and maneuvers, evening level-ups`.

---

### Task 5: Every voice has a job

**Files:**
- Create: `src/engine/perks.ts`
- Modify:
  - `src/engine/types.ts`: `VoiceLine.when?: string`; `Balance.voices.economistDiscountPerLevel`, `seaSenseChanceLevel`, `seaSenseTimingLevel`;
  - `src/engine/voices.ts` (`audibleLines` takes ctx);
  - `src/engine/events.ts`;
  - `src/engine/resources.ts` (`refillAt`);
  - `src/engine/day/arrival.ts` (marina fee);
  - `src/engine/day/evening.ts` (taverna);
  - `src/engine/promises.ts`;
  - `src/engine/day/morning.ts`;
  - `src/engine/index.ts`;
  - `content/core/balance.json`, `tests/fixtures/balance.json`.
- Test: `tests/engine/perks.test.ts`

**Interfaces:**
- Balance: `"economistDiscountPerLevel": 0.05, "seaSenseChanceLevel": 3, "seaSenseTimingLevel": 4`.
- `perks.ts`:
  - `priceFor(eur: number, economistLevel: number, b: Balance): { eur: number; savedEur: number }`, rounded to 0.1. Used for:
    - marina fee (`marina:fee`);
    - taverna (`activity:taverna`);
    - fuel refill (`refill:fuel`);
    - gas exchange (`refill:gas`).

    When `savedEur > 0`, append `{ kind: 'info', cause: 'voice:economist:saved', data: { eur: savedEur, for: <cause> } }`.
  - `forecastInsight(state: GameState, content: Content): { frontChance: number | null; frontFromHour: number | null }`. `frontChance` = today's template `frontChance` if sea_sense ≥ `seaSenseChanceLevel`; `frontFromHour` = `b.weather.afternoonFromHour` if sea_sense ≥ `seaSenseTimingLevel` and today is a front day; otherwise null.
  - `voicePerks(voice: TrainableVoice, level: number, b: Balance): VoicePerk[]`, where `type VoicePerk = { id: PerkId; value?: number }` and `PerkId` is one of:
    - `'risk_injury'` (value = combined multiplier delta for this voice, e.g. −0.16);
    - `'maneuver_time'` (+0.10);
    - `'check_bonus'` (+0.15 per level vs level 0);
    - `'exact_gauges'`;
    - `'local_wind'`;
    - `'front_signals'`;
    - `'front_chance'`;
    - `'front_timing'`;
    - `'promise_softening'` (−0.1/level);
    - `'discount'` (−0.05/level).

    Each perk's presence and value derive from `balance.voices` (e.g. `exact_gauges` iff `level >= mechanicExactLevel`).
- Diplomat: `resolveDueExpectations` logs `{ kind: 'info', cause: 'voice:diplomat:softened', data: { mood } }`, where `mood` = penalty without diplomat minus actual penalty, logged only if > 0.
- Sea Sense: `startDay` logs `voice:sea_sense:front_seen` when `front && visible && !openBarometer` (the warning came from the voice, not the barometer).
- `audibleLines(lines, voices, ctx: CondContext)`: a line is audible when `voices[voice] >= min_level` and (`when` absent or true).

- [ ] **Step 1: Write the failing tests** `tests/engine/perks.test.ts`:
  - `priceFor(85, 2, b)` gives `{ eur: 76.5, savedEur: 8.5 }`;
  - an economist-2 week logs `voice:economist:saved` on a marina night and the fee charged is 76.5;
  - `forecastInsight` with sea_sense 2, 3 and 4 on a front day returns null/null, chance/null and chance/hour;
  - `voicePerks('mechanic', 2, b)` contains `exact_gauges`, and `voicePerks('mechanic', 1, b)` does not;
  - `voicePerks('caution', 2, b)` has `risk_injury` value `-0.16`;
  - a broken promise with diplomat 2 logs `voice:diplomat:softened` with mood = 20% of the base penalty;
  - a crew_voice line with `when: "mood < 50"` is audible at mood 40 and silent at mood 60.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Update the determinism fixture if money changed only for seeds whose strategy puts points in economist (strategies today use 0 economist; if the hash changes, investigate before updating).
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): economist pricing, sea-sense insight, diplomat and voice perks`.

---

### Task 6: Dead-content detector

**Files:**
- Create: `src/content/dead.ts`, `content/core/dead-content-allow.json`
- Modify:
  - `src/content/parse.ts` (run the detector after cross-validation);
  - `src/content/schema.ts`, `src/engine/types.ts`: drop `MapPoint.depthM`;
  - `content/regions/archipelago/region.json`: drop `depthM`;
  - events that set the flags `promised_sailing` and `mob_drill_done`: remove those `flag` effects, or add a reader — remove, they have no designed consumer.
- Test: `tests/content/dead.test.ts`

**Interfaces:**
- `findDeadContent(c: Content, allow: ReadonlyArray<{ ref: string; reason: string }>): ContentError[]`. Each error has `file: 'cross'` and `path: <ref>`. Refs:
  - `flag:<name>`: a flag written by an effect but not read by any condition, `requires` or `mitigatedBy`;
  - `flag-read:<name>`: read but never written and not a checkin/briefing/defect/wish/damage prefix;
  - `checkpoint:<id>`: no defect uses it and no condition reads `checkin.<id>`;
  - `topic:<id>`: no condition or `mitigatedBy` reads `briefing.<id>`;
  - `defect:<id>`: no condition reads `defect.<id>` and no `chargedOnReturn`;
  - `boat-field:<key>`: a `BOAT_KEYS` entry no condition reads;
  - `allow:<ref>`: an allowlist entry that is no longer dead (keeps the allowlist honest).
- Allowlist (exact content):
```json
[
  { "ref": "boat-field:boat.bow_thruster", "reason": "plan-3b" },
  { "ref": "boat-field:boat.generator", "reason": "plan-3b" },
  { "ref": "defect:toilet_valve", "reason": "plan-3b" },
  { "ref": "checkpoint:electrics", "reason": "plan-3b" },
  { "ref": "topic:sails", "reason": "plan-3b" }
]
```
  Add `boat-field:boat.solar` and `boat-field:boat.electric_toilet`/`boat.shared_bank` only if the detector reports them; read the report and list in the commit message what was allowlisted and why.

- [ ] **Step 1: Write the failing tests** `tests/content/dead.test.ts` with a minimal fixture content (`tests/fixtures/content.ts`):
  - a written but unread flag is reported as `flag:x`;
  - an unused checkpoint is reported;
  - an allowlisted ref is not reported;
  - a stale allowlist entry is reported as `allow:<ref>`;
  - the real `content/` passes with the allowlist above.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, then clean the content until `npm run validate-content` passes.
- [ ] **Step 4: Run** `npm test && npm run validate-content`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(content): dead-content detector, remove depthM and orphan flags`.

---

### Task 7: Voice content

**Files:**
- Modify: `content/regions/archipelago/events.json`
- Test: `tests/content/voice-lines.test.ts`

**Requirements** (RU and EN for every text; style as in the existing lines: short, inner-voice, second person):
- **Level 3–4 lines:** for each of `sea_sense`, `caution`, `order`, `mechanic`, `diplomat`, at least 2 lines with `min_level` 3 or 4 across the events. They carry a concrete number or fact the lower lines don't, e.g. «Тридцать узлов у мыса к трём часам» rather than «будет ветрено». Put them in events where that voice already speaks.
- **Crew voice:** at least 4 `crew_voice` lines with `when` on `mood`, 2 for `mood < 50` and 2 for `mood >= 70`.
- **Economist:** at least 3 more `economist` lines (`min_level` 1–2) in marina/taverna/fuel events. They push towards the cheap option and are sometimes right.
- **Two new diplomat events:**
  1. `neighbor_complains`:
     - pillar `promises`, phase `evening`, conditions `["moored_berth"]`, chance 0.3;
     - options:
       - `apologize` (effects `mood -2`);
       - `talk_it_over` (check `diplomat` difficulty 2, success `mood +3`, fail `mood -5`);
       - `ignore` (effects `mood -4`, `fatigue +5`).
  2. `marinero_tip`:
     - pillar `time`, phase `arrival`, conditions `["at_marina", "hour >= 14"]`, chance 0.35;
     - options:
       - `tip` (effects `money -20`, `mood +2`);
       - `chat` (check `diplomat` difficulty 2, success `mood +4`, fail `time_hours 0.5`);
       - `nothing` (effects none).
  
  Both events have scene ids that exist in the SceneArt set (reuse `marina`), voice lines including `diplomat` and `pride`, and debrief text.

- [ ] **Step 1: Write the failing test** `tests/content/voice-lines.test.ts`:
  - counts per voice of lines with `min_level >= 3` (≥ 2 each for the five voices);
  - `crew_voice` lines with `when` (≥ 4);
  - `economist` lines (≥ 4 total);
  - events `neighbor_complains` and `marinero_tip` exist with the exact triggers above;
  - every `when` parses (`parseCondition`).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Write the content.**
- [ ] **Step 4: Run** `npm test && npm run validate-content`. Expected: PASS.
- [ ] **Step 5: Commit** `content: higher-level voice lines, mood-aware crew voice, diplomat events`.

---

### Task 8: Voices of the week (engine)

**Files:**
- Create: `src/engine/voice-report.ts`
- Modify: `src/engine/debrief.ts` (`Debrief.voices`), `src/engine/index.ts`
- Test: `tests/engine/voice-report.test.ts`

**Interfaces:**
```ts
export type VoiceImpact =
  | { kind: 'risk'; rolls: number; avgDeltaPp: number }        // sum of this voice's parts over 'roll:injury:*' and 'roll:sail_break:*', in percentage points, negative = safer
  | { kind: 'checks'; passed: number; failed: number }         // 'roll:check:*' entries for this voice
  | { kind: 'saved_eur'; eur: number }                         // 'voice:economist:saved'
  | { kind: 'front_warned'; days: number[] }                   // 'voice:sea_sense:front_seen'
  | { kind: 'softened'; mood: number };                        // 'voice:diplomat:softened'
export interface VoiceReport {
  voice: TrainableVoice; startLevel: number; endLevel: number;
  xp: Array<{ cause: string; xp: number }>;                    // from 'xp:<voice>:<cause>' entries, grouped by cause root (e.g. 'order:wrong', 'roll:check')
  levelUps: Array<{ day: number; to: number }>;
  impacts: VoiceImpact[];                                      // only non-empty impacts
}
export function voiceReport(state: GameState): VoiceReport[];  // TRAINABLE_VOICES order; voices with no xp, no level-up and no impact are omitted
```
- `startLevel` comes from the `voices:<v>:<lvl>` decision entries written by `assignVoices`.
- `Debrief` gains `voices: VoiceReport[]`.

- [ ] **Step 1: Write the failing tests** `tests/engine/voice-report.test.ts`, built from hand-made log arrays:
  - two injury rolls with `voice.caution` parts −0.02 and −0.04 give `risk avgDeltaPp -3`;
  - economist saved 8.5 + 10 gives `saved_eur 18.5`;
  - a voice with nothing is omitted;
  - level-ups are listed with the day;
  - `buildDebrief` of a full sim week contains `voices` with at least one entry.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): voices-of-the-week report in debrief`.

---

### Task 9: Simulator batch report and targets

**Files:**
- Create: `src/sim/batch.ts`
- Modify:
  - `scripts/simulate.ts`: flags `--weeks N` (alias of `--batch`), `--json <path>`;
  - `content/core/balance.json`, `src/engine/types.ts`, `src/content/schema.ts`: `simTargets`;
  - `tests/sim/acceptance.test.ts`.
- Test: `tests/sim/batch.test.ts`

**Interfaces:**
- `balance.simTargets` (exact):
```json
"simTargets": { "levelGain": { "newbie": [2, 4], "expert": [1, 4] }, "weekInjuryRate": { "newbie": [0.15, 0.7], "expert": [0, 0.2] }, "zeroFireAllow": [] }
```
- `batch.ts`:
  - `runBatch(content: Content, strategy: Strategy, seeds: readonly number[]): BatchStats`;
  - `interface BatchStats { weeks: number; eventRate: Record<string, number>; zeroFire: string[]; levelGainMean: number; weekInjuryRate: number; resourceZeroDay: Record<'water'|'service'|'fuel'|'gas', number | null>; meanScore: number }`.

    `levelGainMean` = mean of (sum of final trainable levels − sum of start levels). `resourceZeroDay` = mean day of the first `zero:<r>` entry among weeks where it happened, null if never.
  - `formatBatch(stats: BatchStats, name: string): string` gives markdown.
- Acceptance additions (100 seeds per strategy):
  - `levelGainMean` within `simTargets.levelGain[strategy]`;
  - `weekInjuryRate` within its band;
  - `zeroFire` across both strategies combined ⊆ `zeroFireAllow`.

- [ ] **Step 1: Write the failing tests** `tests/sim/batch.test.ts`:
  - `runBatch` over 5 seeds returns `weeks 5`;
  - `eventRate` values are in [0, 1];
  - `formatBatch` contains every event id with a rate.
  
  Add the three acceptance assertions to `tests/sim/acceptance.test.ts`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Run `npm run simulate -- --weeks 200` and read the report.
  - If an acceptance band fails, you may tune only `voices.xpToLevel` (keeping it increasing) and the strategies' choices.
  - Event ids that cannot fire with today's map or strategies go into `zeroFireAllow`, each named in the commit message.
  - If the injury band fails, do not change balance. Report `DONE_WITH_CONCERNS` with the measured numbers.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(sim): batch statistics and data-driven acceptance targets`.

---

### Task 10: Save v2

**Files:**
- Modify: `src/ui/session/save.ts`, `src/ui/screens/menu/MenuScreen.tsx`, `src/ui/screens/menu/strings.ts`, `src/ui/session/reducer.ts` (if it reads save kinds)
- Test: `tests/ui/session/save.test.ts`

**Interfaces:**
- `SAVE_KEY = 'skipper.save.v2'`, `LEGACY_SAVE_KEYS = ['skipper.save.v1']`.
- `SaveRead` gains `{ kind: 'legacy' }`. `readSave` returns it when no v2 slot exists but a legacy key does, and removes the legacy key.
- Schema validates:
  - `version: z.literal(2)`;
  - `voiceXp: z.record(z.enum(TRAINABLE_VOICES), num)`;
  - `expectations`: the full `Expectation` shape;
  - `weather`: `DayWeather` or null;
  - `dayFacts`: `DayFacts` or null;
  - log entries may carry `odds: { value, parts: [{ source, delta }] }`.

  No `z.unknown()` remains.
- Menu: on `legacy`, shows `legacySave` («Сохранение от старой версии несовместимо — начни новую неделю» / «Your save is from an older version and can't be loaded — start a new week»), once, with the normal menu below.

- [ ] **Step 1: Write the failing tests:**
  - a v2 round-trip;
  - a v1 slot gives `legacy` and the key is removed;
  - a v2 slot with a malformed `expectations[0]` gives `corrupt`;
  - Review Focus 4: rendering the menu with a v1 slot shows the message, «Новая неделя» works, and a reload shows no message.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): save format v2 with strict schema and legacy-save notice`.

---

### Task 11: Odds in the UI

**Files:**
- Create: `src/ui/components/ChanceBadge.tsx`, `src/ui/components/ChanceBadge.module.css`, `src/ui/view/chance.ts`
- Modify:
  - `src/ui/screens/event/EventScreen.tsx`;
  - `src/ui/screens/maneuvers/ManeuversScreen.tsx`;
  - `src/ui/screens/planning/PreviewPanel.tsx`;
  - `src/ui/view/strings.ts` (chance labels);
  - the related `strings.ts`.
- Test: `tests/ui/components/ChanceBadge.test.tsx`, updates to the event, maneuvers and planning screen tests

**Interfaces:**
- `src/ui/view/chance.ts`:
  - `partLabel(source: string, lang: Lang): string`. `voice.<v>` → the voice name with its level («Порядок 2»); `ChanceLabel` → a localized word; `base` → «база» / «base»; `clamp` → «предел» / «limit».
  - `formatPart(p: ChancePart): string` → `+15%` or `−5%` (pp, rounded to an integer, real minus sign); 0-rounded parts are hidden.
- `<ChanceBadge odds={ChanceValue} label?: string />`. A button showing `label · NN%`. Tap or Enter toggles a list of parts (`aria-expanded`, `aria-controls`). Min tap target 44px.
- Placement:
  - EventScreen: replaces the current `[voice · pct%]` span.
  - ManeuversScreen: under the title, «Если ошибёшься — риск травмы до NN%» / «If you get it wrong — injury risk up to NN%» with a badge from `maneuverRisk`.
  - PreviewPanel:
    - per sail leg «Риск порвать парус» / «Sail damage risk» when `breakChance.value > 0`;
    - `marinaRefusal` when not null and > 0;
    - `anchorFail` with the seabed name («Грунт: камень» / «Seabed: rock»).

- [ ] **Step 1: Write the failing tests:**
  - ChanceBadge: renders 65%; clicking shows «база», «Механик 3 +15%» and «усталость −5%»; `aria-expanded` toggles; keyboard Enter works.
  - Screen tests: the event option shows the badge with the same value as `presentEvent`; the maneuvers screen shows the risk line; the preview shows the seabed and anchor odds for a bay destination.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS (i18n test included).
- [ ] **Step 5: Commit** `feat(ui): chance badges with breakdown on events, maneuvers and plan preview`.

---

### Task 12: Captain perks, evening growth, logbook

**Files:**
- Modify:
  - `src/ui/screens/captain/CaptainScreen.tsx` and `strings.ts`;
  - `src/ui/screens/evening/EveningScreen.tsx` and `strings.ts`;
  - `src/ui/view/logbook.ts`;
  - `src/ui/screens/planning/ForecastPanel.tsx` (sea-sense insight);
  - `src/ui/view/strings.ts`.
- Test: updates to the captain, evening, logbook and forecast tests

**Requirements:**
- **Captain screen:** under each voice's slider, a list of perks for the **currently allocated level** from `voicePerks(voice, level, b)`, plus a muted line for the next level's new perk («Ур. 3: шанс фронта числом»). Perk texts are localized templates with `{value}` as a signed percent.
- **Evening screen:** a «Чему научил день» / «What today taught you» block listing today's `xp:*` entries grouped by voice (voice name, `+N`, cause text from the logbook formatter), and a highlighted line per `levelup:*` entry («⬆ Порядок 2 → 3»). The block is hidden when empty. Level-ups are applied when `endDay` runs, so the screen shows the **preview**: add engine API `pendingLevelUps(state, b): Array<{ voice, from, to }>` (pure; same rule as `applyLevelUps`) in Task 12, exported from `index.ts`, with a unit test.
- **Logbook lines** for `xp:*`, `levelup:*`, `voice:economist:saved`, `voice:diplomat:softened`, `voice:sea_sense:front_seen`, and `roll:*` (a roll line shows the outcome and `NN%`; the full breakdown is behind the same ChanceBadge).
- **ForecastPanel:** shows `forecastInsight` lines when not null («Чутьё: шанс фронта 45%», «Чутьё: фронт после 13:00»).

- [ ] **Step 1: Write the failing tests:**
  - captain: at mechanic 2, «точные цифры» is shown; at 1, the next-level hint is;
  - evening: after a failed check, `+3` under the voice and a level-up preview line when the threshold is reached;
  - logbook: formats each new cause in RU and EN;
  - forecast: sea_sense 3 shows the chance;
  - `pendingLevelUps` equals `applyLevelUps`'s logged level-ups on the same state.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): voice perks on captain screen, daily growth on evening screen, new logbook lines`.

---

### Task 13: Debrief voices block and full-week checks

**Files:**
- Create: `src/ui/screens/debrief/VoicesBlock.tsx`
- Modify: `src/ui/screens/debrief/DebriefScreen.tsx` and `strings.ts`, `tests/ui/week.test.tsx`, `tests-e2e/smoke.spec.ts`
- Test: `tests/ui/screens/debrief/VoicesBlock.test.tsx`

**Requirements:**
- **VoicesBlock**, «Голоса недели» / «Voices of the week». One card per `VoiceReport`:
  - voice name, `start → end` level;
  - XP sources (top 3 by XP);
  - impacts rendered as sentences:
    - `risk`: «снизила риск на N п.п. в K бросках» / «cut risk by N pp over K rolls»;
    - `checks`: «проверки: N из M»;
    - `saved_eur`: «сэкономил N €»;
    - `front_warned`: «предупредило о фронте: ср, чт» (weekday names from the existing day formatter);
    - `softened`: «смягчил обиды на N».
  
  Placed after the scales, before the links.
- **Week bot** (`tests/ui/week.test.tsx`): RU and EN runs assert that the evening screen showed at least one XP line during the week and that the debrief shows the voices block.
- **e2e smoke:** the debrief contains the voices heading at 375 and 1280 px.

- [ ] **Step 1: Write the failing tests:**
  - the VoicesBlock renders each impact kind in RU and EN from a hand-made report;
  - the week bot assertions;
  - the e2e assertion.
- [ ] **Step 2: Run** `npm test` and `npm run e2e`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm test && npm run validate-content && npm run build && npm run e2e`. Expected: all green.
- [ ] **Step 5: Commit** `feat(ui): voices-of-the-week block in debrief`.

---

## Execution Order

| Wave | Tasks | Why |
|---|---|---|
| 0 | T1 | moves every content path |
| 1 | T2 | types used by everything after |
| 2 | T3 | changes engine signatures the UI and later tasks consume |
| 3 | T4, T6 | disjoint files (engine XP vs content validator) |
| 4 | T5 | touches `events.ts`, `resources.ts` and `evening.ts` after T4 |
| 5 | T7, T8, T9, T10 | content, engine report, sim, save: disjoint |
| 6 | T11, T12, T13 | UI; T12 and T13 depend on T8 and T11's ChanceBadge, so run T11 first, then T12 and T13 together |

## Self-Review

| Spec item | Task |
|---|---|
| §3.1 content packs | T1 |
| §3.2 new condition keys | T3 (`night`, `place.seabed`, `marina.late`). `wind.side`, `place.marinero`, `system.*` and `leg.feature.*` belong to 3b/3c |
| §3.3 chance with breakdown, all rolls, logged parts | T2, T3 |
| §3.4 `xp` effect | T4. `repair`, `wear` and `break` belong to 3b |
| §3.5 XP as data, defaults, thresholds, exempt | T4 |
| §3.6 validate dead content, sim report | T6, T9 |
| §4.1 odds on events, maneuvers, preview | T11 |
| §4.2 voice jobs | T5, T7. The Order hint is deferred to 3c (ruling). Mechanic failure/repair belong to 3b |
| §4.3 growth in the evening, journal | T4, T12 |
| §4.4 voices in the debrief | T8, T13 |
| §4.5 acceptance: grep test, UI, XP, economist/crew voice, lines 3–4, debrief, validate, sim in CI, packs + save v2 | T3, T11, T4/T12, T5/T7, T13, T6, T9 (vitest runs in CI), T1/T10 |
| §7.1 save v2 strict schema | T10 |
| §7.3 determinism | T3 snapshot, re-checked in T4 and T5 |
