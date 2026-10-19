import type { PointKind } from '../../../engine';

/** Chart symbols centred on (0,0), about 16px. */
export function PointSymbol({ kind }: { kind: PointKind }) {
  switch (kind) {
    case 'base':
      return <path d="M0 -9 L2.6 -2.8 L9 -2.8 L3.8 1.2 L5.8 8 L0 4 L-5.8 8 L-3.8 1.2 L-9 -2.8 L-2.6 -2.8 Z" />;
    case 'marina':
      return <rect x="-6" y="-6" width="12" height="12" rx="2" />;
    case 'bay':
      return <path d="M0 -8 V7 M-6 2 Q0 10 6 2 M-4 -4 H4" fill="none" strokeWidth="2" />;
    case 'quay':
      return <path d="M-8 4 H8 M-6 4 V-4 M6 4 V-4" fill="none" strokeWidth="2.5" />;
  }
}

export function BoatToken() {
  return <path d="M0 -10 Q6 -2 5 8 L-5 8 Q-6 -2 0 -10 Z" />;
}
