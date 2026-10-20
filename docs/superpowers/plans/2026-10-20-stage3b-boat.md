# Stage 3b: The Boat You Can Feel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boats become profiles of systems that wear, fail and get repaired. Each boat has a seeded set of week defects and one real weakness. Check-in becomes "fix or sail on". Money enters the grade. The XP curve rewards careful play too.

**Architecture:** A new content file `content/core/systems.json` describes systems: failure modes as chance specs, wear sources, a generic `brokenEffect` and repair options. `GameState.systems` holds `{ state, wear, broken }` per system on the chosen boat. Failure modes are rolled at the existing event phases. A failure applies its effect and can queue an existing event, so texts, checks and debrief rules stay. Engine primitives (`noMotor`, `noSail`, `noCharge`, `noCook`, `dailyEffect`, `anchorEffect`) are generic. All per-system detail is data.

**Tech Stack:** TypeScript 5, React 19, Vite 5.4, Vitest 2, zod 3, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-stage3-mechanics-design.md` (§5; §3.2–3.5 for conditions, chances, effects and XP; §7 for saves and tests). This builds on Stage 3a (branch `stage3a`, PR #3).

## Global Constraints

- The UI imports the engine only via `src/engine/index.ts` (`tests/ui/boundaries.test.ts`).
- The engine stays pure, immutable and deterministic.
  - All randomness goes through `rollChance`/`rng.ts`. `tests/engine/no-raw-chance.test.ts` stays green.
  - Every new roll logs `{ kind: 'roll', cause, odds }`, like the 3a rolls.
- Every user-facing string exists in RU and EN. Content texts are `{ ru, en }`. `tests/ui/i18n.test.ts` stays green.
- Hex colours only in `src/ui/styles/tokens.css`. CSS Modules for components.
- Chance mods use the existing 3a form `{ if?, per?, add?, mul?, label? }`.
  - The spec's `{ voice, perLevel }` is written `{ per: 'voice.<v>', add }`.
  - The spec's `{ perWear }` is written `{ per: 'system.<id>.wear', add }`.
  - Adds apply before muls (Ruling R5 from 3a).
- Numbers copied from the spec:
  - the system ids `engine_cooling, heads, windlass, electrical, rig, gas, bow_thruster`;
  - `defectsPerWeek: [2, 3]`;
  - the check-in budget is ~60% of the sum of checkpoint costs;
  - weakness hits in ≥ 60% of weeks under `ignore-weakness`;
  - Meltemi rig failures from 18 kn;
  - Calypso water runs out in about 3 days without a marina (normal shower), fuel in about 4 days of motoring.
- The save key stays `skipper.save.v2`. The `GameState.version` literal goes from `2` to `3`.
  - A version-2 save shows the existing legacy message and is cleared (spec §7.1).
  - No `z.unknown()` or `.passthrough()` for `systems`.
- npm script names are `simulate` and `validate-content`; the spec's `sim`/`validate` mean these.
- Commits use the conventional format with the session attribution trailer.

## Review Focus

1. **Stuck with a broken engine.** The engine is broken, the boat is at anchor, the wind is below `minSailWindKn`, and there is no money or the self-repair fails. The day must still be playable: the tow rule applies (Task 7). Task 3 tests a motor leg with `noMotor` and wind 3 kn.
2. **Odds shown vs odds rolled for repairs.** `repairOptions` shows a self-repair percentage. `repairSystem` must roll the same spec in the same state. Task 4 asserts equality.
3. **A system the boat does not have.** Conditions such as `system.bow_thruster.broken` in content are evaluated on Calypso, which has no bow thruster. They must evaluate (to `'none'`/false/0), not throw. Failures of absent systems never roll. Task 1 tests the context and Task 2 tests the roll.
4. **Money runs out mid-week.** The marina fee or a taverna dinner is chosen with too little money. The marina must refuse with reason `no_money` and the boat anchors outside. The taverna is unavailable with a reason, not a crash. Task 7 tests both.
5. **Old save.** A player with a 3a (version 2) save opens 3b. They see the legacy message and a working menu. Task 1 tests it.

## Rulings Made While Planning

- **R1: Failure modes queue existing events.** A failure may name `event: <eventId>`. The six migrated breakdown events stay in `events.json` with their texts, checks and ids, so the `debrief.json` rules on `event:<id>` keep matching. Events named by any failure are excluded from the generic event roll (`eligibleEvents`). Cost if wrong: two files to read for one failure; content authors must know the link.
- **R2: A failure that queues an event takes that phase's single event slot.** It is rolled before generic events. A failure without `event` only applies its effect and does not take the slot. Cost: fewer random events on failure days.
- **R3: There is no `live_with` repair option.** Not repairing is the default, and `brokenEffect.dailyEffect` already carries its cost. Spare parts (`needs`) are replaced by a generic `requires?: string` condition. No spare-parts inventory. Cost: no spare-part planning gameplay.
- **R4: `boat.bow_thruster`, `boat.generator` and `boat.solar` leave `BOAT_KEYS`.**
  - The `generator` field is deleted (spec §5.5).
  - `bowThruster` is replaced by `systems.bow_thruster` on the boat.
  - `solarW` stays a number used by consumption, but no longer exists as a condition key.
  - The dead-content allowlist ends empty (`[]`).
  - Cost: content can't condition on solar.
- **R5: Strategies.** `newbie` and `expert` stay, because the fixtures and tests depend on them. New strategies are `careful` and `ignore-weakness`, both parameterised by boat. The spec's `reckless` is `newbie`. `random` is not built (YAGNI). Cost: the sim CLI differs from the spec wording.
- **R6: Newbie injury band.** `newbie` reverses every maneuver order (worst case), so its ~0.99 weekly injury rate is a regression guard, not a design target. The band stays `[0.5, 1.0]`. Real-play safety is pinned by the `careful` band `[0, 0.25]`. Cost: if the user wants novice-friendly injury rates, maneuver injury chances need their own pass. This is surfaced to the user at the end.
- **R7: XP curve.** Check success XP becomes the check difficulty, and failure XP becomes difficulty + 2, so mistakes still weigh more (spec Q5). Self-repairs are checks. A failure gives mechanic XP from data. Thresholds start at `[4, 8, 12, 18]`. Task 9 tunes them until the `expert` and `careful` level-gain mean is ≥ 1 per week. This replaces the spec §3.5 numbers, as the user decided on 2026-10-20 to tune the curve in 3b. Cost: faster growth than 3a; the voices may hit level 4 by day 5.
- **R8: Week defects are picked in `chooseBoat`** (one RNG draw for the count, one per pick). They are stored in `GameState.defects: string[]`. Cost: the determinism fixture is regenerated in Task 5.
- **R9: Check-in gets a second step, phase `defects`.** It is entered only when at least one found defect has a system. Fix time comes out of what is left of the check-in budget. Cost: one more screen.
- **R10: Determinism fixture.** Tasks 2, 5, 6 and 9 intentionally change seeded outcomes. Each may regenerate `tests/fixtures/determinism.json` with `UPDATE_SNAPSHOT=1` after showing in its report that the rng draw order changed only where the task intends. Cost: the fixture pins post-change behaviour.

---

## File Structure

| File | Responsibility |
|---|---|
| `content/core/systems.json` | 7 systems: name, checkpoint, wearPer, failures, brokenEffect, repairs |
| `content/core/boats.json` | `systems` profile, `defectPool`, `defectsPerWeek`, `weakness` text; `generator`, `bowThruster`, `hiddenDefects` removed |
| `src/engine/systems.ts` | initial system states, wear, failure rolls, `brokenFlags(state, content)` |
| `src/engine/repair.ts` | `repairOptions`, `repairSystem` |
| `src/engine/defects.ts` | seeded defect pick, check-in findings, fix-or-sail-on |
| `src/engine/budget.ts` | budget grade axis, affordability helpers |
| `src/sim/strategies.ts` | adds `careful(boat)`, `ignoreWeakness(boat)` |
| `src/sim/weakness.ts` | per-boat weakness hit detection from the log |
| `src/ui/screens/checkin/DefectsScreen.tsx` | fix-or-sail-on screen |
| `src/ui/components/SystemsPanel.tsx` | system states on planning and evening |
| `src/ui/screens/evening/RepairBlock.tsx` | repair actions in the evening |

---

### Task 1: Systems model, boat profiles, state and save v3

**Files:**
- Create: `content/core/systems.json`, `src/engine/systems.ts`
- Modify:
  - `src/engine/types.ts`: `SystemDef`, `SystemState`, `BrokenEffect`, `RepairOption`, `SystemFailure`, `Content.systems`, `GameState.systems`, `Boat.systems`, `Effect.break`/`repair`/`wear`, `version: 3`, `CHANCE_LABELS` + `'thruster'`, `'broken'`, `'wear'`.
  - `src/content/schema.ts`, `src/content/files.ts`, `src/content/parse.ts`, `src/content/load-node.ts`, `src/ui/content.ts`, `src/content/conditions.ts`, `src/content/dead.ts`.
  - `src/engine/expr.ts`, `src/engine/resources.ts` (`applyOutcome`), `src/engine/setup.ts` (`chooseBoat` inits systems).
  - `src/ui/session/save.ts`.
  - `content/core/boats.json`, `content/core/dead-content-allow.json`.
  - `tests/fixtures/{raw,content,state,balance}.*`.
- Test: `tests/engine/systems.test.ts`, `tests/content/systems-content.test.ts`, `tests/ui/session/save.test.ts` (extend).

**Interfaces:**
- Produces in `types.ts`:
```ts
export type SystemId = string;
export type SystemCondition = 'new' | 'ok' | 'worn';
export interface SystemState { state: SystemCondition; wear: number; broken: boolean }
export interface BrokenEffect {
  noMotor?: boolean; noSail?: boolean; noCharge?: boolean; noCook?: boolean;
  /** Applied each night while broken. */
  dailyEffect?: Effect;
  /** Applied on each anchoring / anchor_up maneuver while broken. */
  anchorEffect?: Effect;
}
export interface SystemFailure {
  id: string; phase: EventPhase; when?: string; chance: ChanceInput;
  /** Applied on failure, before any queued event. Usually { break: <system> }. */
  effect?: Effect;
  /** Existing event queued for the player's choice. */
  event?: string;
  xp?: Partial<Record<VoiceId, number>>;
}
export interface RepairOption {
  id: string; label: LocalizedText;
  check?: VoiceCheck; costEur?: number; timeHours?: number;
  /** Condition, e.g. 'at_marina || moored_berth'. */
  requires?: string;
  /** Service repairs restore state 'ok'; self repairs only clear `broken`. */
  restores?: 'ok';
}
export interface SystemDef {
  id: SystemId; name: LocalizedText; checkpoint?: Checkpoint;
  wearPer?: Partial<Record<'motor_hour' | 'sail_hour' | 'night' | 'anchoring', number>>;
  failures: SystemFailure[]; brokenEffect: BrokenEffect; repairs: RepairOption[];
}
```
- `Boat.systems: Record<SystemId, SystemCondition>`; `Content.systems: SystemDef[]`; `GameState.systems: Record<SystemId, SystemState>` (only the systems on the boat; `{}` before `chooseBoat`).
- `Effect` gains `break?: SystemId; repair?: SystemId; wear?: Record<SystemId, number>`.
  - `repair` now clears `broken`. It no longer touches `damages`; a deposit damage stays charged.
  - Any of these three naming a system not on the boat is a no-op.
- In `systems.ts`: `initialSystems(boat: Boat): Record<SystemId, SystemState>` (wear 0, broken false); `systemContext(state: GameState, content: Content): Record<string, string | number | boolean>`.
  - For every `content.systems` id it yields `system.<id>.state` (`'none'` when absent), `system.<id>.broken`, `system.<id>.wear`.
- Condition context and `knownIdentifiers` include those keys.

- [ ] **Step 1: Write the failing tests.**
  - `systems.test.ts`:
    - `initialSystems(aurora)` has `bow_thruster` with state `'worn'` (from the profile below);
    - `systemContext` on Calypso gives `system.bow_thruster.state === 'none'` and `system.bow_thruster.broken === false`;
    - `evaluate("system.bow_thruster.broken", ctx)` on Calypso returns false and does not throw;
    - `applyOutcome` with `{ break: 'rig' }` sets `systems.rig.broken`, `{ repair: 'rig' }` clears it, `{ wear: { rig: 3 } }` adds 3, and `{ break: 'bow_thruster' }` on Calypso is a no-op;
    - `applyOutcome` with `repair` leaves `damages` unchanged.
  - `systems-content.test.ts`:
    - exactly the 7 ids;
    - every system has ≥ 1 repair;
    - every boat lists only known systems;
    - each boat's `systems` includes `engine_cooling, heads, windlass, electrical, rig, gas`, and only Aurora has `bow_thruster`.
  - Save test:
    - a stored slot with `game.version === 2` gives the legacy notice and clears the slot;
    - a slot whose `systems.rig` lacks `wear` is rejected.
- [ ] **Step 2: Run** `npx vitest run tests/engine/systems.test.ts tests/content/systems-content.test.ts tests/ui/session/save.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `systems.json` holds the 7 systems with RU/EN names, checkpoints and `brokenEffect` from this table. `failures: []` for now (Task 6 fills them).

    | id | name ru / en | checkpoint | wearPer | brokenEffect | repairs |
    |---|---|---|---|---|---|
    | engine_cooling | Охлаждение двигателя / Engine cooling | impeller | motor_hour 1 | noMotor | self (mechanic d2, 40 €, 1 h), service (requires marina/berth, 220 €, 3 h, restores ok) |
    | heads | Гальюны / Heads | toilets | night 1 | dailyEffect mood −8 | self (mechanic d2, 0 €, 1.5 h), service (90 €, 2 h, ok) |
    | windlass | Якорное устройство / Anchor gear | anchor | anchoring 1 | anchorEffect time_hours 0.5, fatigue 10 | self (order d2, 0 €, 1 h), service (150 €, 2 h, ok) |
    | electrical | Электрика / Electrics | electrics | night 1 | noCharge | self (mechanic d3, 20 €, 1 h), service (180 €, 2 h, ok) |
    | rig | Паруса и такелаж / Sails and rig | sails | sail_hour 1 | noSail | self (order d2, 30 €, 1.5 h), service (350 €, 4 h, ok) |
    | gas | Газ / Gas | gas | — | noCook | self (caution d2, 0 €, 0.5 h), service (60 €, 1 h, ok) |
    | bow_thruster | Подруливающее устройство / Bow thruster | — | — | (none; its bonus disappears) | service (300 €, 3 h, ok) |

    Every `service` repair has `requires: "at_marina || moored_berth"`.
  - `boats.json`:
    - aurora `systems` all `ok`, except `bow_thruster: 'worn'`; meltemi all `ok`, except `rig: 'worn'`; calypso all `ok`;
    - delete `generator` and `bowThruster` from boats, `Boat`, the schema, fixtures and `BOAT_KEYS`; also delete `boat.solar` from `BOAT_KEYS`;
    - drop the allowlist entries for `boat-field:boat.bow_thruster`, `boat-field:boat.generator` and `boat-field:boat.solar`.
  - `chooseBoat` sets `systems: initialSystems(boat)`. `newGame` sets `systems: {}`.
  - Save:
    - `GameStateSchema` gets a strict `systems` record `{ state: enum, wear: number ≥ 0, broken: boolean }`;
    - a version other than 3 goes through the existing legacy path.
