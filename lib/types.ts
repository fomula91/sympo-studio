export type Screen = 'console' | 'editor' | 'viewer' | 'report';
export type Section = 'basic' | 'agenda' | 'docs' | 'engage' | 'theme';
export type Mode = 'light' | 'dark';
export type IconSetId = 'geo' | 'solid' | 'number';
export type Density = '컴팩트' | '기본' | '여유';
export type KvPattern = 'stripe' | 'grid' | 'flat' | 'none';
export type SortKey = '최신' | '행사일' | '이름';
export type Device = 'mobile' | 'tablet';

export interface EventItem {
  id: number;
  brand: string;
  venue: string;
  status: string;
  dateCode: string;
  slug: string;
  sessions: number;
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
  screen: Screen;
  section: Section;
  query: string;
  status: string;
  sort: SortKey;
  bulk: boolean;
  sel: number[];
  events: EventItem[];
  sessions: Session[];
  presetId: string;
  mode: Mode;
  iconSet: IconSetId;
  density: Density;
  keyVisual: string;
  kvPattern: KvPattern;
  dragOver: boolean;
  dragIdx: number;
  device: Device;
  title: string;
  venue: string;
  date: string;
  cap: string;
  host: string;
  engage: Engage;
  saved: string;
  paneW: number;
}

export type Patch = Partial<StudioState> | null;
export type PatchFn = (p: Patch | ((s: StudioState) => Patch)) => void;
