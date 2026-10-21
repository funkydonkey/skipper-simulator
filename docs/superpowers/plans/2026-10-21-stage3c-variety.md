# Stage 3c: Days That Differ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every week and every day differ: four seeded weather templates with jitter, sheltered and exposed bays on the chart, a berth situation (wind side, marinero, seabed, tightness) that changes the correct maneuver order, two new maneuvers with a berth choice in the planner, events rolled per leg with cooldowns and text variants, and a seeded crew whose names are substituted into texts.

**Architecture:**
- **Weather:** chosen by a pure seed hash, so newGame's RNG is untouched; jitter draws happen when the day starts.
- **Situation:** a new pure `Situation` value is built twice. At planning time it comes from the forecast, with the marinero shown as a chance. At arrival it comes from fact, with a seeded marinero roll. It feeds the condition context through new keys (`wind.side`, `place.*`).
- **Conditional maneuvers:** steps and errors carry a `when`. The engine filters them against that context and reconciles the player's order with the actual step set, so orders given from the forecast still work when the facts differ.
- **Events:** cooldowns are derived from the existing log. Text variants and crew-member choice use pure hashes, not RNG draws.

**Tech Stack:** TypeScript 5, React 19, Vite 5.4, Vitest 2, zod 3, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-stage3-mechanics-design.md` (§6; §3.2 for condition keys; §7 for saves, determinism and tests). Builds on Stage 3b (branch `stage3b`, PR #4).

## Global Constraints

- The UI imports the engine only via `src/engine/index.ts` (`tests/ui/boundaries.test.ts`). The engine has no `Math.random`, `Date`, DOM or React.
- The engine is pure, immutable and deterministic.
  - Every random roll goes through `rollChance` or `rng.ts`. `tests/engine/no-raw-chance.test.ts` stays green.
  - New choices that must not shift the RNG stream (template, crew, text variant, crew member in a text) use `seedHash(...parts): number` from Task 1, never `state.rng`.
- Every user-facing string is RU + EN. Content texts are `{ ru, en }`, with natural Russian and correct orthography. `tests/ui/i18n.test.ts` stays green.
- Hex colours only in `src/ui/styles/tokens.css`. CSS Modules for components.
- Chance mods use the 3a form `{ if?, per?, add?, mul?, label? }`, with adds applied before muls. New labels are added to `CHANCE_LABELS`.
- The expression language has no `in` operator. Content writes `x == 'a' || x == 'b'`.
- Numbers from the spec: 4 weather templates; jitter `±1` compass step and `±2` kn; the two new maneuvers `mooring_side_to` and `anchor_stern_ashore`; `once` defaults to `true`; new trigger fields `cooldownDays` and `maxPerWeek`; placeholders `{crew.any}` and `{crew.role:<role>}`.
- `GameState.version` and `SAVE_VERSION` go 3 → 4. Version-3 saves take the existing legacy path (cleared, notice shown).
- Scripts are `npm run simulate` / `npm run validate-content`.
- Conventional commits with the session trailer.

## Review Focus

1. **The forecast situation differs from the fact.** The player orders steps against the forecast: crosswind, a marinero expected. At arrival there is no marinero and the wind is on the bow. The maneuver must still run and judge errors fairly: no `INVALID_INPUT`, no crash. Task 3 tests a forecast order against a different fact.
2. **The bot newbie's reversed static orders.** They contain steps absent from today's situation, and they lack conditional steps. A sim week must not throw. Task 3 tests it, Task 7 runs 100 weeks.
3. **Several queued events per day.** Per-leg passage events can queue more than one event, plus arrival and evening. The UI resolves them one by one, and saving with a pending event stays blocked. Task 5 tests a day with 2 passage events.
4. **An unaffordable or impossible berth choice.** The player picks side-to at the quay, but the money only covers stern-to, or the marina refuses. They get the existing no-money or refusal path, not a crash. Task 3 tests it.
5. **A text with a placeholder but no matching crew.** `{crew.role:sailor}` when the seeded crew has no sailor. It falls back to any crew member, never prints `{crew.role:sailor}`. Task 6 tests it.

## Rulings Made While Planning

- **R1: Template choice.** `newGame` picks `content.weather[seedHash(seed, 'weather') % n]` over the templates sorted by id, unless `weatherTemplateId` is given. The meltemi file keeps id `meltemi_week`. Cost: tests on bundled content must pass `weatherTemplateId` where they pin NW weather.
- **R2: Jitter draws.** Jitter uses 2 `rng` draws per day in `rollDayWeather`, before the front roll. The determinism fixture is regenerated in Task 1. Cost: one fixture rebaseline.
- **R3: Kinds and berths.** `MANEUVER_KINDS` stays 4 kinds. A new optional `Maneuver.berth` (`'stern_to' | 'side_to' | 'anchor' | 'anchor_ashore'`) picks between maneuvers of the same kind: `mooring_side_to` is kind `mooring` with berth `side_to`, and `anchor_stern_ashore` is kind `anchoring` with berth `anchor_ashore`. Orders stay keyed by kind, since there is only one mooring per day. Cost: orders for different berths share the kind's "as last time" slot. The partial-match rule in Task 9 handles that.
- **R4: Order reconciliation.** Plan-time validation only checks that order ids belong to the maneuver and have no duplicates. At run time `reconcileOrder(order, steps)` keeps the order's steps that exist today, in the player's order, and appends missing steps in content order, as if they came last. Errors are judged on the reconciled order. Cost: a forgotten conditional step only counts as an error through the content's pairwise errors.
- **R5: No new state for cooldowns.** `cooldownDays` and `maxPerWeek` are computed from the log entries `{ kind: 'event', cause: 'event:<id>', day }`. Cost: a log scan per eligible event, which is small.
- **R6: Per-leg passage events.** One passage roll happens per leg, after the leg runs. The leg's context is spread in: `wind` and `wind.dir` at the leg's time, and `leg.feature.<f>`. First hit wins per leg. Arrival and evening stay once per day. Cost: up to three passage events on a 3-leg day.
- **R7: Crew names are nominative only.** Event texts that need another grammatical case are rewritten to use the nominative. Example: «Кепка Иры улетела» becomes «{crew.any} провожает взглядом улетевшую кепку». Cost: a little copy work, but no declension engine.
- **R8: Variety gate.** Spec §6.6 asks for "at least 3 different step sets for `mooring_med` in a week". The sim records the step set on every maneuver. The acceptance check is that across 100 `careful` weeks on each boat, at least 3 distinct `mooring_med` step sets occur and the mean per-week distinct count is ≥ 1.5. Both thresholds live in `balance.simTargets.variety`. A boat moors at most 3–4 times a week, so a strict per-week 3 is not reliable. Cost: softer than the spec's literal wording. Surface this to the user.
- **R9: Version bump.** `GameState.situation` and `DayPlan.berth` are new. Version 4. Cost: 3b saves are cleared.

---

## File Structure

| File | Responsibility |
|---|---|
| `content/regions/archipelago/weather/{meltemi_week,calm_then_front,sirocco_week,variable_week}.json` | 4 templates |
| `content/regions/archipelago/region.json` | points gain `berths`, `marineroChance`, `tight` |
| `content/core/maneuvers.json` | conditional steps and errors; `mooring_side_to`, `anchor_stern_ashore` |
| `content/core/crew.json` | `role` per archetype; ≥ 5 names each |
| `src/engine/seed.ts` | `seedHash` |
| `src/engine/situation.ts` | `Situation`, `forecastSituation`, `arrivalSituation`, `windSide`, situation context |
| `src/engine/maneuver.ts` | `stepsFor`, `errorsFor`, `reconcileOrder`, berth-aware selection, `situationHint` |
| `src/engine/crew.ts` | seeded crew, `renderText` placeholder substitution |
| `src/engine/events.ts` | cooldown, maxPerWeek, text variants, per-leg roll entry point |
| `src/sim/batch.ts` | step-set variety metric |
| `src/ui/components/chart/*` | shelter badges |
| `src/ui/screens/planning/*` | berth choice |
| `src/ui/screens/maneuvers/*` | situation card, conditional steps, hint, partial "as last time", 2 sketches |

---

### Task 1: Weather templates, seeded choice, jitter, shelter helper

**Files:**
- Create: `src/engine/seed.ts`; `content/regions/archipelago/weather/calm_then_front.json`, `sirocco_week.json`, `variable_week.json`
- Modify:
  - `src/engine/setup.ts` (`newGame`), `src/engine/weather.ts` (`rollDayWeather`, `pointShelter`);
  - `src/engine/types.ts`, `src/content/schema.ts` (balance `weather.jitter`, optional template `jitter`);
  - `content/core/balance.json`, `tests/fixtures/balance.json`;
  - `src/engine/index.ts`;
  - tests pinning `weather.length === 1` or the NW default on bundled content (`tests/content/packs.test.ts`, `tests/content/world-content.test.ts`, UI tests via `tests/ui/fixtures.ts`).
- Test: `tests/engine/seed.test.ts`, `tests/engine/weather.test.ts` (extend), `tests/content/weather-content.test.ts`

**Interfaces:**
- Produces:
  - `seedHash(...parts: Array<string | number>): number`, an unsigned 32-bit FNV-1a over the joined parts;
  - `pointShelter(point: MapPoint, dir: Dir8, b: Balance): 'sheltered' | 'exposed'`, which is exposed when `exposure(point, dir) > b.fatigue.rollyExposure`;
  - balance `weather.jitter: { dirSteps: 1, kn: 2 }`, overridable per template by an optional `jitter`;
  - `rollDayWeather` applies jitter to `forecastDir`, `forecastKn` and `forecastGustKn`, with the gust shifted by the same delta and kn kept ≥ 0. It uses 2 draws per day: `nextInt(-dirSteps, dirSteps)`, then `nextInt(-kn, kn)`. The front roll follows unchanged. The front direction shifts from the jittered direction.
- Templates (RU/EN names; days 1..6 of `{windKn, gustKn, dir, frontChance, barometerHpa}`):
  - `calm_then_front` «Штиль, потом фронт» / "Calm, then a front": W 6/9 .05 1016; SW 7/10 .1 1014; SW 10/15 .6 1006; N 18/26 .5 1004; NW 15/22 .2 1010; NW 13/19 .1 1013; afternoonFactor 1.2.
  - `sirocco_week` «Неделя сирокко» / "Sirocco week": SE 12/18 .05 1012; S 15/22 .1 1010; SE 18/26 .15 1008; S 16/24 .2 1008; SW 13/19 .1 1010; SE 12/18 .05 1012; afternoonFactor 1.15.
  - `variable_week` «Переменная неделя» / "Variable week": N 9/14 .1 1014; E 11/16 .15 1012; SW 13/19 .25 1010; W 10/15 .2 1011; NE 14/20 .3 1009; S 8/12 .1 1013; afternoonFactor 1.2.

- [ ] **Step 1: Write failing tests.**
  - `seedHash`: `seedHash(1, 'a') === seedHash(1, 'a')`, `seedHash(1, 'a') !== seedHash(2, 'a')`, result is an integer in `[0, 2^32)`.
  - `newGame(bundled, { seed })` over seeds 1..200 uses all 4 template ids, and `state.rng === seed` right after `newGame`.
  - An explicit `weatherTemplateId: 'sirocco_week'` wins.
  - Jitter:
    - 200 days of a fixed template never move more than 1 compass step or 2 kn from the template;
    - both extremes occur;
    - with `jitter: { dirSteps: 0, kn: 0 }` the forecast equals the template.
  - `pointShelter(vela_bay, 'NW', b) === 'exposed'`, `pointShelter(vela_bay, 'SE', b) === 'sheltered'`.
  - The content test checks that 4 templates exist with ids as above, each covering days 1..6, and that across the 4 templates at least 6 distinct day directions occur.
- [ ] **Step 2: Run** `npx vitest run tests/engine/seed.test.ts tests/engine/weather.test.ts tests/content/weather-content.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Tests that pin NW/12 kn on bundled content pass `weatherTemplateId: 'meltemi_week'` explicitly. Update the count pins to 4. Regenerate the determinism fixture with `UPDATE_SNAPSHOT=1` (R2); the sim's `setupWeek` now varies templates by seed.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run validate-content`. Expected: green. Record the sim acceptance results; if bands fail, mark exactly those assertions `it.skip` with `// re-enabled in 3c Task 7` and list them in the report. Task 7 re-enables them.
- [ ] **Step 5: Commit** `feat(engine): four seeded weather templates with daily jitter`.

---

### Task 2: Berths and the situation model

**Files:**
- Create: `src/engine/situation.ts`
- Modify:
  - `src/engine/types.ts`: `BerthType`, `Berth`, `MapPoint.berths`, `marineroChance`, `tight`, `Situation`, `GameState.situation`, `DayPlan.berth`, `version: 4`, `CHANCE_LABELS` + `'marinero'`;
  - `src/content/schema.ts`, `src/content/validate.ts` (berths match point kind);
  - `src/engine/expr.ts`, `src/content/conditions.ts` (new keys);
  - `content/regions/archipelago/region.json`, `content/core/balance.json` and fixture (`situation` block);
  - `src/ui/session/save.ts` (version 4, `situation` schema), `tests/fixtures/*`.
- Test: `tests/engine/situation.test.ts`

**Interfaces:**
- Produces:
```ts
export type BerthType = 'stern_to' | 'side_to' | 'anchor' | 'anchor_ashore';
export interface Berth { type: BerthType; headingDeg: number } // bow heading when moored
export type WindSide = 'bow' | 'stern' | 'port' | 'starboard' | 'none';
export interface Situation {
  berth: BerthType; windSide: WindSide; windKn: number; windDir: Dir8;
  marinero: boolean;            // fact (arrival) or most-likely (forecast)
  marineroOdds: ChanceValue | null; // forecast only; null when the point has no marinero
  seabed: Seabed; tight: boolean; source: 'forecast' | 'fact';
}
// MapPoint: berths: Berth[] (min 1); marineroChance: Prob (0 for bays); tight?: boolean
// GameState.situation: Situation | null  (set at arrival, null after endDay)
// DayPlan.berth?: BerthType (must be one of the destination's berths; default berths[0])
```
- In `situation.ts`:
  - `windSide(windFromDeg: number, headingDeg: number, windKn: number, b: Balance): WindSide`. It returns `'none'` when `windKn < b.situation.calmKn` (4). Otherwise it uses `rel = (windFromDeg - headingDeg + 360) % 360`: ≤ 45 or ≥ 315 is bow, (45, 135) is starboard, [135, 225] is stern, (225, 315) is port.
  - `marineroSpec(point: MapPoint, b: Balance): ChanceSpec` is `{ base: point.marineroChance, mods: [{ if: 'hour >= 18', mul: -0.5, label: 'marinero' }] }`.
  - `forecastSituation(state, content, plan): Situation | null` is pure. It takes the destination, the plan's berth, the forecast wind at the preview's arrival hour (front only if the signals are visible, as `previewPlan` does) and `marineroOdds`. `marinero` is `odds ≥ 0.5`. It returns null on a stay day.
  - `arrivalSituation(state, content, point, berth): RngResult<Situation>` uses the real wind at the arrival clock. For points with `marineroChance > 0` it makes one `rollChance` (logged as `roll:marinero:<pointId>`).
  - `situationContext(s: Situation | null): Record<string, string | number | boolean>` gives `wind.side`, `wind.kn`, `wind.dir`, `place.marinero`, `place.tight`, `place.berth`. When null the values are `'none'`, the plain wind, `''`, false, false and `''`.
  - `buildConditionContext` spreads `situationContext(state.situation)`. `place.seabed` stays as today.
- Region data:

  | point | berths (type headingDeg) | marineroChance | tight |
  |---|---|---|---|
  | base_marina | stern_to 180 | 0.9 | — |
  | kastri_marina | stern_to 90 | 0.8 | true |
  | porto_lungo_marina | stern_to 270 | 0.7 | — |
  | nisi_quay | stern_to 0; side_to 90 | 0.3 | — |
  | cala_azzurra, vela_bay, capo_rosso_bay | anchor 0 | 0 | — |
  | blue_lagoon, fjord_bay | anchor 0; anchor_ashore 0 | 0 | true |

- Validation: bays may only have `anchor`/`anchor_ashore`; marina/quay/base only `stern_to`/`side_to`; `marineroChance` is 0 for bays.

- [ ] **Step 1: Write failing tests.**
  - `windSide`: from 0/heading 0 → bow; 90/0 → starboard; 180/0 → stern; 270/0 → port; 3 kn → none.
  - `forecastSituation` for a plan ending at nisi_quay with `berth: 'side_to'` → berth side_to, `source: 'forecast'`, `marineroOdds.value` 0.3 before 18:00 and 0.15 after; it consumes no RNG.
  - `arrivalSituation` consumes exactly one draw at a marina and none at a bay; it logs `roll:marinero:<id>` with odds.
  - Condition context with no situation gives `wind.side === 'none'` and `place.marinero === false`. `evaluate("wind.side == 'port' || wind.side == 'starboard'", ctx)` works.
  - The schema rejects a bay with a `stern_to` berth.
  - Save: a version-3 slot gives the legacy notice; a v4 slot with a malformed `situation` is rejected.
- [ ] **Step 2: Run** `npx vitest run tests/engine/situation.test.ts tests/ui/session/save.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `GameState.situation` stays null in this task. Task 3 sets it at arrival. `endDay` resets it to null.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run validate-content`. Expected: green, determinism unchanged (no new draws yet).
- [ ] **Step 5: Commit** `feat(engine): berths, wind side and the berth situation`.

---

### Task 3: Situation-aware maneuvers

**Files:**
- Modify:
  - `src/engine/maneuver.ts`;
  - `src/engine/day/arrival.ts` (situation at arrival, berth choice, side-to fee, ashore effects), `src/engine/day/passage.ts` (`validateOrders`, departure context), `src/engine/day/evening.ts` (reset situation), `src/engine/preview.ts` (situation, berth-aware risk);
  - `src/engine/types.ts` (`ManeuverStep.when?`, `ManeuverError.when?`, `Maneuver.berth?`), `src/content/schema.ts`, `src/content/validate.ts` (one default maneuver per kind; berth uniqueness), `src/content/conditions.ts` and `src/content/dead.ts` (read `when`);
  - `content/core/balance.json` and fixture (`berths` block);
  - `src/engine/index.ts`.
- Test: `tests/engine/maneuver-situation.test.ts`

**Interfaces:**
- Produces:
  - `maneuverFor(content, kind, berth?: BerthType): Maneuver | null` returns the maneuver of that kind whose `berth` equals `berth`, else the one without a `berth`. It replaces `maneuverForKind`; keep `maneuverForKind` as a thin alias only if call sites are many.
  - `stepsFor(m, ctx): ManeuverStep[]` and `errorsFor(m, ctx): ManeuverError[]` filter by `when`, keeping content order.
  - `correctOrder(m, ctx?): string[]` returns the ids of `stepsFor(m, ctx)`. Without `ctx`, it returns all steps whose `when` is absent.
  - `validateOrder(m, order): string | null` returns an error only for unknown ids or duplicates (R4).
  - `reconcileOrder(order, steps): string[]` (R4).
  - `evaluateManeuver(rng, m, order, ctx, b)` reconciles first, then judges only `errorsFor(m, ctx)`, one draw per triggered error as today.
  - `situationHint(m, ctx, orderLevel): ManeuverStep | null` returns the first step with a `when` that is true in `ctx` when `orderLevel ≥ 3`, else null.
  - The `order:ok|wrong:<m.id>` log entry gains `data.steps: string[]` (the reconciled order).
  - `maneuverRisk(state, content, kind, situation?)` takes `errorsFor` against the given situation's context.
- Arrival flow in `arrive()`:
  - the berth is `plan.berth ?? point.berths[0].type`, validated against `point.berths` (else `INVALID_INPUT` at `validatePlan`);
  - `arrivalSituation` runs before the maneuver and sets `state.situation`;
  - the maneuver is `maneuverFor(kind, berth)` (`anchor` or `anchor_ashore` → kind anchoring; `stern_to` or `side_to` → kind mooring);
  - the existing no-money and refusal paths keep falling back to anchoring with berth `anchor`;
  - side-to fee is `priceEur × balance.berths.sideToPriceFactor` (1.5) through `priceFor`;
  - `anchor_ashore` adds `{ time_hours: balance.berths.ashoreTimeHours (0.5) }` and applies an anchor-fail mod `{ if: "place.berth == 'anchor_ashore'", mul: balance.berths.ashoreAnchorFailMul (-0.5), label: 'seabed' }` inside `anchorFailSpec`;
  - departure and anchor_up run with `situation` null (the origin's wind side is not modelled).
- The preview exposes `situation: Situation | null` (from `forecastSituation`) and `berths: BerthType[]` for the destination. The anchor-fail and maneuver-risk previews use the planned berth.

- [ ] **Step 1: Write failing tests** with a fixture maneuver: steps `a`, `b`, `c` (where `c` has `when: "wind.side == 'port'"`), and an error `c_late` with `when` equal to that and `wrongIf { first: 'b', then: 'c' }`.
  - `stepsFor` with `wind.side` 'port' → a, b, c; with 'bow' → a, b.
  - `reconcileOrder(['b','a'], [a,b,c]) → ['b','a','c']`; `reconcileOrder(['c','a','b'], [a,b]) → ['a','b']`.
  - Review Focus 1: an order given against a forecast with port wind is evaluated against a fact with bow wind. No throw; `c_late` is not judged.
  - Review Focus 2: the reversed full static order on any situation never throws.
  - The `order:ok` entry carries `data.steps`.
  - `situationHint` returns `c` at order level 3 with port wind; null at level 2.
  - Berths: a plan to nisi_quay with `berth: 'side_to'` runs `mooring_side_to` (after Task 4's content; use a fixture maneuver with `berth: 'side_to'` here) and pays the fee × 1.5. `berth: 'anchor_ashore'` at a quay → `INVALID_INPUT`.
  - Review Focus 4: side-to with money for stern-to only → the `marina:no_money` fallback to anchoring, the day completes.
  - The condition validator rejects an unknown key inside a step `when`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/maneuver-situation.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Update existing maneuver, passage, xp and preview tests for the new signatures. Regenerate the determinism fixture: the marinero roll adds draws.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run validate-content`. Expected: green, except band skips per Task 1's rule.
- [ ] **Step 5: Commit** `feat(engine): maneuvers follow the berth situation`.

---

### Task 4: Maneuver content: conditional steps and two new maneuvers

**Files:**
- Modify: `content/core/maneuvers.json`, `tests/content/*` (maneuver counts), `src/sim/strategies.ts` only if a test proves a breakage
- Test: `tests/content/maneuvers-content.test.ts`

**Interfaces:**
- Consumes: Task 3. Each step is listed at its correct position. Texts are RU/EN in the existing tone.
- `mooring_med` additions:
  - step `extra_fenders_neighbor` after `fenders_ready`, `when: "place.tight"`: «Кранцы на борт к соседу» / "Fenders out on the neighbour's side". Error `tight_no_fenders` with the same `when`: first `stern_lines_ashore`, then `extra_fenders_neighbor`; `{ damage: 'hull_scratch', mood: -5 }`; injury 0. Text «Навалились на соседа без кранцев» / "Hit the neighbour without fenders".
  - step `windward_stern_first` after `brief_roles`, `when: "wind.side == 'port' || wind.side == 'starboard'"`: «Наветренный кормовой — первым» / "Windward stern line first". Error `leeward_first` with the same `when`: first `stern_lines_ashore`, then `windward_stern_first`; `{ damage: 'hull_scratch', mood: -6 }`; injury 0.1. Text «Подветренный отдали первым — корму снесло на соседа» / "Leeward line first — the stern blew onto the neighbour".
  - step `pick_lazy_line_boathook` before `pick_mooring`, `when: "!place.marinero"`: «Поднять муринг отпорным крюком» / "Pick up the lazy line with the boathook". Error `mooring_no_hook` with the same `when`: first `pick_mooring`, then `pick_lazy_line_boathook`; `{ fatigue: 6, time_hours: 0.25 }`; injury 0.05. Text «Муринг ловили руками с кормы» / "Grabbed for the lazy line by hand from the stern".
- `anchoring_bay` addition: step `test_holding_astern` after `back_down`, `when: "place.seabed == 'rock' || place.seabed == 'weed'"`: «Проверить, держит ли якорь, задним ходом» / "Test the holding astern". Error `test_before_drop` with the same `when`: first `test_holding_astern`, then `drop_anchor`; `{ time_hours: 0.5 }`; injury 0.
- New `mooring_side_to` (kind `mooring`, berth `side_to`), title «Швартовка лагом» / "Mooring alongside":
  - steps: `fenders_side` «Кранцы на борт к причалу», `brief_roles`, `approach_angle` «Подход под острым углом», `bow_spring_first` «Носовой шпринг первым», `stern_line` «Кормовой», `bow_line` «Носовой»;
  - errors: `no_fenders_side` (first `approach_angle`, then `fenders_side`; `{ damage: 'hull_scratch', mood: -5 }`; injury 0); `stern_before_spring` (first `stern_line`, then `bow_spring_first`; `{ fatigue: 5, mood: -4 }`; injury 0.1; mitigatedBy `briefing.loaded_lines`);
  - injuryMods as `mooring_med` (broken engine +0.1; thruster mul −0.3 with `wind.side == 'port' || wind.side == 'starboard'` added to its condition).
- New `anchor_stern_ashore` (kind `anchoring`, berth `anchor_ashore`), title «Якорь и кормовой на берег» / "Anchor with a stern line ashore":
  - steps: `choose_spot`, `brief_bow`, `brief_shore` «Пловец со швартовым — к берегу», `drop_anchor`, `back_toward_shore` «Задним к берегу», `line_ashore` «Кормовой — на камень или дерево», `tighten_anchor` «Выбрать слабину якоря»;
  - errors: `back_before_drop` (first `back_toward_shore`, then `drop_anchor`; `{ time_hours: 0.5 }`; injury 0.05); `line_before_anchor` (first `line_ashore`, then `drop_anchor`; `{ fatigue: 8, mood: -4 }`; injury 0.15; mitigatedBy `briefing.anchor`);
  - injuryMods: broken engine +0.1.

- [ ] **Step 1: Write failing tests:**
  - 6 maneuvers; one berth-less default per kind; `mooring_side_to.berth === 'side_to'`, `anchor_stern_ashore.berth === 'anchor_ashore'`;
  - for `mooring_med`, the step sets under (tight × side ∈ {bow, port} × marinero ∈ {t, f}) give 8 distinct sets;
  - every `wrongIf` id exists, and every error `when` implies its steps' `when`. Check it by evaluating both across all 16 combinations of the four keys.
  - The chosen berth for each point maps to an existing maneuver.
- [ ] **Step 2: Run** `npx vitest run tests/content/maneuvers-content.test.ts`. Expected: FAIL.
- [ ] **Step 3: Edit the content.** Regenerate the determinism fixture.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run validate-content && npm run simulate -- --weeks 50`. Record the bands as in Task 1.
- [ ] **Step 5: Commit** `content: situation-dependent maneuver steps, mooring alongside and anchor with a stern line`.

---

### Task 5: Events — cooldowns, per-leg passage rolls, text variants

**Files:**
- Modify:
  - `src/engine/events.ts`, `src/engine/day/passage.ts` (per-leg roll inside the leg loop), `src/engine/types.ts` (`EventTrigger.cooldownDays?`, `maxPerWeek?`; `GameEvent.text: LocalizedText | LocalizedText[]`), `src/content/schema.ts`;
  - `src/engine/expr.ts` and `src/content/conditions.ts` (`leg.feature.<f>`, `wind.dir`);
  - `content/regions/archipelago/events.json` (cooldown/repeat on suitable events, a few text variants, leg features in conditions);
  - `src/ui/screens/event/*` only if the view type changes.
- Test: `tests/engine/events-variety.test.ts`

**Interfaces:**
- `eligibleEvents` adds three checks, all from the log (R5):
  - `once` (default true) as today;
  - `cooldownDays`: there is no `event:<id>` entry with `day > state.day - cooldownDays`;
  - `maxPerWeek`: the count of `event:<id>` entries is less than `maxPerWeek`.
- `queuePassageEvent(state, content, legCtx: Record<string, string | number | boolean>): GameState`. It runs failures for phase passage once per day as today; Task 2 of 3b keeps them day-level. It then does a generic passage roll with `{ ...buildConditionContext(state, content), ...legCtx }`. It is called after each `runLeg`, with `legCtx = { wind: legWindKn, 'wind.dir': legDir, 'leg.feature.strait': bool, 'leg.feature.cape': bool, 'leg.feature.gulf': bool, 'leg.feature.open': bool }`. `planDay` no longer rolls a generic `passage` phase at day end. Failure rolls for passage stay where 3b put them.
- `eventText(event, state): LocalizedText` returns `event.text` itself, or for an array `text[seedHash(state.seed, event.id, state.day) % n]`. It is used by `presentEvent`.
- Content:
  - make `once: false` with `cooldownDays: 2` and `maxPerWeek: 2` for at least 4 repeatable everyday events (pick sensible ones such as squalls, chop, marinero help, seasickness, neighbour noise; list them in the report);
  - give `strait_chop` the condition `leg.feature.strait` (and others where a feature fits);
  - add 2–3 text variants to at least 5 events.

- [ ] **Step 1: Write failing tests:**
  - with `once: false, cooldownDays: 2`, an event that fired on day 2 is ineligible on day 3 and eligible on day 4;
  - `maxPerWeek: 2` blocks the third firing;
  - a 3-leg day with a passage event of chance 1 conditioned on `leg.feature.strait`, where only leg 2 is a strait, queues it once and logs it at leg 2's clock;
  - Review Focus 3: a day queuing 2 passage events plus an evening event resolves them in order with `resolvePendingEvent`; `planDay` and `endDay` stay blocked until the queue is empty;
  - text variants: the same seed and day give the same text, and different days over 6 days give at least 2 variants.
- [ ] **Step 2: Run** `npx vitest run tests/engine/events-variety.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement and edit the content.** Update the event-count pins if counts change (they should not). Regenerate the determinism fixture.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run validate-content`.
- [ ] **Step 5: Commit** `feat(engine): per-leg passage events, cooldowns and text variants`.

---

### Task 6: Seeded crew and name placeholders

**Files:**
- Create: `src/engine/crew.ts`
- Modify: `src/engine/setup.ts` (`makeCrew`), `src/engine/events.ts` (`presentEvent` renders placeholders in event text, voice lines, option texts and debrief), `src/engine/types.ts` and schema (`CrewArchetype.role`), `src/content/validate.ts` (no literal crew names in event texts; placeholders must be known), `content/core/crew.json`, `content/regions/archipelago/events.json` (the 8 events naming people), UI screens showing event debrief or outcome text (use the engine renderer), `tests/fixtures/*`, `tests/engine/setup.test.ts`
- Test: `tests/engine/crew.test.ts`, `tests/content/crew-names.test.ts`

**Interfaces:**
- `CrewArchetype.role: string`: `party_guest` → `guest`, `keen_sailor` → `sailor`. Names: ≥ 5 per archetype, RU/EN. Add to the existing three: guest: Лена/Lena, Паша/Pasha; sailor: Катя/Katya, Глеб/Gleb.
- `makeCrew(content, size, seed): CrewMember[]` uses no RNG draws. For member i, the archetype is `content.crew[seedHash(seed, 'crew', i) % n]` and the name is the first unused name of that archetype, starting at index `seedHash(seed, 'name', i) % names.length`, so names are unique. `state.rng === seed` after `newGame` still holds.
- `renderText(text: string, state: GameState, content: Content, key: string): string` replaces:
  - `{crew.any}` with `state.crew[seedHash(state.seed, key) % crew.length].name[lang]`;
  - `{crew.role:<role>}` with a member of that role, picked the same way among them, falling back to `{crew.any}` when none exists (Review Focus 5);
  - unknown placeholders are left out of content by the validator.
  - The `key` is `<eventId>:<day>`, so one event uses the same person everywhere.
- Validator: event texts, voice lines, option texts and debriefs must not contain any name from `crew.json` `names`, as a whole word in either language. Placeholders must match `\{crew\.(any|role:[a-z_]+)\}`, with roles existing in `crew.json`.
- Rewrite the 8 events (gas_smell, marinero_commands, hat_overboard, taverna_question, sailor_wants_sailing, loaded_sheet, swimmer_near_prop, guest_seasick) with placeholders in the nominative (R7). Pick the role where the archetype matters, e.g. sailor_wants_sailing uses `{crew.role:sailor}` and guest_seasick uses `{crew.role:guest}`.

- [ ] **Step 1: Write failing tests:**
  - 4 crew from seeds 1..100 give varied archetype mixes and unique names; `rng` is untouched;
  - `renderText("{crew.role:sailor} ставит грот", …)` with no sailor uses a guest name;
  - the same event key gives the same name;
  - the content validator rejects an event text containing «Света» and an unknown role;
  - the bundled events contain no literal crew names.
- [ ] **Step 2: Run** `npx vitest run tests/engine/crew.test.ts tests/content/crew-names.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Update setup tests that pinned the fixed crew. Regenerate the determinism fixture if wish-dependent outcomes change.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run validate-content`.
- [ ] **Step 5: Commit** `feat(engine): seeded crew and name placeholders in event texts`.

---

### Task 7: Simulator variety metric and balance check

**Files:**
- Modify: `src/sim/batch.ts`, `src/sim/report.ts` / `scripts/simulate.ts` (print variety), `src/engine/types.ts` and schema (`simTargets.variety`), `content/core/balance.json` and fixture, `tests/sim/acceptance.test.ts`, `src/sim/strategies.ts` (plan `berth` choice for careful: side-to at the quay when wind side would be bow or stern, else default; anchor_ashore in tight bays when exposed)
- Test: `tests/sim/variety.test.ts`, `tests/sim/acceptance.test.ts`

**Interfaces:**
- `BatchStats.variety: { mooringStepSets: number; meanWeeklyMooringSets: number; templatesSeen: number; windDirsSeen: number }`, computed from the `order:*:mooring_med` entries' `data.steps` (as a joined key) and from each week's `weatherTemplateId` and day forecast directions.
- `balance.simTargets.variety = { minMooringStepSets: 3, minMeanWeeklyMooringSets: 1.5, minTemplatesSeen: 4 }` (R8).
- Acceptance:
  - for `careful` on each boat over 100 seeds, variety meets the targets;
  - every band skipped in Tasks 1–6 is re-enabled and passes;
  - if a band fails, tune only 3c data (maneuver error injuries within [0, 0.25], marinero chances, cooldowns). Do not widen bands. If a target is still unmet, report DONE_WITH_CONCERNS with the table.
  - `zeroFireAllow` and the never-fires list are updated honestly for event changes.

- [ ] **Step 1: Write failing tests:** `runBatch` exposes `variety`; for a synthetic log with 3 different `mooring_med` step sets in a week, `meanWeeklyMooringSets === 3`; acceptance variety assertions.
- [ ] **Step 2: Run** `npx vitest run tests/sim`. Expected: FAIL.
- [ ] **Step 3: Implement**, re-enable the skips, tune if needed.
- [ ] **Step 4: Run** `npm test && npm run validate-content && npm run simulate -- --weeks 100`. Paste the per-boat table (score, injury, levelGain, weakness, variety) in the report. Regenerate the determinism fixture if strategy changes moved outcomes.
- [ ] **Step 5: Commit** `feat(sim): variety metrics; balance re-check for 3c`.

---

### Task 8: UI — chart shelter, forecast and berth choice

**Files:**
- Modify:
  - `src/ui/components/chart/ChartMap.tsx` and `symbols.tsx` (shelter badge on bays), `src/ui/screens/planning/PlanningScreen.tsx`, `planDraft.ts` (`Draft.berth`, `toDayPlan`), `PreviewPanel.tsx` (berth selector when the destination has more than one berth: label, fee, short risk note), `ForecastPanel.tsx` (template name);
  - `strings.ts` files; `src/engine/index.ts` exports (`pointShelter`, `BerthType`).
- Test: `tests/ui/components/ChartMap.test.tsx` (extend), `tests/ui/screens/PlanningScreen.test.tsx` (extend)

**Interfaces:**
- Each bay point shows a small badge: «укрыта» / "sheltered" or «открыта» / "exposed", from `pointShelter(point, forecastDir, b)`, where forecastDir is the front direction when the signals are visible. It has an accessible label, e.g. «Бухта открыта ветру NW».
- Berth selector labels:
  - stern_to: «Кормой (муринг)» / "Stern-to";
  - side_to: «Лагом» / "Alongside", fee shown ×1.5;
  - anchor: «На якоре» / "At anchor";
  - anchor_ashore: «Якорь и кормовой на берег» / "Anchor + stern line ashore", note «дольше, но держит лучше» / "takes longer, holds better".
  - The selection goes into `DayPlan.berth`.
- The forecast panel shows the week's template name.

- [ ] **Step 1: Write failing tests:**
  - `ChartMap` with forecast NW marks vela_bay exposed and cala_azzurra sheltered;
  - planning to nisi_quay shows both berth options, and choosing alongside puts `berth: 'side_to'` into the draft plan (assert the dispatched action);
  - a single-berth destination shows no selector.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build`.
- [ ] **Step 5: Commit** `feat(ui): sheltered bays on the chart and a berth choice in the planner`.

---

### Task 9: UI — situation card, conditional steps, hint, "as last time"; e2e

**Files:**
- Modify:
  - `src/ui/screens/maneuvers/ManeuversScreen.tsx`, `kinds.ts` (use the engine's `maneuverFor` and `stepsFor` with the forecast situation context; no hand-mirrored selection), `OrderPicker.tsx` (pool from `stepsFor`; partial "as last time"), `ManeuverSketch.tsx` (drawings for `side_to` and `anchor_ashore`), `strings.ts`;
  - a new `SituationCard.tsx` (+ css);
  - `src/ui/view/logbook.ts` (`roll:marinero` line; `order` lines unchanged);
  - `src/engine/index.ts` exports (`forecastSituation`, `stepsFor`, `situationHint`, `situationContext`);
  - `tests-e2e/smoke.spec.ts`.
- Test: `tests/ui/screens/ManeuversScreen.test.tsx` (extend), `tests/ui/screens/situation-card.test.tsx`

**Interfaces:**
- `SituationCard({ situation, lang })` shows:
  - berth type, wind side («ветер в борт слева» / "wind on the port side", and so on for each side; «штиль» / "calm" for none) with kn and direction, marinero (forecast: «маринеро: 30%» with a `ChanceBadge`; fact: «маринеро есть» / «маринеро нет»), seabed name and tightness;
  - a clear label «Прогноз — на месте может отличаться» / "Forecast — may differ on arrival" when `source === 'forecast'`.
- The steps pool equals `stepsFor(maneuver, context of the forecast situation)`. At Order ≥ 3 a hint line shows «Порядок подсказывает: <шаг>» / "Order suggests: <step>" from `situationHint`.
- "Как в прошлый раз" is shown whenever `lastOrder` has any step in the current pool and the order is empty. It fills the matching steps in last order. If the sets differ, it shows «Подставил N из M шагов — обстановка другая» / "Filled N of M steps — the situation changed".
- `complete` requires every step of the current pool to be placed.

- [ ] **Step 1: Write failing tests:**
  - with a forecast situation (crosswind, no marinero), the mooring pool contains `windward_stern_first` and `pick_lazy_line_boathook`;
  - the card shows the forecast label and the marinero chance;
  - at Order 3 the hint names a conditional step;
  - "as last time" with a last order lacking the new steps fills the overlap and shows the N-of-M note;
  - the side-to sketch renders for berth side_to;
  - e2e: a full week on phone and desktop still reaches the debrief, with the situation card visible on the maneuvers screen and no horizontal scroll.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run validate-content && npm run build && npm run e2e`. All green.
- [ ] **Step 5: Commit** `feat(ui): situation card, situation-aware steps, hint and partial repeat`.

---

## Spec coverage

| Spec §6 item | Task |
|---|---|
| 6.1 four templates, seeded, jitter ±1 step / ±2 kn; wind drives courses, bay shelter, mooring wind side | 1, 2, 8 |
| 6.2 Situation, berths + marineroChance on points, forecast vs fact card | 2, 3, 9 |
| 6.3 conditional steps/errors, order depends on situation, thruster mods, Order 3+ hint, partial "as last time" | 3, 4, 9 |
| 6.4 mooring_side_to, anchor_stern_ashore, berth choice in planner | 3, 4, 8 |
| 6.5 once/cooldownDays/maxPerWeek, per-leg passage events with leg.feature, text variants, seeded crew + placeholders, validator bans literal names | 5, 6 |
| 6.6 criteria incl. ≥ 3 mooring step sets in the sim (R8) | 7 |
| 7.1 version bump | 2 (R9) |
| 7.3 determinism (no new RNG for template/crew/text) | 1, 5, 6 |
