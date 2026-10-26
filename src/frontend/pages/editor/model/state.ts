import type { EventItem } from "@fe/entities/event";
import type { Preset } from "@fe/entities/theme";
import type { StatePatch } from '@fe/shared/lib/state/patch';
import type { Device, Section } from "@fe/shared/config/studio-state";
export interface StudioState {
  section: Section;
  events: EventItem[];
  customPresets: Preset[];
  dragOver: boolean;
  dragIdx: number;
  device: Device;
  saved: string;
  paneW: number;
}
export type PatchFn = StatePatch<StudioState>;
export type { Device, Section } from "@fe/shared/config/studio-state";
