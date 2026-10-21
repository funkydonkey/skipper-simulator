import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { VoiceReport } from '../../../../src/engine';
import { VoicesBlock } from '../../../../src/ui/screens/debrief/VoicesBlock';

const report = (over: Partial<VoiceReport>): VoiceReport => ({ voice: 'sea_sense', startLevel: 1, endLevel: 2, xp: [], levelUps: [], impacts: [], ...over });

const VOICES: VoiceReport[] = [
  report({
    voice: 'caution',
    xp: [{ cause: 'order:ok', xp: 1 }, { cause: 'roll:check', xp: 6 }, { cause: 'order:wrong', xp: 3 }, { cause: 'other:x', xp: 2 }],
    impacts: [{ kind: 'risk', rolls: 4, avgDeltaPp: -7.5 }, { kind: 'checks', passed: 2, failed: 1 }],
  }),
  report({ voice: 'sea_sense', impacts: [{ kind: 'front_warned', days: [3, 4] }] }),
  report({ voice: 'economist', impacts: [{ kind: 'saved_eur', eur: 12.5 }] }),
  report({ voice: 'diplomat', impacts: [{ kind: 'softened', mood: 6 }] }),
];

describe('VoicesBlock', () => {
  it('renders every impact kind in Russian', () => {
    render(<VoicesBlock voices={VOICES} lang="ru" />);
    expect(screen.getByRole('heading', { name: 'Голоса недели' })).toBeInTheDocument();
    for (const s of ['риск ниже на 7.5 п.п. за бросок (бросков: 4)', 'проверки: 2 из 3', 'предупредило о фронте, дни: 3, 4', 'сэкономил 12.5 €', 'смягчил обиды на 6', 'уровень 1 → 2']) {
      expect(screen.getAllByText(s).length).toBeGreaterThan(0);
    }
  });

  it('renders every impact kind in English', () => {
    render(<VoicesBlock voices={VOICES} lang="en" />);
    expect(screen.getByRole('heading', { name: 'Voices of the week' })).toBeInTheDocument();
    for (const s of ['risk 7.5 pp lower per roll (rolls: 4)', 'checks: 2 of 3', 'warned of a front, days: 3, 4', 'saved €12.5', 'softened grudges by 6', 'level 1 → 2']) {
      expect(screen.getAllByText(s).length).toBeGreaterThan(0);
    }
  });

  it('lists only the top three XP sources by XP', () => {
    render(<VoicesBlock voices={[VOICES[0]!]} lang="en" />);
    expect(screen.getByText(/\+6 checks; \+3 maneuver mistakes; \+2 other$/)).toBeInTheDocument();
    expect(screen.queryByText(/clean maneuvers/)).toBeNull();
  });

  it('labels fault XP by its first segment', () => {
    const v = report({ voice: 'mechanic', xp: [{ cause: 'fault:engine_cooling', xp: 2 }] });
    render(<VoicesBlock voices={[v]} lang="ru" />);
    expect(screen.getByText(/\+2 неисправности$/)).toBeInTheDocument();
  });

  it('labels fault XP in English', () => {
    const v = report({ voice: 'mechanic', xp: [{ cause: 'fault:rig', xp: 3 }] });
    render(<VoicesBlock voices={[v]} lang="en" />);
    expect(screen.getByText(/\+3 faults$/)).toBeInTheDocument();
  });

  it('words a raised risk per roll too', () => {
    render(<VoicesBlock voices={[report({ voice: 'order', impacts: [{ kind: 'risk', rolls: 3, avgDeltaPp: 2 }] })]} lang="ru" />);
    expect(screen.getByText('риск выше на 2 п.п. за бросок (бросков: 3)')).toBeInTheDocument();
  });

  it('labels an unknown XP source generically in Russian', () => {
    render(<VoicesBlock voices={[VOICES[0]!]} lang="ru" />);
    expect(screen.getByText(/\+2 прочее$/)).toBeInTheDocument();
  });

  it('renders nothing for zero impacts and drops an empty card', () => {
    const idle = report({ voice: 'order', startLevel: 0, endLevel: 0, impacts: [{ kind: 'risk', rolls: 2, avgDeltaPp: 0 }, { kind: 'checks', passed: 0, failed: 0 }, { kind: 'saved_eur', eur: 0 }, { kind: 'softened', mood: 0 }] });
    const { container } = render(<VoicesBlock voices={[idle]} lang="en" />);
    expect(container).toBeEmptyDOMElement();
  });
});
