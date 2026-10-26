import type { Mode, IconSetId, Density, KvPattern } from '@fe/shared/lib/theme/options';

export interface EventDetail {
  title: string;
  brand: string;
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
  documents: StudioDocument[];
}

export interface EventItem extends EventDetail {
  id: number;
  status: string;
  dateCode: string;
  slug: string;
  // 게스트가 로컬에서 만든 이벤트에만 있다(FE-15) — 로그인 시 가져오기(FE-39)가
  // 이 값으로 멱등성을 잡는다. 서버 이벤트는 없음(undefined).
  localRef?: string;
  // 목록 조회(GET /api/events)로만 받은 서버 이벤트에만 있다(BE-36) — 목록엔 세션·자료
  // 배열이 없어 개수만 따로 온다. 상세를 불러오면 배열이 채워지고 이 값은 지운다
  // (남겨 두면 그 뒤 편집으로 바뀐 배열과 어긋난다). 화면은 `?? 배열.length`로 읽는다.
  sessionCount?: number;
  documentCount?: number;
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
  // 이전 캐시·데모에는 없을 수 있다. API는 null 또는 바이트 수를 반환한다.
  sizeBytes?: number | null;
  // 파일이 붙은 자료만 값이 있다(서명 URL, 10분 TTL) — 스튜디오 미리보기의
  // DEMO_DOCUMENTS는 실제 파일이 없으므로 null.
  url: string | null;
}

/**
 * 에디터의 "자료" 섹션이 다루는 자료 한 건 — GET /api/events/[id]의 documents 응답과
 * 1:1(FE-25). 참가자용 `DocumentInfo`와 필드가 다르다(운영자는 tag·세션 배정·업로드
 * 상태를 봐야 하고, 서명 URL은 스튜디오에 아예 없다 — 발급은 참가자 경로 전용이다).
 */
export interface StudioDocument {
  id: number;
  sessionId: number | null;
  displayName: string;
  tag: string | null;
  status: string; // 'pending' | 'ready'
  hasFile: boolean;
  contentType: string | null;
  sizeBytes: number | null;
  pageCount: number | null;
  uploadedAt: string | null;
}

export type PatchEvent = Partial<EventDetail> | null;

export type PatchEventFn = (p: PatchEvent | ((ev: EventItem) => PatchEvent)) => void;
