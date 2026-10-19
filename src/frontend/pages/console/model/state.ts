import type { EventItem } from "@fe/entities/event";
import type { StatePatch } from '@fe/shared/lib/state/patch';
export interface StudioState {
  section: 'basic' | 'agenda' | 'docs' | 'engage' | 'theme';
  events: EventItem[];
  query: string;
  status: string;
  sort: '최신' | '행사일' | '이름';
  bulk: boolean;
  sel: number[];
}
export type PatchFn = StatePatch<StudioState>;
export type SortKey = StudioState['sort'];
