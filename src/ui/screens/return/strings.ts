import { dict } from '../../i18n/t';

export const RETURN = dict({
  title: { ru: 'Сдача лодки', en: 'Handing the boat back' },
  onTime: { ru: 'Вернулись на базу в {time}.', en: 'Back at base at {time}.' },
  onTimeNoClock: { ru: 'Вернулись на базу к {time}.', en: 'Back at base by {time}.' },
  managerPleased: { ru: 'Базовый менеджер доволен.', en: 'The base manager is pleased.' },
  managerKept: { ru: 'Базовый менеджер осмотрел лодку и удержал из депозита {eur} €.', en: 'The base manager inspected the boat and kept €{eur} of the deposit.' },
  late: { ru: 'Опоздали к {time}. Штраф {eur} €.', en: 'Missed the {time} deadline. Fine: €{eur}.' },
  damages: { ru: 'Повреждения при сдаче', en: 'Damage at handover' },
  noDamage: { ru: 'Видимых повреждений нет.', en: 'No visible damage.' },
  handover: { ru: 'Сдать лодку', en: 'Hand over the boat' },
});
