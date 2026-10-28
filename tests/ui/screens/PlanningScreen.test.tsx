import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { content, gameAt } from '../fixtures';
import { renderShell } from '../render';

const atBase = () => ({ ...gameAt('planning'), locationId: 'base_marina', clockMin: 8 * 60 });

describe('PlanningScreen', () => {
  it('shows the forecast and lets you add and remove a leg on the chart', async () => {
    const r = renderShell(atBase());
    expect(screen.getAllByRole('img', { name: /уз/ }).length).toBeGreaterThan(0);
    await r.user.click(screen.getByRole('button', { name: /^Кала-Адзурра/ }));
    expect(screen.getByText(/Марина Порто-Кало \(база\) → Кала-Адзурра/)).toBeInTheDocument();
    expect(screen.getByText(/Приход около/)).toBeInTheDocument();
    await r.user.click(screen.getByRole('button', { name: 'Убрать последний переход' }));
    expect(screen.queryByText(/Приход около/)).toBeNull();
  });

  it('previews seabed and anchor odds for a bay, and sail damage risk under sail', async () => {
    const r = renderShell(atBase());
    await r.user.click(screen.getByRole('button', { name: /^Кала-Адзурра/ }));
    await r.user.click(screen.getByLabelText('Под парусом'));
    expect(screen.getByText(/Грунт: /)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Якорь не возьмёт \(за попытку\) · \d+%$/ })).toBeInTheDocument();
    expect(screen.queryByText(/Марина может отказать/)).toBeNull();
    expect(screen.queryByText(/Риск порвать парус/)).toBeNull();
  });

  it('shows the sail damage risk when the wind is strong', async () => {
    const base = atBase();
    const r = renderShell({ ...base, weather: { ...base.weather!, forecastKn: 30, forecastGustKn: 36 } });
    await r.user.click(screen.getByRole('button', { name: /^Кала-Адзурра/ }));
    await r.user.click(screen.getByLabelText('Под парусом'));
    expect(screen.getByText(/Риск порвать парус/)).toBeInTheDocument();
  });

  it('warns when a broken engine turns a motor leg into a sail, and when a tow will be needed', async () => {
    const base = atBase();
    const dead = { ...base, systems: { ...base.systems, engine_cooling: { ...base.systems.engine_cooling!, broken: true } } };
    const breeze = renderShell({ ...dead, weather: { ...dead.weather!, forecastKn: 12, forecastGustKn: 15 } });
    await breeze.user.click(screen.getByRole('button', { name: /^Кала-Адзурра/ }));
    expect(screen.getByText('Мотор не работает: этот переход под парусом.')).toBeInTheDocument();
    expect(screen.queryByText(/буксир/i)).toBeNull();
    breeze.unmount();
    const calm = renderShell({ ...dead, lang: 'en', weather: { ...dead.weather!, forecastKn: 2, forecastGustKn: 3 } }, { lang: 'en' });
    await calm.user.click(screen.getByRole('button', { name: /^Cala Azzurra/ }));
    expect(screen.getByText('You will need a tow: €250, 2 h.')).toBeInTheDocument();
  });

  it('warns when a broken rig turns a sail leg into a motor leg', async () => {
    const base = atBase();
    const r = renderShell({ ...base, systems: { ...base.systems, rig: { ...base.systems.rig!, broken: true } } });
    await r.user.click(screen.getByRole('button', { name: /^Кала-Адзурра/ }));
    expect(screen.queryByText(/Паруса не работают/)).toBeNull();
    await r.user.click(screen.getByLabelText('Под парусом'));
    expect(screen.getByText('Паруса не работают: этот переход под мотором.')).toBeInTheDocument();
  });

  it('a stay day goes straight to the evening', async () => {
    const r = renderShell(atBase());
    await r.user.click(screen.getByRole('button', { name: 'Провести день здесь' }));
    expect(['evening', 'event']).toContain(r.currentScreen());
  });

  it('a sailing day goes to the maneuvers with the plan as drafted', async () => {
    const r = renderShell(atBase());
    await r.user.click(screen.getByRole('button', { name: /^Кала-Адзурра/ }));
    await r.user.click(screen.getByLabelText('Под парусом'));
    await r.user.click(screen.getByRole('button', { name: 'К манёврам' }));
    expect(r.currentScreen()).toBe('maneuvers');
    expect(r.session().ui.draftPlan?.legs[0]).toMatchObject({ routeId: 'r_base_marina_cala_azzurra', mode: 'sail' });
  });

  it('after sunset only offers to stay', () => {
    renderShell({ ...atBase(), clockMin: 20 * 60 + 30 });
    expect(screen.getByText('Сегодня уже поздно выходить')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /^Кала-Адзурра/ })).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Провести день здесь' })).toBeEnabled();
  });

  it('an engine rejection shows a localized banner and keeps the screen', () => {
    const r = renderShell(atBase());
    r.dispatch({ type: 'draft_plan', plan: { departureHour: 3, legs: [], swimStops: 0, shower: 'normal', autopilot: false } });
    expect(screen.getByRole('alert')).toHaveTextContent(/^Не получилось: такой выбор не подходит/);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/[A-Za-z]/);
    expect(r.currentScreen()).toBe('planning');
  });

  it('shows a localized line instead of the preview when the engine cannot estimate', () => {
    renderShell({ ...atBase(), weather: null });
    expect(screen.getByText('Не удаётся оценить этот план: сейчас этого сделать нельзя')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Провести день здесь' })).toBeInTheDocument();
  });

  it('shows engine errors in English when the game is in English', () => {
    const r = renderShell({ ...atBase(), weather: null, lang: 'en' }, { lang: 'en' });
    expect(screen.getByText("Can't estimate this plan: this is not possible right now")).toBeInTheDocument();
    r.dispatch({ type: 'draft_plan', plan: { departureHour: 3, legs: [], swimStops: 0, shower: 'normal', autopilot: false } });
    expect(screen.getByRole('alert')).not.toHaveTextContent(/[А-Яа-яЁё]/);
  });

  it('shows Sea Sense forecast insight by level', () => {
    const base = atBase();
    const withSense = (level: number, front: boolean) => ({ ...base, voices: { ...base.voices, sea_sense: level }, weather: { ...base.weather!, front } });
    const low = renderShell(withSense(2, true));
    expect(screen.queryByText(/Чутьё: /)).toBeNull();
    low.unmount();
    const mid = renderShell(withSense(3, true));
    expect(screen.getByText(/^Чутьё: шанс фронта \d+%$/)).toBeInTheDocument();
    expect(screen.queryByText(/Чутьё: фронт после/)).toBeNull();
    mid.unmount();
    renderShell(withSense(4, true));
    expect(screen.getByText('Чутьё: фронт после 13:00')).toBeInTheDocument();
  });

  describe('berth choice and template', () => {
    const toNisi = async (r: ReturnType<typeof renderShell>, name = 'Городская набережная Ниси') => {
      await r.user.click(screen.getByRole('button', { name: /^Кала-Адзурра/ }));
      await r.user.click(screen.getByRole('button', { name: name }));
    };

    it('offers both berths at nisi_quay and puts the choice into the drafted plan', async () => {
      const r = renderShell(atBase());
      await toNisi(r);
      const group = screen.getByRole('radiogroup', { name: 'Как швартоваться' });
      expect(group).toBeInTheDocument();
      expect(screen.getByLabelText(/Кормой \(муринг\)/)).toBeChecked();
      const side = screen.getByLabelText(/Лагом/);
      await r.user.click(side);
      expect(side).toBeChecked();
      expect(screen.getByText(/×1[.,]5/)).toBeInTheDocument();
      await r.user.click(screen.getByRole('button', { name: 'К манёврам' }));
      expect(r.session().ui.draftPlan?.berth).toBe('side_to');
    });

    it('shows no selector at a single-berth destination and sends no berth', async () => {
      const r = renderShell(atBase());
      await r.user.click(screen.getByRole('button', { name: /^Кала-Адзурра/ }));
      expect(screen.queryByRole('radiogroup', { name: 'Как швартоваться' })).toBeNull();
      await r.user.click(screen.getByRole('button', { name: 'К манёврам' }));
      expect(r.session().ui.draftPlan?.berth).toBeUndefined();
    });

    it('drops a berth the new destination lacks when the route changes', async () => {
      const r = renderShell(atBase());
      await toNisi(r);
      await r.user.click(screen.getByLabelText(/Лагом/));
      await r.user.click(screen.getByRole('button', { name: 'Убрать последний переход' }));
      await r.user.click(screen.getByRole('button', { name: 'К манёврам' }));
      expect(r.session().ui.draftPlan?.berth).toBeUndefined();
    });

    it('shows the berth fee factor with a decimal comma in Russian', async () => {
      const r = renderShell(atBase());
      await toNisi(r);
      expect(screen.getByLabelText(/Лагом/).closest('label')).toHaveTextContent('×1,5');
    });

    it('shelters the chart from the front direction when its signs are visible, else from the forecast', () => {
      const base = atBase();
      const w = { ...base.weather!, forecastDir: 'N' as const, front: true, frontDir: 'NW' as const };
      const hidden = renderShell({ ...base, weather: { ...w, signalsVisible: false } });
      expect(screen.getAllByLabelText(/Бухта .* ветр[а-я]* N$/).length).toBeGreaterThan(0);
      expect(screen.queryAllByLabelText(/ветр[а-я]* NW$/)).toHaveLength(0);
      hidden.unmount();
      renderShell({ ...base, weather: { ...w, signalsVisible: true } });
      expect(screen.getAllByLabelText(/ветр[а-я]* NW$/).length).toBeGreaterThan(0);
    });

    it('a read barometer on a quiet day says no front is coming; an unread one says nothing about it', () => {
      const base = atBase();
      const calm = { ...base.weather!, front: false, barometerTrendHpa: 0 };
      const read = renderShell({ ...base, weather: { ...calm, signalsVisible: true } });
      expect(screen.getByText(/Барометр \d+ гПа, за ночь не менялся/)).toBeInTheDocument();
      expect(screen.getByText('Фронта сегодня не ждём.')).toBeInTheDocument();
      read.unmount();
      renderShell({ ...base, weather: { ...calm, signalsVisible: false } });
      expect(screen.queryByText('Фронта сегодня не ждём.')).not.toBeInTheDocument();
      expect(screen.getByText('На барометр сегодня не смотрели.')).toBeInTheDocument();
      expect(screen.queryByText(/гПа/)).not.toBeInTheDocument();
    });

    it('names the weeks weather template in the forecast panel', () => {
      renderShell(atBase());
      const name = content.weather.find((x) => x.id === atBase().weatherTemplateId)!.name.ru;
      expect(screen.getByText(`Неделя: ${name}`)).toBeInTheDocument();
    });
  });
});