- [ ] **Step 4: Run** `npm test && npm run validate-content && npm run typecheck`. Expected: green. The determinism fixture must not change (no new draws yet).
- [ ] **Step 5: Commit** `feat(engine): boat systems model, system conditions, save v3`.

---

### Task 2: Wear and failure rolls

**Files:**
- Modify:
  - `src/engine/systems.ts`, `src/engine/events.ts` (`queueEvent`, `eligibleEvents`);
  - `src/engine/day/legs.ts` (`runLeg` records the max wind), `src/engine/day/passage.ts` (`settleDay` wear), `src/engine/day/arrival.ts` (anchoring wear), `src/engine/evening.ts` (night wear);
  - `src/engine/expr.ts`: day keys;
  - `src/engine/types.ts`: `DayFacts.maxWindKn`.
- Test: `tests/engine/system-failures.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `rollChance`, `grantXp(state, xp, cause, b)`, `applyOutcome(state, boat, o, b)`.
- Produces:
  - `addWear(state: GameState, content: Content, source: 'motor_hour' | 'sail_hour' | 'night' | 'anchoring', amount: number): GameState`;
  - `rollFailures(state: GameState, content: Content, phase: EventPhase): { state: GameState; queuedEvent?: string }`;
  - `failureEventIds(content: Content): Set<string>`.
- Context keys `day.motor_hours`, `day.sail_hours`, `day.max_wind`, read from `dayFacts`; 0 when `dayFacts` is null. Add them to `CONTEXT_KEYS` and `knownIdentifiers`.
- Log causes:
  - `roll:failure:<system>:<failureId>` (kind `roll`, `odds`, `data{hit}`) for every roll;
  - `break:<system>:<failureId>` with pillar `boat` on a hit.
  - XP cause `break:<system>:<failureId>`.

- [ ] **Step 1: Write the failing tests** with `makeContent` plus a test system.
  - A system `test_sys` with a failure `{ id: 'f', phase: 'passage', chance: 1, effect: { break: 'test_sys' }, xp: { mechanic: 3 } }` on the boat: `rollFailures(s, c, 'passage')` sets broken, logs `break:test_sys:f`, and grants mechanic XP 3.
  - A failure with `when: "day.motor_hours > 0"` and `dayFacts.motorHours === 0` does not roll and consumes no draw.
  - A system absent from the boat: its failures never roll and consume no draw.
  - An already broken system does not roll its failures.
  - Wear:
    - `addWear(s, c, 'motor_hour', 2.5)` adds `2.5 × wearPer.motor_hour` only to systems with that key;
    - a failure chance `{ base: 0, mods: [{ per: 'system.test_sys.wear', add: 0.01 }] }` at wear 30 shows odds 0.3.
  - A failure with `event: 'ev'` returns `queuedEvent: 'ev'`, and `queueEvent` then skips the generic roll for that phase.
  - An event listed in `failureEventIds` never appears in `eligibleEvents`.
  - `runLeg` stores `dayFacts.maxWindKn` as the max over its legs.
- [ ] **Step 2: Run** `npx vitest run tests/engine/system-failures.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Wear calls: `settleDay` after the legs (`motorHours`, `sailHours`), each anchoring maneuver (1), `night()` (1).
  - `queueEvent(state, content, phase)` calls `rollFailures` first; if it queued an event, it returns without the generic roll.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: green. The determinism fixture should be unchanged, because no real system has failures yet. If it changed, explain why in the report before regenerating (R10).
