import type { Preset } from '@fe/entities/theme/model/types';
import type { EventItem } from '@fe/entities/event/model/types';

export type Section = 'basic' | 'agenda' | 'docs' | 'engage' | 'theme';

export type SortKey = '최신' | '행사일' | '이름';

export type Device = 'mobile' | 'tablet';

export interface StudioState {
  viewerOpen: boolean;
  section: Section;
  query: string;
  status: string;
  sort: SortKey;
  bulk: boolean;
  sel: number[];
  events: EventItem[];
  customPresets: Preset[];
  dragOver: boolean;
  dragIdx: number;
  device: Device;
  saved: string;
  paneW: number;
}

export type Patch = Partial<StudioState> | null;

export type PatchFn = (p: Patch | ((s: StudioState) => Patch)) => void;
