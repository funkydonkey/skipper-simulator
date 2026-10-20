import type { Content } from '../../src/engine/types';

/** Inverse of parseContent: the on-disk shape (region pack header carries map and routes). */
export function toRaw(c: Content): Record<string, any> {
  const { map, routes, ...rest } = JSON.parse(JSON.stringify(c)) as Content;
  return { ...rest, region: { ...rest.region, map, routes } };
}