- [ ] **Step 5: Commit** `feat(engine): system wear and failure rolls at event phases`.

---

### Task 3: Broken-system effects and maneuver chance mods

**Files:**
- Modify:
  - `src/engine/systems.ts`;
  - `src/engine/day/legs.ts`: `noMotor`/`noSail`;
  - `src/engine/resources.ts`: `dailyConsumption` honours `noCharge`;
  - `src/engine/evening.ts`: `noCook`, `dailyEffect`;
  - `src/engine/day/arrival.ts`: `anchorEffect`;
  - `src/engine/odds.ts`: `injurySpec` takes extra mods;
  - `src/engine/types.ts`: `Maneuver.injuryMods?: ChanceMod[]`;
  - `src/content/schema.ts`, `src/engine/preview.ts`.
- Test: `tests/engine/broken-effects.test.ts`

**Interfaces:**
- Produces:
  - `brokenFlags(state: GameState, content: Content): Required<Pick<BrokenEffect, 'noMotor' | 'noSail' | 'noCharge' | 'noCook'>>`, an OR over the broken systems;
  - `injurySpec(baseChance, mitigatedBy, b, extra: ChanceMod[] = [])`.
- Leg rules:
  - a motor leg with `noMotor` becomes a sail leg and logs `system:no_motor:<routeId>`;
  - a sail leg with `noSail` becomes a motor leg and logs `system:no_sail:<routeId>`;
  - with both, or with `noMotor` and wind < `minSailWindKn`, the leg runs under sail at the drifter speed, and Task 7's tow rule applies;
  - `startEngine` is skipped when `noMotor`.
