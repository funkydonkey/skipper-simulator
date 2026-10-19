import type { ComponentType } from 'react';
import type { Screen } from '../session/types';
import { BoatScreen } from './boat/BoatScreen';
import { BriefingScreen } from './briefing/BriefingScreen';
import { CaptainScreen } from './captain/CaptainScreen';
import { CheckinScreen } from './checkin/CheckinScreen';
import { DebriefScreen } from './debrief/DebriefScreen';
import { EveningScreen } from './evening/EveningScreen';
import { EventScreen } from './event/EventScreen';
import { OutcomeScreen } from './event/OutcomeScreen';
import { ManeuversScreen } from './maneuvers/ManeuversScreen';
import { MenuScreen } from './menu/MenuScreen';
import { MorningScreen } from './morning/MorningScreen';
import { PassageScreen } from './passage/PassageScreen';
import { PlanningScreen } from './planning/PlanningScreen';
import { ReturnScreen } from './return/ReturnScreen';

export const SCREENS: Readonly<Record<Screen, ComponentType>> = {
  menu: MenuScreen,
  captain: CaptainScreen,
  boat: BoatScreen,
  checkin: CheckinScreen,
  briefing: BriefingScreen,
  morning: MorningScreen,
  planning: PlanningScreen,
  maneuvers: ManeuversScreen,
  passage: PassageScreen,
  event: EventScreen,
  outcome: OutcomeScreen,
  evening: EveningScreen,
  return: ReturnScreen,
  debrief: DebriefScreen,
};
