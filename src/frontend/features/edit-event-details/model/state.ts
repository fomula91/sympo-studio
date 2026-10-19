import type { EventItem } from "@fe/entities/event";
import type { StatePatch } from '@fe/shared/lib/state/patch';
export interface StudioState {
  events: EventItem[];
  saved: string;
}
export type PatchFn = StatePatch<StudioState>;
