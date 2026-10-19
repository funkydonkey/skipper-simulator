import { dict } from '../../i18n/t';

export const RETURN = dict({
  title: { ru: 'Сдача лодки', en: 'Handing the boat back' },
  onTime: { ru: 'Вернулись на базу к {time}. Базовый менеджер доволен.', en: 'Back at base by {time}. The base manager is pleased.' },
  late: { ru: 'Опоздали к {time}. Штраф {eur} €.', en: 'Missed the {time} deadline. Fine: €{eur}.' },
  damages: { ru: 'Повреждения при сдаче', en: 'Damage at handover' },
  noDamage: { ru: 'Видимых повреждений нет.', en: 'No visible damage.' },
  handover: { ru: 'Сдать лодку', en: 'Hand over the boat' },
});
