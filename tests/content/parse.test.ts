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
