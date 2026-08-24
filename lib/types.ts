export type Section = 'basic' | 'agenda' | 'docs' | 'engage' | 'theme';
export type Mode = 'light' | 'dark';
export type IconSetId = 'geo' | 'solid' | 'number';
export type Density = '컴팩트' | '기본' | '여유';
export type KvPattern = 'stripe' | 'grid' | 'flat' | 'none';
export type SortKey = '최신' | '행사일' | '이름';
export type Device = 'mobile' | 'tablet';

export interface EventDetail {
  title: string;
  venue: string;
  date: string;
  host: string;
  cap: string;
  engage: Engage;
  presetId: string;
  mode: Mode;
  iconSet: IconSetId;
  density: Density;
  keyVisual: string;
  kvPattern: KvPattern;
  sessions: Session[];
}

export interface EventItem extends EventDetail {
  id: number;
  brand: string;
  status: string;
  dateCode: string;
  slug: string;
  docs: number;
}

export interface Session {
  id: number;
  time: string;
  title: string;
  speaker: string;
  kind: string;
}

export interface Engage {
  qa: boolean;
  survey: boolean;
  chat: boolean;
  cert: boolean;
}

export interface EventInfo {
  title: string;
  venue: string;
  date: string;
  host: string;
  cap?: string;
  engage: Engage;
  brandLabel?: string;
}

export interface StudioState {
  viewerOpen: boolean;
  section: Section;
  query: string;
  status: string;
  sort: SortKey;
  bulk: boolean;
  sel: number[];
  events: EventItem[];
  editingId: number | null;
  dragOver: boolean;
  dragIdx: number;
  device: Device;
  saved: string;
  paneW: number;
}

export type Patch = Partial<StudioState> | null;
export type PatchFn = (p: Patch | ((s: StudioState) => Patch)) => void;

export type PatchEvent = Partial<EventDetail> | null;
export type PatchEventFn = (p: PatchEvent | ((ev: EventItem) => PatchEvent)) => void;
