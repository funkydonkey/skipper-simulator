import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { loadBundledContent } from '../../src/ui/content';
import { loadContentDir } from '../../src/content/load-node';
import { parseContent } from '../../src/content/parse';
import { toRaw } from '../fixtures/raw';

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

/** A throwaway copy of content/ to break on purpose; removed after each test. */
async function contentCopy(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'skipper-pack-'));
  tempDirs.push(dir);
  await cp('content', dir, { recursive: true });
  return dir;
}

async function editJson(path: string, edit: (json: any) => void): Promise<void> {
  const json = JSON.parse(await readFile(path, 'utf8'));
  edit(json);
  await writeFile(path, JSON.stringify(json));
}

describe('content packs', () => {
  it('loads core + archipelago region pack', async () => {
    const { content, errors } = await loadContentDir('content');
    expect(errors).toEqual([]);
    expect(content!.region.id).toBe('archipelago');
    expect(content!.region.name.en).toBeTruthy();
    expect(content!.boats).toHaveLength(3);
    expect(content!.map).toHaveLength(9);
    expect(content!.routes).toHaveLength(13);
    expect(content!.events).toHaveLength(34);
    expect(content!.weather).toHaveLength(4);
  });

  it('missing region pack is an error, not a throw', async () => {
    const r = await loadContentDir('content', 'nope');
    expect(r.content).toBeNull();
    expect(r.errors.map((e) => e.file)).toEqual(expect.arrayContaining(['region', 'events', 'weather']));
  });

  it('reads every weather/*.json of the region, sorted by name', async () => {
    const dir = await contentCopy();
    const w = join(dir, 'regions', 'archipelago', 'weather');
    const tpl = JSON.parse(await readFile(join(w, 'meltemi_week.json'), 'utf8'));
    await writeFile(join(w, 'b.json'), JSON.stringify({ ...tpl, id: 'b_week' }));
    await writeFile(join(w, 'a.json'), JSON.stringify({ ...tpl, id: 'a_week' }));
    const r = await loadContentDir(dir);
    expect(r.errors).toEqual([]);
    expect(r.content!.weather.map((t) => t.id)).toEqual(['a_week', 'b_week', 'calm_then_front', 'meltemi_week', 'sirocco_week', 'variable_week']);
  });

  it('rejects a region pack whose region.json id is not the requested region', async () => {
    const dir = await contentCopy();
    await editJson(join(dir, 'regions', 'archipelago', 'region.json'), (r) => { r.id = 'elsewhere'; });
    const r = await loadContentDir(dir);
    expect(r.content).toBeNull();
    expect(r.errors).toContainEqual(expect.objectContaining({ file: 'region', path: 'id', message: expect.stringMatching(/elsewhere.*archipelago/) }));
  });

  it('validate-content fails on a flag nobody reads, and passes on shipped content', async () => {
    const dir = await contentCopy();
    await editJson(join(dir, 'regions', 'archipelago', 'events.json'), (events) => {
      const option = events.flatMap((e: any) => e.options).find((o: any) => o.effects);
      option.effects.flag = 'zz_dead_flag';
    });
    const run = promisify(execFile);
    const tsx = resolve('node_modules/.bin/tsx');
    const failed = await run(tsx, ['scripts/validate-content.ts', dir]).then(() => null, (e: { code: number; stderr: string }) => e);
    expect(failed?.code).toBe(1);
    expect(failed?.stderr).toMatch(/flag:zz_dead_flag/);
    const ok = await run(tsx, ['scripts/validate-content.ts', 'content']);
    expect(ok.stdout).toMatch(/Content OK/);
  }, 30000);

  it('region errors are reported under file "region"', async () => {
    const { content } = await loadContentDir('content');
    const raw = toRaw(content!);
    raw.region.map[0].extra = 1;
    const r = parseContent(raw);
    expect(r.errors).toContainEqual(expect.objectContaining({ file: 'region', path: expect.stringMatching(/^map\.0/) }));
  });

  it('bundled content deep-equals node-loaded content', async () => {
    const node = await loadContentDir('content');
    const bundled = loadBundledContent();
    expect(bundled.errors).toEqual([]);
    expect(bundled.content).toEqual(node.content);
  });
});
