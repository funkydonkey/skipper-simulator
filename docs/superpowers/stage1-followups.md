# Stage 1 — follow-ups for Stage 2/3

Collected from per-task reviews, the final whole-branch review and its re-review (2026-10-19). Engine is merged-ready; these are known, deliberately deferred items.

## Stage 2 (before/with UI)
- Debrief `covered()` ignores `injury:event:<id>` → one incident can appear as a link and as an event note (one-line fix in `src/engine/debrief.ts`).
- Departure can slip past sunset after a jump start or morning `time_hours` event (`validatePlan` checks only the planned hour).
- `night:arrival` is judged before the marina queue wait (19:50 arrival + 45 min queue escapes the penalty).
- `at_marina` becomes true again the next morning after anchoring outside a marina (dayFacts reset in `endDay`).
- `validateOrders` silently accepts orders for maneuver kinds absent from content.
- Passage/arrival events are still resolved after the passage finishes (their `time_hours` now affect rest and the return deadline, but cannot reroute the passage). Consider splitting `planDay` per leg for the UI.
- Event order in `events.json` acts as priority within a phase (first eligible success wins) — document for content authors or switch to weighted pick.
- Condition grammar: `!` binds looser than comparison (`!a == b` = `!(a == b)`); one comparison per expression.
- Promises said on the last evening are never resolved; same-dialogue-twice now deduped.

## Stage 3 (balance & polish)
- Balance is polarized: batch 40 → newbie 0.0/8 (mood 0, fatigue ~100, 4.2 injuries/week), expert 8.0/8 (mood 100). Target: newbie 2–4/8, expert 6–7/8, newbie injuries ≤ 1. Clamped mood/fatigue hide later penalties.
- `time.ts` anchor fail chance clamp `0.95` is a literal — move to balance.
- Never-firing events with the sim strategies: `fuel_dock_queue` (strategies never run low on fuel at a berth), `gas_smell` (needs calypso_38).
- Briefing topics `fenders`, `toilet`, `mob`, `sails` mitigate no maneuver error (only events use them).
- No hidden defect uses the `electrics` checkpoint.
- Debrief for a good week is thin (expert ~1.1 links).
- Acceptance #5 checks one event's EN text (validator already requires both languages everywhere).
- `src/engine/types.ts` is 413 lines (> 400 limit) — split by domain.
- EN text nits: `strait_chop` option "Bear away on a long detour" → "Take the long way round"; `impeller_overheat` ambiguous "water is almost gone" (means cooling water); `water_low_warning` mechanic line; `barometer_drop` debrief tense ("had been falling"); `swimmer_near_prop` missing "?"; `sailor_wants_sailing` comma; `taverna_question` "maybe" option; `guest_seasick` comma splice; debrief `injury_cleats` "learned to use cleats"; `shared_bank` "bow thruster"; `dead_starter_morning` "starter battery"; pick British spelling consistently; `marinero_commands` "Dai-dai!" transliteration.
- Minor engine nits: `formatClock` constants (24 defined thrice), `injury:<cause>` log entries not printed by sim report, `zero:fuel` can log twice per day, `planLeg` Infinity if speed 0 (degenerate balance only), `resourceReadout` NaN if step 0.

## Decisions to carry into ТЗ v0.2
- 6 trainable voices of 8 (pride and crew voice fixed from balance).
- 11th content file `maneuvers.json`.
- Fronts arrive after 13:00 and persist past midnight; afternoon factor only until 24:00.
- Night rules: swims skipped after sunset; night arrival costs fatigue/mood and anchoring is harder; taverna closes 23:00; sleep shortened after late arrivals; clock shows "HH:MM +1".
- Rest mood and the day-6 return check are computed at `endDay` (after events).
- Default crew 4 guests (`balance.start.crewSize`).
- `mood_per_day` (e.g. broken head) resets after a night at a berth.
