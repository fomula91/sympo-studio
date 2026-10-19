import type { Preset } from "@fe/entities/theme";
import type { StatePatch } from '@fe/shared/lib/state/patch';
export interface StudioState {
  customPresets: Preset[];
  dragOver: boolean;
  saved: string;
}
export type PatchFn = StatePatch<StudioState>;
