import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseContent } from '../../src/content/parse';

const read = (f: string): unknown => JSON.parse(readFileSync(`content/${f}.json`, 'utf8'));
const WORLD = ['boats', 'crew', 'briefing', 'maneuvers', 'balance', 'systems'] as const;

type RawSystem = { failures: Array<Record<string, unknown>> };

/** Failure events live in events.json (narrative), which this check leaves empty: drop those references. */
const withoutFailureEvents = (systems: RawSystem[]): RawSystem[] =>
  systems.map((d) => ({ ...d, failures: d.failures.map(({ event: _event, ...f }) => f) }));

function worldOnly() {
  const raw: Record<string, unknown> = Object.fromEntries(WORLD.map((f) => [f, read(`core/${f}`)]));
  raw.systems = withoutFailureEvents(raw.systems as RawSystem[]);
  const weather = [read('regions/archipelago/weather/meltemi_week')];
  return parseContent({ ...raw, region: read('regions/archipelago/region'), weather, events: [], dialogues: [], debrief: [] });
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
