import type { Situation } from './types';

export type SituationContext = Record<string, string | number | boolean>;

/**
 * Condition-language view of a situation; neutral values when there is none.
 * A leaf module (types only) so expr.ts can spread it without importing situation.ts.
 */
export function situationContext(s: Situation | null): SituationContext {
  return {
    'wind.side': s?.windSide ?? 'none',
    'wind.kn': s?.windKn ?? 0,
    'wind.dir': s?.windDir ?? '',
    'place.marinero': s?.marinero ?? false,
    'place.tight': s?.tight ?? false,
    'place.berth': s?.berth ?? '',
  };
}
