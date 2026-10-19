import type { EventItem } from "@fe/entities/event";
import type { StatePatch } from '@fe/shared/lib/state/patch';
export interface StudioState {
  viewerOpen: boolean;
  section: 'basic' | 'agenda' | 'docs' | 'engage' | 'theme';
  events: EventItem[];
  bulk: boolean;
  sel: number[];
  saved: string;
}
export type PatchFn = StatePatch<StudioState>;
export type Section = StudioState['section'];