- `noCook`: `endDay` with `dinner: 'cook'` gives the existing `zero:gas` outcome (`noHotFoodMoodPenalty`) and logs `system:no_cook`. The UI marks cooking as unavailable (Task 11).
- Every maneuver's injury roll appends `maneuver.injuryMods`.

- [ ] **Step 1: Write the failing tests.**
  - With `engine_cooling` broken, a motor leg at wind 12 runs as sail, consumes no fuel and logs `system:no_motor:<route>`.
  - With `rig` broken, a sail leg runs as motor.
  - With `electrical` broken, a night with 3 motor hours adds no engine charge.
  - With `heads` broken, `night()` applies mood −8 once per night.
  - With `windlass` broken, the anchoring maneuver adds 0.5 h and fatigue 10.
  - With `gas` broken, `endDay({ dinner: 'cook' })` applies the no-hot-food penalty and logs `system:no_cook`.
  - `injurySpec(0.2, undefined, b, [{ add: 0.1, label: 'broken' }])` evaluates to the 3a value + 0.1 before the muls (compare with `evaluateChance`).
  - Review Focus 1: with `engine_cooling` broken and wind 3 kn, a motor leg still completes (time advances; no throw).
- [ ] **Step 2: Run** `npx vitest run tests/engine/broken-effects.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add `injuryMods` to the content:
  - `mooring_med` gets `{ if: "system.bow_thruster.state != 'none' && !system.bow_thruster.broken && wind >= 12", mul: -0.3, label: 'thruster' }`;
  - all 4 maneuvers get `{ if: "system.engine_cooling.broken", add: 0.1, label: 'broken' }`.
  - The preview shows the same injury mods.
- [ ] **Step 4: Run** `npm test && npm run validate-content && npm run typecheck`. Expected: green. The `boat-field` allowlist is already gone (Task 1); the thruster mod reads systems, not `BOAT_KEYS`.
- [ ] **Step 5: Commit** `feat(engine): generic broken-system effects and maneuver injury mods`.

---

### Task 4: Repairs

**Files:**
- Create: `src/engine/repair.ts`
- Modify: `src/engine/index.ts`, `src/engine/errors.ts` (codes `NOT_BROKEN`, `REPAIR_UNAVAILABLE`, `NO_MONEY`)
- Test: `tests/engine/repair.test.ts`

**Interfaces:**
- Consumes: `checkSpec(check, b)`, `rollChance`, `grantXp`, `applyOutcome`, `priceFor` (repairs are NOT discounted by economist; spec §4.2 lists marina, fuel and taverna only).
- Produces:
```ts
export interface RepairChoice {
  systemId: SystemId; option: RepairOption;
  available: boolean; reason?: 'requires' | 'no_money';
  odds?: ChanceValue; // present when option.check
}
export function repairOptions(state: GameState, content: Content): RepairChoice[];
export function repairSystem(state: GameState, content: Content, systemId: SystemId, repairId: string): GameState;
```
- `repairOptions` lists the options for broken systems only, in `systems.json` order.
- `repairSystem`:
  - allowed in phases `evening` and `planning`;
  - throws `NOT_BROKEN`, `REPAIR_UNAVAILABLE` (requires false) or `NO_MONEY` (`moneyEur < costEur`);
  - pays the cost and advances the clock by `timeHours`;
  - check: rolls `checkSpec`, logs `roll:check:repair:<system>:<repairId>`, grants check XP (Task 9 values; until then the 3a `checkXp`), and on success clears `broken`;
  - no check: always succeeds;
  - `restores: 'ok'` also sets state `'ok'` and wear 0;
  - logs `repair:<system>:<repairId>:success|fail` with pillar `boat`.

- [ ] **Step 1: Write the failing tests.**
  - `repairOptions` with a broken `engine_cooling`, at anchor, gives `self` available and `service` unavailable with `requires`.
  - Money 10 € makes `self` (40 €) unavailable with `no_money`.
  - Review Focus 2: seed-pinned, `repairOptions(...).odds.value` equals the odds logged by `repairSystem` for the same state.
  - A failed self repair keeps `broken`, still charges, and grants check-fail XP.
  - A service repair at a berth sets `state: 'ok', wear: 0, broken: false` and charges 220 €.
  - Repairing a non-broken system throws `NOT_BROKEN`.
  - A repair in phase `morning` throws `PHASE`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/repair.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as specified. Export from `index.ts`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: green.
- [ ] **Step 5: Commit** `feat(engine): system repairs with visible odds`.

---

### Task 5: Seeded week defects and fix-or-sail-on check-in

**Files:**
- Create: `src/engine/defects.ts`
- Modify:
  - `src/engine/types.ts`:
    - `Boat.defectPool`, `Boat.defectsPerWeek`;
    - remove `Boat.hiddenDefects`;
    - `GameState.defects`, `GameState.checkin`;
    - phase `defects` in `PHASES`.
  - `src/engine/setup.ts`: `chooseBoat`, `performCheckin`.
  - `src/engine/week.ts` or wherever `finishWeek` lives: `chargedOnReturn` from the pool.
  - `src/content/schema.ts`, `src/content/dead.ts` (defect rule), `src/content/conditions.ts`.
  - `content/core/boats.json`, `content/core/balance.json` (`checkin.budgetMin`), `tests/fixtures/*`.
  - `src/ui/session/save.ts` (schema for `defects`/`checkin`).
- Test: `tests/engine/defects.test.ts`

**Interfaces:**
- Produces in types:
```ts
export interface BoatDefect {
  id: string; checkpoint: Checkpoint; description: LocalizedText;
  system?: SystemId;             // sets the system to 'worn' while unfixed
  chargedOnReturn?: string;      // deposit damage id if never found
  fixEur?: number; fixMin?: number; // fix at base; both required when system is set
}
// Boat: defectPool: BoatDefect[]; defectsPerWeek: [number, number];
// GameState: defects: string[]; checkin: { found: string[]; fixed: string[]; minutesLeft: number } | null;
```
- In `defects.ts`:
  - `pickDefects(rng: number, boat: Boat): RngResult<string[]>`: one draw picks the count, uniform in `[min, max]` inclusive, then one draw per pick, without replacement, in pool order;
  - `applyDefects(systems, boat, ids): Record<SystemId, SystemState>` sets the defect systems to `'worn'`;
  - `resolveDefects(state: GameState, content: Content, fixIds: string[]): GameState`.
- `chooseBoat` picks the defects and applies them to the systems.
- `performCheckin(state, content, checkpoints)`:
  - checks the budget;
  - sets `checkin.found` to the week's defects whose checkpoint was checked, and sets the flags `defect.<id>.found` / `defect.<id>` as today;
  - goes to phase `defects` if any found defect has a `system`, otherwise to `briefing`.
- `resolveDefects`:
  - throws `BUDGET` if the sum of `fixMin` exceeds `checkin.minutesLeft`, and `NO_MONEY` if the money is short;
  - a fixed defect pays `fixEur`, sets its system to `'ok'`, logs `checkin:fix:<id>` and is removed from `state.defects`;
  - an unfixed defect logs `checkin:sail_on:<id>`;
  - the phase becomes `briefing`.
- `finishWeek` charges `chargedOnReturn` for week defects never found (replaces the `hiddenDefects` loop).
- Dead-content rule: a defect is dead if it has neither a `system` nor a `chargedOnReturn`. Drop the allowlist entry `defect:toilet_valve`.

- [ ] **Step 1: Write the failing tests.**
  - `pickDefects` is deterministic per rng and returns 2 or 3 distinct ids. Over seeds 1..200, both counts occur.
  - The schema rejects a boat with fewer pool entries than `defectsPerWeek[1]` (refine).
  - `chooseBoat` on Meltemi with `worn_furler` picked sets `rig` worn. It is already worn by profile, so the test asserts it stays `'worn'`.
  - Check-in:
    - checking `impeller` with `worn_impeller` in the week defects → phase `defects`, `found: ['worn_impeller']`;
    - checking nothing → phase `briefing`.
  - `resolveDefects(s, c, ['worn_impeller'])` → `engine_cooling` state `'ok'`, money −`fixEur`, `minutesLeft` reduced, phase `briefing`.
  - A fix over the remaining minutes throws `BUDGET`.
  - `finishWeek` charges an unfound `old_scratch` as `deposit:unrecorded:old_scratch`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/defects.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `balance.checkin.budgetMin` → `72` (60% of the cost sum of 120).
  - Starting pools (Task 9 may tune `fixEur`/`fixMin` only). Descriptions in RU/EN: reuse the old `hiddenDefects` texts, and write new ones in the same tone.

    | boat | pool (id → checkpoint, system, fixEur, fixMin) | perWeek |
    |---|---|---|
    | aurora_45 | worn_impeller → impeller, engine_cooling, 60, 20; toilet_valve → toilets, heads, 40, 15; tired_batteries → electrics, electrical, 120, 25; old_scratch → damage_photos, —, chargedOnReturn hull_scratch | [2, 3] |
    | meltemi_40 | torn_genoa_seam → sails, rig, 150, 30; loose_anchor_shackle → anchor, windlass, 10, 10; worn_furler → sails, rig, 90, 20; old_scratch (as above) | [2, 3] |
    | calypso_38 | gas_leak → gas, gas, 30, 15; worn_impeller (as aurora); sticky_pump → toilets, heads, 30, 15; old_scratch (as above) | [2, 3] |

  - Fix cost is the charter base's labour, charged to the player.
- [ ] **Step 4: Run** `npm test && npm run validate-content && npm run typecheck`. Regenerate the determinism fixture per R10. The events still read the `defect.<id>` flags until Task 6, so they keep firing.
- [ ] **Step 5: Commit** `feat(engine): seeded week defects and fix-or-sail-on check-in`.

---

### Task 6: Content migration and boat weaknesses

**Files:**
- Modify:
  - `content/core/systems.json` (failures);
  - `content/regions/archipelago/events.json`: the 6 events lose their `defect.*` conditions and their options gain break/repair; 2 new events;
  - `content/core/boats.json` (tank tuning), `content/core/dead-content-allow.json` (→ `[]`);
  - `tests/content/packs.test.ts` and `tests/content/narrative-content.test.ts` (event counts 34);
  - `src/sim/strategies.ts` if any strategy references a removed defect.
- Test: `tests/content/system-failures-content.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Failure table. Each row is one failure in `systems.json`. The chance base applies when the system is `ok`. The `worn` mod is `{ if: "system.<id>.state == 'worn'", add, label: 'worn' }`. Every failure also has `{ per: 'voice.mechanic', add: -0.02 }` and `{ per: 'system.<id>.wear', add: 0.004, label: 'wear' }`, with `min: 0.01`, `max: 0.8`.

  | system | failure id | phase | when | base | worn add | other mods | event | effect | xp |
  |---|---|---|---|---|---|---|---|---|---|
  | engine_cooling | impeller_overheat | passage | `day.motor_hours > 0` | 0.03 | 0.45 | — | impeller_overheat | — | mechanic 3 |
  | heads | toilet_clog | evening | `day >= 3` | 0.05 | 0.30 | `{ if: 'briefing.toilet', mul: -0.6, label: 'briefing' }` | toilet_clog | — | mechanic 2 |
  | heads | toilet_misuse | evening | `boat.electric_toilet && !briefing.toilet` | 0.40 | 0 | — | toilet_misuse | — | — |
  | gas | gas_smell | evening | — | 0.02 | 0.55 | — | gas_smell | — | caution 2 |
  | rig | genoa_seam_rip | passage | `day.sail_hours > 0 && day.max_wind >= 14` | 0.04 | 0.20 | `{ if: 'day.max_wind >= 18', add: 0.25, label: 'wind' }`, `{ if: 'briefing.sails', mul: -0.3, label: 'briefing' }` | genoa_seam_rip | — | order 2 |
  | windlass | anchor_shackle_loose | arrival | `at_bay` | 0.03 | 0.45 | — | anchor_shackle_loose | — | order 2 |
  | electrical | alternator_fault | passage | `day.motor_hours > 0` | 0.02 | 0.35 | — | alternator_fault (new) | — | mechanic 3 |
  | bow_thruster | thruster_trip | arrival | `at_marina && wind >= 15` | 0.05 | 0.35 | — | thruster_trip (new) | — | — |

- Event option effects. Texts, checks and existing effects stay; add only:
  - `impeller_overheat`: `keep_motoring` `+break engine_cooling`; `change_impeller` success `+repair engine_cooling`, fail `+break engine_cooling`; `sail_on` `+break engine_cooling`;
  - `toilet_clog` and `toilet_misuse`: `fix_self` fail `+break heads`; `call_base` `+repair heads`; `endure`/`close_it` `+break heads`;
  - `gas_smell`: `close_valve` `+break gas`; `cook_anyway` fail `+break gas`;
  - `genoa_seam_rip`: `keep_sailing` `+break rig`;
  - `anchor_shackle_loose`: `drop_anyway` fail `+break windlass`;
  - The old `defect.*` conditions are removed from all six. `toilet_misuse` and `genoa_seam_rip` move their non-defect conditions into the failure `when` above.
- New events, in the same JSON shape and tone as `impeller_overheat`, with pillar `boat`, voice lines for mechanic and caution, and a `debrief` text:
  - `alternator_fault`: scene `engine_bay`; options `keep_going` → `{ break: 'electrical', mood: -3 }`, and `tighten_belt` (check mechanic d2) → success `{ time_hours: 0.5 }`, fail `{ break: 'electrical', time_hours: 1 }`;
  - `thruster_trip`: scene `marina_entrance`; options `wait_and_reset` → `{ time_hours: 0.5, mood: -2 }`, and `moor_without` → `{ break: 'bow_thruster', fatigue: 8 }`.
- Weakness content (starting values; Task 9 tunes):
  - Calypso `waterTankL` 330 → `300` (4 crew × 25 L = 3 days);
  - Calypso `fuelTankL` stays 120 (26 h at 4.5 L/h ≈ 4 days of 6.5 h);
  - Aurora keeps its shared 140 Ah bank (already flat by night 2–3 at anchor) and its worn thruster;
  - Meltemi keeps its worn rig and its slow speed.

- [ ] **Step 1: Write the failing tests** in `system-failures-content.test.ts`:
  - each of the 8 failure `event` ids exists, and its event phase equals the failure phase;
  - none of the six migrated events has a condition starting with `defect.`;
  - every `debrief.json` rule that matched `event:<id>` for these ids still finds its event;
  - `findDeadContent(content, [])` returns `[]`, with an empty allowlist;
  - every boat's `defectPool` system has at least one failure.
- [ ] **Step 2: Run** `npx vitest run tests/content/system-failures-content.test.ts`. Expected: FAIL.
- [ ] **Step 3: Edit the content** as specified. Update the event count pins to 34.
- [ ] **Step 4: Run** `npm test && npm run validate-content && npm run typecheck && npm run simulate -- --weeks 50`. Expected: green; the simulate output is attached to the report. Regenerate the determinism fixture per R10. Sim band failures are expected and fixed in Task 9; record them, do not tune here.
- [ ] **Step 5: Commit** `content: breakdown events become system failures; alternator and thruster failures`.

---

### Task 7: Money that matters

**Files:**
- Create: `src/engine/budget.ts`
- Modify:
  - `src/engine/day/legs.ts` (tow), `src/engine/day/arrival.ts` (no-money marina), `src/engine/evening.ts` (taverna), `src/engine/debrief.ts` (`gradeWeek` budget axis), `src/engine/preview.ts` (marina affordability);
  - `src/engine/types.ts` (Balance keys, `Scales.budget`), `src/content/schema.ts`;
  - `content/core/balance.json`, `tests/fixtures/balance.json`;
  - `src/sim/run.ts` (`weekScore` max 10), the tests pinning max 8.
- Test: `tests/engine/budget.test.ts`

**Interfaces:**
- Balance:
  - `rescue.towEur: 250`, `rescue.towHours: 2`, `rescue.towMoodPenalty: 10`;
  - `budget.weekEur: 1500`, `budget.okFactor: 1.5`.
- Produces:
  - `canAfford(state: GameState, eur: number): boolean`;
  - `weekSpend(state: GameState, content: Content, depositLossEur: number): number` = (money after `chooseBoat`) − (final money) + deposit loss. The money after `chooseBoat` is read from the log entry `boat:chosen` or stored as `GameState.startBalanceEur` (prefer the state field; add it to the save schema);
  - `budgetGrade(spend: number, finalMoney: number, b: Balance): Grade`: bad if `finalMoney < 0`; good if `spend ≤ weekEur`; ok if `≤ weekEur × okFactor`; else bad.
- Tow: a leg that must motor (fuel 0 or `noMotor`) with wind < `minSailWindKn` applies `{ money: -towEur, time_hours: towHours, mood: -towMoodPenalty }`, cause `rescue:tow:<routeId>`. The leg completes. With wind ≥ `minSailWindKn`, today's sail-only behaviour stays.
- No money:
  - in `arrive`, a marina whose fee > money → cause `marina:no_money`, then the same path as `marina:refused` (anchor outside), with no refusal roll;
  - `endDay({ dinner: 'taverna' })` with money < taverna cost throws `NO_MONEY`;
  - `preview` exposes `marinaAffordable: boolean`.
- `gradeWeek().scales.budget`. `buildDebrief` includes it. Sim `weekScore` sums 5 axes (max 10).

- [ ] **Step 1: Write the failing tests.**
  - Fuel 0 and wind 3: the leg logs `rescue:tow:<route>`, money −250, the clock +2 h.
  - Fuel 0 and wind 12: sail-only, no tow.
  - `noMotor` and wind 3 → tow (Review Focus 1 end-to-end).
  - Review Focus 4: money 20 € at a marina with fee 80 € → `marina:no_money`, the boat anchors, the day completes.
  - Taverna with money 10 € throws `NO_MONEY`.
  - `budgetGrade`: 1400 → good; 2000 → ok; 2400 → bad; any spend with final money −1 → bad.
  - `weekScore` max is 10.
- [ ] **Step 2: Run** `npx vitest run tests/engine/budget.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add `budget` debrief text keys to `content/core/debrief.json` if the debrief lists the scales from content; otherwise add the UI strings in Task 11.
- [ ] **Step 4: Run** `npm test && npm run validate-content && npm run typecheck`. Expected: green (the sim acceptance "expert beats newbie by ≥ 2" still holds on a 10-point scale; if not, record it for Task 9).
- [ ] **Step 5: Commit** `feat(engine): tow, no-money limits and a budget grade`.

---

### Task 8: Simulator strategies and weakness metrics

**Files:**
- Create: `src/sim/weakness.ts`
- Modify:
  - `src/sim/strategies.ts`, `src/sim/run.ts` (strategy hooks: defects, repairs), `src/sim/batch.ts`, `scripts/simulate.ts`;
  - `src/engine/types.ts` and `src/content/schema.ts` (`simTargets` shape), `content/core/balance.json`, `tests/fixtures/balance.json`.
- Test: `tests/sim/weakness.test.ts`, `tests/sim/strategies.test.ts` (extend)

**Interfaces:**
- `Strategy.name: 'newbie' | 'expert' | 'careful' | 'ignore-weakness'`; `makeStrategy(name, boatId?: string): Strategy`. `newbie` and `expert` keep their boats.
- Strategies gain two hooks:
  - `fixDefects(found: string[], state): string[]`;
  - `repair(choices: RepairChoice[], state): { systemId; repairId } | null`.
  - The run loop calls `resolveDefects` in phase `defects` and the repair hook in the evening before `endDay`.
- `careful(boat)`:
  - the expert voices and briefing;
  - checkpoints chosen greedily by weakness relevance, within the budget;
  - fixes every found defect that fits;
  - repairs any broken system with the best available option;
  - takes marinas every second night.
- `ignore-weakness(boat)`:
  - like `careful`, except it skips the checkpoints of the boat's weak systems, never fixes or repairs, and always chooses the anchorage destination when the route offers one;
  - "weak systems" come from `balance.simTargets.weakness[boat].systems`.
- `balance.simTargets` gains:
```json
"weakness": {
  "aurora_45":  { "systems": ["electrical", "bow_thruster"], "causes": ["zero:service", "event:dead_starter_morning", "break:bow_thruster", "break:electrical"] },
  "meltemi_40": { "systems": ["rig"], "causes": ["break:rig", "marina:refused"] },
  "calypso_38": { "systems": ["heads", "gas"], "causes": ["zero:water", "zero:fuel", "rescue:tow"] }
},
"weaknessMinRate": 0.6,
"careful": { "minMeanScore": 6, "weekInjuryRate": [0, 0.25] },
"levelGain": { "newbie": [2, 4], "expert": [1, 4], "careful": [1, 4] }
```
- `weaknessHit(state: GameState, boatId: string, targets): boolean`: any log cause starting with one of `causes`.
- `runBatch` gains `weaknessRate` and per-boat aggregation. CLI: `--boat <id>`, `--strategy <name>`.

- [ ] **Step 1: Write the failing tests.**
  - `weaknessHit` is true for a log with `zero:water:3` on Calypso and false on Aurora.
  - `makeStrategy('careful', 'calypso_38')` picks Calypso.
  - `ignore-weakness` on Meltemi never checks `sails`.
  - `runBatch` with `ignore-weakness` reports a `weaknessRate` in [0, 1].
  - The schema rejects `weakness` with an unknown boat or system.
- [ ] **Step 2: Run** `npx vitest run tests/sim`. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep `newbie`/`expert` behaviour identical apart from the new hooks; they have no-op defaults: `expert` fixes nothing and repairs nothing. The determinism fixture must stay unchanged in this task.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run simulate -- --weeks 100 --strategy ignore-weakness`. Expected: tests green; the sim prints the per-boat `weaknessRate` (values are tuned in Task 9).
- [ ] **Step 5: Commit** `feat(sim): careful and ignore-weakness strategies, weakness metrics`.

---

### Task 9: Balance pass and XP curve

**Files:**
- Modify:
  - `content/core/balance.json` (`voices.checkXp`, `xpToLevel`, `checkin.budgetMin` if needed), `content/core/systems.json` (failure numbers), `content/core/boats.json` (tanks, fix costs);
  - `src/engine/events.ts` and `src/engine/repair.ts` (difficulty-based check XP);
  - `src/engine/types.ts` and `src/content/schema.ts` (`checkXp` shape);
  - `tests/sim/acceptance.test.ts`, `tests/fixtures/determinism.json`.
- Test: `tests/engine/xp.test.ts` (extend), `tests/sim/acceptance.test.ts`

**Interfaces:**
- `balance.voices.checkXp` becomes `{ successPerDifficulty: 1, failBonus: 2 }`: success XP = `difficulty × successPerDifficulty`, fail XP = `difficulty × successPerDifficulty + failBonus`. An explicit `option.xp` still overrides it.
- `xpToLevel` starts at `[4, 8, 12, 18]`. `maneuverErrorXp` 3 and `cleanManeuverXp` 1 are unchanged.
- Acceptance (100 seeds, all thresholds read from `balance.simTargets`):
  - for each boat, `ignore-weakness` `weaknessRate ≥ weaknessMinRate`;
  - for each boat, `careful` `meanScore ≥ careful.minMeanScore` and its injury rate is within `careful.weekInjuryRate`;
  - the `levelGain` bands for newbie, expert and careful;
  - the existing `weekInjuryRate` bands (newbie `[0.5, 1]` per R6, expert `[0, 0.2]`);
  - `zeroFireAllow` shrinks: `gas_smell` now fires through Calypso strategies, so remove it. Keep `fuel_dock_queue` only if it still never fires, and record that in the report.

- [ ] **Step 1: Write the failing tests.**
  - XP: a d3 check success grants 3, a fail grants 5, `option.xp: 7` grants 7.
  - Acceptance: the targets above, with the new tests in `acceptance.test.ts`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/xp.test.ts tests/sim/acceptance.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the XP change, then tune data only, within these bounds:
  - failure `base` in [0.01, 0.1] and `worn` add in [0.1, 0.6];
  - `xpToLevel` strictly increasing, first threshold ≥ 3;
  - `budgetMin` in [65, 80];
  - Calypso `waterTankL` in [260, 330];
  - `fixEur` ≤ 200;
  - `budget.weekEur` in [1000, 2500].
  - If a target can't be met inside these bounds, stop and report it as DONE_WITH_CONCERNS with the sim table. Do not widen the bands.
- [ ] **Step 4: Run** `npm test && npm run validate-content && npm run simulate -- --weeks 100 --json /tmp/3b-sim.json`. Expected: green. Paste the per-boat table (weakness rate, careful score, injury, level gain) into the report. Regenerate the determinism fixture per R10.
- [ ] **Step 5: Commit** `balance: XP by difficulty, tuned failures and weaknesses`.

---

### Task 10: UI — boat choice and check-in defects

**Files:**
- Create: `src/ui/screens/checkin/DefectsScreen.tsx` (+ `.module.css`), `src/ui/components/SystemsPanel.tsx` (+ css)
- Modify:
  - `src/ui/session/{types,reducer,screen}.ts`: action `resolve_defects`, phase `defects` → screen;
  - `src/ui/screens/boat/BoatCard.tsx`: weakness line and a systems profile with worn items marked;
  - `src/ui/screens/checkin/CheckinScreen.tsx`: the budget shows the new total;
  - `src/ui/screens/briefing/BriefingScreen.tsx`: found defects now show fixed or sailed-on;
  - `src/ui/i18n/glossary.ts`: `SYSTEM_NAMES` from content, so no duplication;
  - the `strings.ts` files.
  - `content/core/boats.json`: `weakness: { ru, en }` per boat; schema and type.
- Test: `tests/ui/screens/defects.test.tsx`, `tests/ui/components/systems-panel.test.tsx`, update the boat-select test

**Interfaces:**
- `DefectsScreen`:
  - lists the found defects with a system;
  - each has a toggle «Чинить на базе — 60 €, 20 мин» / "Fix at base — €60, 20 min" and the default «Плыть так» / "Sail on";
  - shows the remaining minutes; toggles that don't fit are disabled, with the reason «не хватает времени» / "not enough time";
  - Confirm sends `{ type: 'resolve_defects', fixIds }`.
- `SystemsPanel({ systems, content, lang })`:
  - one row per system on the boat: name and state chip («новое/норма/изношено/сломано», "new/ok/worn/broken");
  - broken rows are first and use the critical token.
- Boat weakness texts (RU/EN, short, honest; for example Aurora: «Один общий аккумулятор: на якоре садится к третьей ночи. Подрулька изношена.»).

- [ ] **Step 1: Write the failing tests.**
  - The defects screen with 2 found defects and 25 minutes left: the 30-minute fix is disabled with its reason; confirming with one fix dispatches `fixIds: ['…']`.
  - `SystemsPanel` puts a broken system first and has an accessible label.
  - The boat card shows the weakness text and marks Meltemi's rig as worn.
- [ ] **Step 2: Run** the three test files. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the existing screen patterns: `ScreenFrame`, the sticky actions bar, CSS tokens.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run build`. Expected: green; no new console warnings in the test output.
- [ ] **Step 5: Commit** `feat(ui): boat weaknesses, systems panel, fix-or-sail-on check-in`.

---

### Task 11: UI — evening repairs, money limits, logbook and debrief; e2e

**Files:**
- Create: `src/ui/screens/evening/RepairBlock.tsx` (+ css)
- Modify:
  - `src/ui/screens/evening/EveningScreen.tsx`: repair block, `SystemsPanel`, cook disabled by `noCook`, taverna disabled by money;
  - `src/ui/screens/planning/*`: `SystemsPanel`; a marina destination shows «нет денег» / "no money" when unaffordable;
  - `src/ui/session/*`: action `repair`;
  - `src/ui/view/logbook.ts`: describers for `break`, `repair`, `system`, `rescue`, `checkin:fix`, `checkin:sail_on`, `marina:no_money`; `NOISE_ROOTS` + `wear`; `roll:failure` shown with odds on past days only, like other rolls;
  - `xpCauseText` and debrief `XP_ROOTS`: `break`, `roll:check:repair`;
  - `src/ui/screens/debrief/*`: budget scale;
  - `src/engine/index.ts` exports used by the UI;
  - `tests-e2e/smoke.spec.ts`.
- Test: `tests/ui/screens/repair.test.tsx`, `tests/ui/view/logbook.test.ts` (extend), `tests/ui/week.test.tsx` (extend)

**Interfaces:**
- `RepairBlock`:
  - for each `RepairChoice`, a row: system, option label, cost, time and a `ChanceBadge` when `odds` is set;
  - a disabled row shows the reason («только в марине» / "marina only", «нет денег» / "no money");
  - the button dispatches `{ type: 'repair', systemId, repairId }`;
  - hidden when nothing is broken.
- Logbook lines (RU/EN): «Сломалось: охлаждение двигателя», «Починили: …» / «Починить не вышло: …», «Буксир: 250 €, +2 ч», «Марина: не хватило денег».
- Debrief scale label «Бюджет» / "Budget", with the spend and the week budget numbers.

- [ ] **Step 1: Write the failing tests.**
  - The repair block with a broken engine at anchor: self available with a badge, service disabled «только в марине».
  - Evening with gas broken: cook is disabled with its reason.
  - Taverna with money 10 €: disabled «нет денег».
  - Logbook: `break:engine_cooling:impeller_overheat` renders the RU line; `rescue:tow:r1` renders the tow line.
  - Week test: a scripted RU and EN week (seed chosen so that a failure happens) reaches the debrief with a break, a repair and a budget scale.
  - e2e: extend the full-week smoke to pass through the defects screen (phone and desktop), with no horizontal scroll.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run validate-content && npm run build && npm run e2e`. Expected: all green; e2e 4/4 or more.
- [ ] **Step 5: Commit** `feat(ui): evening repairs, money limits, system logbook lines, budget in debrief`.

---

## Spec coverage

| Spec §5 item | Task |
|---|---|
| 5.1 systems, state, brokenEffect, repairs, migrated events | 1, 2, 3, 4, 6 |
| 5.2 boat profile, defect pool, defectsPerWeek, fix or sail on, budget ~60% | 1, 5, 9, 10 |
| 5.3 weaknesses (Aurora battery/thruster, Meltemi rig ≥ 18 kn/slow, Calypso tanks) | 6, 8, 9 |
| 5.4 tow, budget axis, negative balance | 7, 11 |
| 5.5 dead fields (bowThruster, generator, toilet_valve, electrics, sails) | 1, 3, 5, 6 |
| 5.6 criteria incl. XP curve and newbie injury | 9 (R6, R7) |
| 3.2 `system.<id>.*` keys | 1 |
| 3.4 effects break/repair/wear | 1 |
| 7.1 save version bump | 1, 5, 7 |
| 7.4 tests: systems, defects, sim in CI | 1–9 |
