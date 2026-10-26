import type { EventItem } from "@fe/entities/event";
import type { StatePatch } from '@fe/shared/lib/state/patch';
import type { Section, SortKey } from "@fe/shared/config/studio-state";
export interface StudioState {
  section: Section;
  events: EventItem[];
  query: string;
  status: string;
  sort: SortKey;
  bulk: boolean;
  sel: number[];
}
export type PatchFn = StatePatch<StudioState>;
export type { SortKey } from "@fe/shared/config/studio-state";
