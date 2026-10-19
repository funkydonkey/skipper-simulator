import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/ui/styles/tokens.css', 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

const ratio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('night palette contrast (WCAG AA, 4.5:1)', () => {
  const night = block(".app[data-daytime='night']");
  it.each(['ok', 'warn', 'bad'])('--%s is readable on night surfaces', (tone) => {
    for (const surface of ['bg', 'panel', 'chart-paper']) {
      expect(ratio(night[tone]!, night[surface]!), `${tone} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the error banner pair is fixed and readable', () => {
    const root = block(':root');
    expect(ratio(root['banner-fg']!, root['red-500']!)).toBeGreaterThanOrEqual(4.5);
    expect(css).toMatch(/--banner-bg:\s*var\(--red-500\)/);
    expect(night['banner-bg']).toBeUndefined();
  });
});
