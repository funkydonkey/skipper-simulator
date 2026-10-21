import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ENGINE_READS, findDeadContent } from '../../src/content/dead';
import { parseContent } from '../../src/content/parse';
import { toRaw } from '../fixtures/raw';
import { loadContentDir } from '../../src/content/load-node';
import type { Content } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';

const refs = (c: Content, allow: Array<{ ref: string; reason: string }> = []): string[] => findDeadContent(c, allow).map((e) => e.path);

const cleanContent = makeContent;

describe('findDeadContent', () => {
  it('reports a written but unread flag', () => {
    const c = cleanContent();
    c.events[0]!.options[1]!.effects = { flag: 'x' };
    expect(refs(c)).toContain('flag:x');
  });

  it('does not report a flag some condition reads', () => {
    const c = cleanContent();
    c.events[0]!.options[1]!.effects = { flag: 'x' };
    c.events[0]!.trigger.conditions = ['flag.x'];
    expect(refs(c)).not.toContain('flag:x');
  });

  it('counts identifiers read in chance mods (if and per)', () => {
    const c = cleanContent();
    c.events[0]!.options[1]!.effects = { flag: 'x' };
    c.events[0]!.trigger.chance = { base: 0.2, mods: [{ if: 'flag.x', add: 0.1, label: 'briefing' }] } as never;
    expect(refs(c)).not.toContain('flag:x');
  });

  it('reports a flag that is read but never written', () => {
    const c = cleanContent();
    c.events[0]!.trigger.conditions = ['flag.ghost'];
    expect(refs(c)).toContain('flag-read:ghost');
  });

  it('reports an unused checkpoint', () => {
    expect(refs(cleanContent())).toContain('checkpoint:electrics');
  });

  it('does not report a checkpoint a defect or condition uses', () => {
    const r = refs(cleanContent());
    expect(r).not.toContain('checkpoint:impeller');
    expect(r).not.toContain('checkpoint:toilets');
  });

  it('reports an unread briefing topic, but not engine-read ones', () => {
    const r = refs(cleanContent());
    expect(r).toContain('topic:sails');
    expect(r).not.toContain('topic:anchor');
    expect(r).not.toContain('topic:loaded_lines');
    expect(r).not.toContain('topic:toilet');
  });

  it('reports a defect with neither a system nor a charge, but not one that has either', () => {
    const c = cleanContent();
    const [impeller, , scratch] = c.boats[0]!.defectPool;
    expect(refs(c)).not.toContain('defect:worn_impeller');
    expect(refs(c)).not.toContain('defect:old_scratch');
    c.boats[0]!.defectPool = [{ id: impeller!.id, checkpoint: impeller!.checkpoint, description: impeller!.description }, scratch!];
    expect(refs(c)).toContain('defect:worn_impeller');
  });

  it('reports unread boat fields', () => {
    expect(refs(cleanContent())).toEqual(expect.arrayContaining(['boat-field:boat.shared_bank', 'boat-field:boat.electric_toilet']));
  });

  it('suppresses allowlisted refs', () => {
    const r = refs(cleanContent(), [{ ref: 'topic:sails', reason: 'plan-3b' }]);
    expect(r).not.toContain('topic:sails');
    expect(r).not.toContain('allow:topic:sails');
  });

  it('reports a stale allowlist entry', () => {
    const r = refs(cleanContent(), [{ ref: 'topic:anchor', reason: 'stale' }]);
    expect(r).toContain('allow:topic:anchor');
  });

  it('every error is a cross-file error', () => {
    expect(findDeadContent(cleanContent(), []).every((e) => e.file === 'cross')).toBe(true);
  });

  it('real content passes with the shipped allowlist', async () => {
    const { content, errors } = await loadContentDir('content');
    expect(errors).toEqual([]);
    const allow = JSON.parse(await readFile('content/core/dead-content-allow.json', 'utf8'));
    expect(findDeadContent(content!, allow)).toEqual([]);
  });

  it('real content without the allowlist reports exactly the allowlisted refs', async () => {
    const { content } = await loadContentDir('content');
    const allow = JSON.parse(await readFile('content/core/dead-content-allow.json', 'utf8')) as Array<{ ref: string }>;
    expect(refs(content!).sort()).toEqual(allow.map((a) => a.ref).sort());
  });
});

describe('parseContent dead-content check', () => {
  it('real content is fully live with an empty allowlist (and the check is skipped when omitted)', async () => {
    const { content } = await loadContentDir('content');
    const raw = toRaw(content!);
    expect(parseContent(raw).errors).toEqual([]);
    expect(parseContent(raw, []).errors).toEqual([]);
  });

  it('rejects a malformed allowlist', async () => {
    const { content } = await loadContentDir('content');
    expect(parseContent(toRaw(content!), [{ ref: 'x' }]).errors).not.toEqual([]);
  });
});

describe('ENGINE_READS', () => {
  it.each(ENGINE_READS)('$id still appears in $source', async ({ id, source }) => {
    expect(await readFile(source, 'utf8')).toContain(id);
  });
});
