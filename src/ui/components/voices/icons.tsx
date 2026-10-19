import type { VoiceId } from '../../../engine';

/** 24×24 line glyphs, drawn with currentColor. */
const PATHS: Readonly<Record<VoiceId, string>> = {
  sea_sense: 'M2 15c3-3 5-3 8 0s5 3 8 0 4-2 4-2M2 10c3-3 5-3 8 0s5 3 8 0 4-2 4-2',
  caution: 'M12 3 2 21h20L12 3zm0 6v6m0 3v1',
  order: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  mechanic: 'M14 6a4 4 0 0 0 5 5l-9 9-3-3 9-9a4 4 0 0 0-2-2z',
  diplomat: 'M4 5h16v10H9l-5 4V5z',
  economist: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm3 6h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9m3-10v2m0 8v2',
  pride: 'M3 18h18L19 8l-4 4-3-6-3 6-4-4-2 10z',
  crew_voice: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5m0-5c1-.6 1.6-1 2-1 3 0 6 2 6 5',
};

export function VoiceIcon({ voice, size = 20 }: { voice: VoiceId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[voice]} />
    </svg>
  );
}
