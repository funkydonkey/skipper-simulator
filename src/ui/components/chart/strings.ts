import type { LocalizedText, RouteFeature } from '../../../engine';
import { dict } from '../../i18n/t';

export const CHART = dict({
  title: { ru: 'Морская карта архипелага', en: 'Chart of the archipelago' },
  you: { ru: 'Вы здесь', en: 'You are here' },
});

export const FEATURE_NAMES: Readonly<Record<RouteFeature, LocalizedText>> = {
  strait: { ru: 'пролив', en: 'strait' },
  cape: { ru: 'мыс', en: 'cape' },
  gulf: { ru: 'залив', en: 'gulf' },
  open: { ru: 'открытая вода', en: 'open water' },
};
