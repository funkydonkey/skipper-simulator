import { Button } from '../../components/Button';
import { ScreenFrame } from '../../components/ScreenFrame';
import { useAct, useGame, useT } from '../../session/SessionContext';
import { DEFECTS } from './strings';

export function DefectsScreen() {
  const { game, content, lang } = useGame();
  const act = useAct();
  const t = useT(DEFECTS);
  const boat = content.boats.find((b) => b.id === game.boatId);
  const found = (game.checkin?.found ?? []).flatMap((id) => boat?.defectPool.find((d) => d.id === id) ?? []);

  return (
    <ScreenFrame
      screen="defects"
      title={t('title')}
      subtitle={t('subtitle')}
      actions={<Button onClick={() => act({ type: 'resolve_defects', fixIds: [] })}>{t('sailOn')}</Button>}
    >
      <ul>
        {found.map((d) => (
          <li key={d.id}>
            <p>{d.description[lang]}</p>
            {d.system && <p>{t('system', { name: content.systems.find((s) => s.id === d.system)?.name[lang] ?? d.system })}</p>}
          </li>
        ))}
      </ul>
    </ScreenFrame>
  );
}
