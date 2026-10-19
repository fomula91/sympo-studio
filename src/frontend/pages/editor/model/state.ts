import type { EventItem } from "@fe/entities/event";
import type { Preset } from "@fe/entities/theme";
import type { StatePatch } from '@fe/shared/lib/state/patch';
export interface StudioState {
  section: 'basic' | 'agenda' | 'docs' | 'engage' | 'theme';
  events: EventItem[];
  customPresets: Preset[];
  dragOver: boolean;
  dragIdx: number;
  device: 'mobile' | 'tablet';
  saved: string;
  paneW: number;
}
export type PatchFn = StatePatch<StudioState>;
export type Section = StudioState['section'];
export type Device = StudioState['device'];
