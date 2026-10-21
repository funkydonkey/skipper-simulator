import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Situation, WindSide } from '../../../src/engine';
import { SituationCard } from '../../../src/ui/screens/maneuvers/SituationCard';
import { gameAt } from '../fixtures';
import { renderWithSession } from '../render';

const odds = { value: 0.3, parts: [{ source: 'base', delta: 0.3 }] };
const forecast: Situation = {
  berth: 'stern_to', windSide: 'port', windKn: 12, windDir: 'W', marinero: false, marineroOdds: odds,
  seabed: 'sand', tight: false, source: 'forecast',
};

describe('SituationCard', () => {
  it('a forecast: berth, wind side with knots and direction, marinero chance, seabed, room and the forecast label', () => {
    renderWithSession(<SituationCard situation={forecast} lang="ru" />, gameAt('planning'));
    expect(screen.getByText('Прогноз — на месте может отличаться')).toBeInTheDocument();
    expect(screen.getByText('Кормой (муринг)')).toBeInTheDocument();
    expect(screen.getByText('ветер в борт слева, 12 уз, W')).toBeInTheDocument();
    expect(screen.getByText('маринеро:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30%' })).toBeInTheDocument();
    expect(screen.getByText('грунт: песок')).toBeInTheDocument();
    expect(screen.getByText('просторно')).toBeInTheDocument();
  });

  it('a fact: marinero yes or no, no forecast label', () => {
    const { unmount } = renderWithSession(<SituationCard situation={{ ...forecast, source: 'fact', marinero: true, tight: true }} lang="ru" />, gameAt('planning'));
    expect(screen.queryByText('Прогноз — на месте может отличаться')).toBeNull();
    expect(screen.getByText('маринеро есть')).toBeInTheDocument();
    expect(screen.getByText('тесно')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '30%' })).toBeNull();
    unmount();
    renderWithSession(<SituationCard situation={{ ...forecast, source: 'fact' }} lang="ru" />, gameAt('planning'));
    expect(screen.getByText('маринеро нет')).toBeInTheDocument();
  });

  it('a forecast at a place without a marinero says so instead of a chance', () => {
    renderWithSession(<SituationCard situation={{ ...forecast, marineroOdds: null, berth: 'anchor', seabed: 'rock' }} lang="ru" />, gameAt('planning'));
    expect(screen.getByText('маринеро нет')).toBeInTheDocument();
    expect(screen.getByText('На якоре')).toBeInTheDocument();
    expect(screen.getByText('грунт: камень')).toBeInTheDocument();
  });

  it('names every wind side in both languages; no wind is calm', () => {
    const cases: Array<[WindSide, string, string]> = [
      ['port', 'ветер в борт слева, 12 уз, W', 'wind on the port side, 12 kn, W'],
      ['starboard', 'ветер в борт справа, 12 уз, W', 'wind on the starboard side, 12 kn, W'],
      ['bow', 'ветер в нос, 12 уз, W', 'wind on the bow, 12 kn, W'],
      ['stern', 'ветер в корму, 12 уз, W', 'wind from astern, 12 kn, W'],
      ['none', 'штиль', 'calm'],
    ];
    for (const [side, ru, en] of cases) {
      const a = renderWithSession(<SituationCard situation={{ ...forecast, windSide: side }} lang="ru" />, gameAt('planning'), 'ru');
      expect(screen.getByText(ru)).toBeInTheDocument();
      a.unmount();
      const b = renderWithSession(<SituationCard situation={{ ...forecast, windSide: side }} lang="en" />, gameAt('planning'), 'en');
      expect(screen.getByText(en)).toBeInTheDocument();
      expect(screen.getByText('Forecast — may differ on arrival')).toBeInTheDocument();
      b.unmount();
    }
  });
});
