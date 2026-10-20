import { describe, expect, it, vi } from 'vitest';
import { loadBundledContent } from '../../src/ui/content';

vi.mock('../../content/regions/archipelago/region.json', async (importOriginal) => {
  const original = (await importOriginal()) as { default: Record<string, unknown> };
  return { default: { ...original.default, id: 'elsewhere' } };
});

describe('bundled content loader', () => {
  it('rejects a region pack whose region.json id is not the requested region', () => {
    const r = loadBundledContent();
    expect(r.content).toBeNull();
    expect(r.errors).toContainEqual(expect.objectContaining({ file: 'region', path: 'id', message: expect.stringMatching(/elsewhere.*archipelago/) }));
  });
});
