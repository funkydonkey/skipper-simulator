import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VoiceBadge } from '../../../src/ui/components/voices/VoiceBadge';
import { VoiceLine } from '../../../src/ui/components/voices/VoiceLine';
import { renderWithSession } from '../render';

describe('voices', () => {
  it('badge shows the localized voice name and level', () => {
    renderWithSession(<VoiceBadge voice="mechanic" level={3} />, null, 'en');
    expect(screen.getByText('Mechanic')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('line marks false voices', () => {
    const { container } = renderWithSession(<VoiceLine voice="pride" text="Не позорься." />);
    expect(screen.getByText('Не позорься.')).toBeInTheDocument();
    expect(container.querySelector('[data-voice="pride"]')?.getAttribute('data-false')).toBe('true');
  });
});
