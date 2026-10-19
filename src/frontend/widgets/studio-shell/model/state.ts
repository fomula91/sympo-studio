import type { EventItem } from "@fe/entities/event";
import type { StatePatch } from '@fe/shared/lib/state/patch';
import type { Section } from "@fe/shared/config/studio-state";
export interface StudioState {
  viewerOpen: boolean;
  section: Section;
  events: EventItem[];
  bulk: boolean;
  sel: number[];
  saved: string;
}
export type PatchFn = StatePatch<StudioState>;
export type { Section } from "@fe/shared/config/studio-state";
