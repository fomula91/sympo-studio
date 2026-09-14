export interface Preset {
  id: string;
  label: string;
  h: number;
  c: number;
}

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

/** 참가자 공개 페이지가 GET /api/public/[slug]에서 받는 자료 하나. */
export interface DocumentInfo {
  id: number;
  name: string;
  status: string; // 'pending'이면 아직 준비 중
  pages: number | null;
  // 파일이 붙은 자료만 값이 있다(서명 URL, 10분 TTL) — 스튜디오 미리보기의
  // DEMO_DOCUMENTS는 실제 파일이 없으므로 null.
  url: string | null;
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
  customPresets: Preset[];
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
