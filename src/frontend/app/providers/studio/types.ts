import type { Preset } from "@fe/entities/theme";
import type { EventItem } from "@fe/entities/event";
import type { Device, Section, SortKey } from "@fe/shared/config/studio-state";

export type { Device, Section, SortKey } from "@fe/shared/config/studio-state";

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
