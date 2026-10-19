# Stage 2 (browser UI): follow-ups

Collected 2026-10-19 from the 18 per-task reviews, the final whole-branch review and the review of its fix wave. The UI is ready to merge; the items below were deliberately deferred.

## Visible to the player (Stage 3 polish)
- On phone event screens, which have no action footer, the fixed "Logbook" button can cover the right end of the last option while the page is scrolled to the top.
- Contrast is below 4.5:1 in the dusk palette (`--bad`/`--ok` on the background: 3.1–3.7:1) and in the day palette (`--ok` on paper: 4.16:1). The night palette has already been fixed.
- On the chart, the r=40 hit circles of points that sit close together can overlap, and the later point wins the click.
- Route lines on the chart cross the drawn islands (cosmetic).
- The logbook drawer:
  - it pulls focus back to itself on every re-render;
  - it has no focus trap;
  - closing it does not return focus;
  - Escape works only while focus is inside the drawer.
- The genoa and course selects in the planner have aria-labels that name one option rather than the field.
- The SVG check-in points have no name or tooltip for mouse users.
- Typewriter text is revealed by clicking a `<p>`, which has no keyboard equivalent.
- The menu seed field:
  - it accepts values ≥ 2^31 and forms like `1e3` or `0x10`;
  - an invalid seed silently falls back to a random week.
- The "Time spent" line in an event outcome is not rounded, so float noise can show.
- The Safari blur filter on chart clouds may not render.

## Code and tests
- The UI duplicates two engine rules:
  - `departureOptions` (earliest hour, sunset, current clock);
  - `maneuversFor` (which maneuvers happen today).
  
  Move them into the engine API when `planDay` is split by leg.
- `previewPlan` does not model a jump-start delay or the switch from motor to sail on an empty tank, and assumes the refusal path when a marina is late. The wind and `planLeg` call is duplicated between preview.ts and legs.ts.
- The save schema keeps `weather`, `dayFacts` and `expectations` as `z.unknown()`, so a hand-edited save could crash the engine later.
- logbook.ts:
  - has raw literals `'?'`, `${mId}: ${errId}` and `' — '` outside a Dict;
  - its `activity` and `marina` branches will mislabel new verbs;
  - `zero:fuel` can appear twice in one leg.
- Test gaps:
  - Untested branches: the last-day reminder, the `sea_sense` line, the low-gas warning, the damage list, `requires`-gated options, unheard voices, PreviewPanel warnings, and the hand-off of the last maneuver order.
  - PassageScreen relies on the seed queuing an event.
  - The week bot uses a single seed.
- `tests-e2e/` and `playwright.config.ts` are not type-checked.
- `npm audit` shows warnings for the new dev dependencies.

## Decisions to carry into ТЗ v0.2
- React 19 + Vite 5.4. There is no router: the current screen is derived from the game state.
- `previewPlan` in the engine shows the newbie's estimate: forecast plus diurnal wind change. The local amplification is shown only with Sea Sense ≥ 2, and the front only if the barometer was checked.
- Maneuver command order is chosen before departure. Mooring at a marina where berths may run out also asks for an anchoring order as a fallback.
- Autosave runs only in the morning. The save slot is cleared at the debrief.
- "Continue" keeps the language chosen in the menu. Language can be switched mid-game in the logbook.
- Engine errors are shown as localized messages keyed by error code.
- Deployment is GitHub Pages and requires a public repository. Render remains an option for later.
