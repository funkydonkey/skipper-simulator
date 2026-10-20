import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBundledContent } from '../../src/ui/content';
import { loadContentDir } from '../../src/content/load-node';
import { parseContent } from '../../src/content/parse';
import { toRaw } from '../fixtures/raw';

describe('content packs', () => {
  it('loads core + archipelago region pack', async () => {
    const { content, errors } = await loadContentDir('content');
    expect(errors).toEqual([]);
    expect(content!.region.id).toBe('archipelago');
    expect(content!.region.name.en).toBeTruthy();
    expect(content!.boats).toHaveLength(3);
    expect(content!.map).toHaveLength(9);
    expect(content!.routes).toHaveLength(13);
    expect(content!.events).toHaveLength(30);
    expect(content!.weather).toHaveLength(1);
  });

  it('missing region pack is an error, not a throw', async () => {
    const r = await loadContentDir('content', 'nope');
    expect(r.content).toBeNull();
    expect(r.errors.map((e) => e.file)).toEqual(expect.arrayContaining(['region', 'events', 'weather']));
  });

  it('reads every weather/*.json of the region, sorted by name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'skipper-pack-'));
    await cp('content', dir, { recursive: true });
    const w = join(dir, 'regions', 'archipelago', 'weather');
    const tpl = JSON.parse(await readFile(join(w, 'meltemi_week.json'), 'utf8'));
    await writeFile(join(w, 'b.json'), JSON.stringify({ ...tpl, id: 'b_week' }));
    await writeFile(join(w, 'a.json'), JSON.stringify({ ...tpl, id: 'a_week' }));
    const r = await loadContentDir(dir);
    expect(r.errors).toEqual([]);
    expect(r.content!.weather.map((t) => t.id)).toEqual(['a_week', 'b_week', 'meltemi_week']);
  });

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
