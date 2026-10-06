// FE-30 — 스튜디오(운영자 화면)가 실제 D1 이벤트를 읽고 쓰기 위한 클라이언트 헬퍼.
// 참가자용 클라이언트(lib/api.ts)와 분리한다 — 인증·용도가 다르다.
import { ApiClientError, fetchWithTimeout } from '@/lib/api';
import type { AuthUser, EventDetail, EventItem, Preset, Session, StudioDocument } from '@/lib/types';

/** 한 번에 가져올 수 있는 이벤트 수(POST /api/events/import, `lib/import.ts`의 `MAX_IMPORT_EVENTS`와
 * 같은 값). 그 모듈을 그대로 import하지 않는다 — 서버 전용 `lib/db.ts`를 끌어와 클라이언트
 * 번들에 들어간다(`lib/event-limits.ts`가 상수만 분리해 둔 것과 같은 이유). */
export const IMPORT_BATCH_SIZE = 20;

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || `요청이 실패했습니다 (${res.status})`;
  } catch {
    return `요청이 실패했습니다 (${res.status})`;
  }
}

interface EventDTO {
  id: number;
  slug: string;
  brand: string;
  title: string;
  venue: string | null;
  date: string | null;
  host: string | null;
  capacity: number | null;
  status: string;
  theme: {
    presetId: string | null;
    mode: string;
    iconSet: string;
    density: string;
    // 목록 응답엔 원문 대신 유무만 온다(BE-36) — base64라 이벤트마다 최대 약 1.5MB다.
    keyVisual?: string | null;
    hasKeyVisual?: boolean;
    kvPattern: string;
  };
  engage: { qa: boolean; survey: boolean; chat: boolean; cert: boolean };
  // 목록 응답만 싣는다(BE-36) — 목록엔 sessions·documents 배열이 없어서다.
  sessionCount?: number;
  documentCount?: number;
  // 단건 조회(GET /api/events/[id])만 세션·자료를 함께 싣는다 — 목록·생성 응답엔 없다.
  sessions?: { id: number; time: string | null; title: string; speaker: string | null; kind: string }[];
  documents?: {
    id: number;
    sessionId: number | null;
    displayName: string;
    tag: string | null;
    status: string;
    hasFile: boolean;
    contentType: string | null;
    sizeBytes: number | null;
    pageCount: number | null;
    uploadedAt: string | null;
  }[];
}

function toClientDocuments(dtoDocuments: EventDTO['documents']): StudioDocument[] {
  return (dtoDocuments ?? []).map((d) => ({
    id: d.id,
    sessionId: d.sessionId,
    displayName: d.displayName,
    tag: d.tag,
    status: d.status,
    hasFile: d.hasFile,
    contentType: d.contentType,
    sizeBytes: d.sizeBytes,
    pageCount: d.pageCount,
    uploadedAt: d.uploadedAt,
  }));
}

function toClientSessions(dtoSessions: EventDTO['sessions']): Session[] {
  return (dtoSessions ?? []).map((s) => ({
    id: s.id,
    time: s.time ?? '',
    title: s.title,
    speaker: s.speaker ?? '',
    kind: s.kind,
  }));
}

function dtoToEventItem(dto: EventDTO): EventItem {
  const dateCode = dto.date ? dto.date.replace(/-/g, '').slice(2) : '';
  const sessions: Session[] = toClientSessions(dto.sessions);
  const documents = toClientDocuments(dto.documents);
  return {
    id: dto.id,
    brand: dto.brand,
    status: dto.status,
    dateCode,
    slug: dto.slug,
    title: dto.title,
    venue: dto.venue ?? '',
    date: dto.date ?? '',
    host: dto.host ?? '',
    cap: dto.capacity != null ? String(dto.capacity) : '',
    engage: dto.engage,
    presetId: dto.theme.presetId ?? '',
    mode: dto.theme.mode as EventItem['mode'],
    iconSet: dto.theme.iconSet as EventItem['iconSet'],
    density: dto.theme.density as EventItem['density'],
    keyVisual: dto.theme.keyVisual ?? '',
    kvPattern: dto.theme.kvPattern as EventItem['kvPattern'],
    sessions,
    documents,
    sessionCount: dto.sessionCount,
    documentCount: dto.documentCount,
  };
}

/** GET /api/events/[id] — 실제 D1 이벤트를 읽어 스튜디오가 쓰는 EventItem 모양으로 변환한다. */
export async function fetchStudioEvent(id: number): Promise<EventItem> {
  const res = await fetchWithTimeout(`/api/events/${id}`, { cache: 'no-store' });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  const dto = (await res.json()) as EventDTO;
  return dtoToEventItem(dto);
}

/**
 * EventDetail의 부분 수정 → PATCH /api/events/[id]가 받는 필드 이름으로 변환.
 * `null`이면 보낼 필드가 없다는 뜻 — 호출자가 이걸로 "서버에 보낼 게 있는지"를
 * 미리 판단할 수 있다(예: 아젠다만 바뀐 델타로 "저장 중" 표시를 띄우지 않기 위해).
 */
export function detailPatchToBody(delta: Partial<EventDetail>): Record<string, unknown> | null {
  const body: Record<string, unknown> = {};
  if (delta.title !== undefined) body.title = delta.title;
  if (delta.brand !== undefined) body.brand = delta.brand;
  if (delta.venue !== undefined) body.venue = delta.venue;
  if (delta.date !== undefined) body.date = delta.date;
  if (delta.host !== undefined) body.host = delta.host;
  if (delta.cap !== undefined) {
    const n = delta.cap === '' ? null : Number(delta.cap);
    body.capacity = n != null && Number.isNaN(n) ? null : n;
  }
  if (delta.presetId !== undefined) body.presetId = delta.presetId;
  if (delta.mode !== undefined) body.mode = delta.mode;
  if (delta.iconSet !== undefined) body.iconSet = delta.iconSet;
  if (delta.density !== undefined) body.density = delta.density;
  // base64 data URL(FE-19) 또는 빈 문자열(비움) — 둘 다 그대로 서버에 보낸다.
  if (delta.keyVisual !== undefined) body.keyVisual = delta.keyVisual;
  if (delta.kvPattern !== undefined) body.kvPattern = delta.kvPattern;
  if (delta.engage !== undefined) body.engage = delta.engage;
  // sessions·documents는 여기서 다루지 않는다 — 아젠다·자료 쓰기는 각각
  // PUT /api/events/[id]/sessions · PUT /api/events/[id]/documents로 별도
  // diff 계약(배열 전체 교체, id 기준)을 쓴다.
  return Object.keys(body).length ? body : null;
}

/**
 * PATCH /api/events/[id] — EventDetail 부분 수정을 서버에 반영한다.
 * `sessions`만 바뀐 델타는 보낼 게 없어(null) 아무 요청도 하지 않는다.
 */
export async function patchStudioEvent(id: number, delta: Partial<EventDetail>): Promise<void> {
  const body = detailPatchToBody(delta);
  if (!body) return;
  const res = await fetchWithTimeout(`/api/events/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
}

/**
 * PUT /api/events/[id]/documents — 자료 메타 목록 전체를 서버 상태로 맞춘다(FE-25).
 * `id`가 `null`이면 새 행으로 INSERT된다(status는 항상 'pending'으로 시작 — 파일이
 * 없으니까). 파일 자체는 다루지 않는다 — 업로드는 `uploadStudioDocument`가 별도로
 * 처리한다. 응답의 확정된 목록(전부 실제 id)을 그대로 돌려준다.
 */
export async function putStudioEventDocuments(
  id: number,
  documents: { id: number | null; sessionId: number | null; displayName: string; tag: string | null }[],
): Promise<StudioDocument[]> {
  const res = await fetchWithTimeout(`/api/events/${id}/documents`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents }),
  });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  const data = (await res.json()) as { documents: EventDTO['documents'] };
  return toClientDocuments(data.documents);
}

/**
 * PUT /api/events/[id]/documents/[docId]/upload — 자료 행에 실제 파일을 붙인다(BE-6).
 * 본문은 파일 바이트 그대로다(멀티파트 아님) — 서버가 `Content-Length`를 요구하므로
 * `fetch`에 `File`을 그대로 넘겨 자동으로 채워지게 한다.
 *
 * **`fetchWithTimeout`을 안 쓴다** — 그 8초는 작은 JSON 요청 기준이다. 현장 업로드가
 * 이 기능의 전제인데(태블릿·행사장 와이파이, `field-experience.md`) 20MB 파일이 느린
 * 회선에서 8초를 넘기는 건 흔한 일이다. 여기서는 브라우저의 기본 타임아웃(사실상
 * 없음)에 맡긴다 — 진짜 끊긴 연결은 fetch 자체가 결국 에러로 끝낸다.
 */
export async function uploadStudioDocument(
  eventId: number,
  documentId: number,
  file: File,
): Promise<{ status: string; sizeBytes: number }> {
  const res = await fetch(`/api/events/${eventId}/documents/${documentId}/upload`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  return (await res.json()) as { status: string; sizeBytes: number };
}

/**
 * PUT /api/events/[id]/sessions — 아젠다 목록 전체를 서버 상태로 맞춘다(FE-24 ③).
 * `id`가 `null`이면 새 행으로 INSERT된다 — 로컬에서 `Date.now()`로 임시 배정한
 * id는 호출자가 미리 걸러 `null`로 보내야 한다(서버가 실제 DB id를 새로 발급).
 * 응답의 확정된 목록(전부 실제 id)을 그대로 돌려준다 — 다음 저장에서 UPDATE로
 * 가려면 이 id를 알아야 한다.
 */
export async function putStudioEventSessions(
  id: number,
  sessions: { id: number | null; time: string | null; title: string; speaker: string | null; kind: string }[],
): Promise<Session[]> {
  const res = await fetchWithTimeout(`/api/events/${id}/sessions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessions }),
  });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  const data = (await res.json()) as { sessions: EventDTO['sessions'] };
  return toClientSessions(data.sessions);
}

/**
 * PATCH /api/events/[id] — 발행 상태만 즉시 바꾼다(FE-23·24).
 * `status`는 `EventDetail`에 없어 `patchStudioEvent`의 델타 경로(디바운스)를 안 탄다 —
 * 공개·비공개·보관 전환은 사람이 버튼을 누른 순간 바로 서버에 반영돼야 한다.
 */
export async function patchStudioEventStatus(id: number, status: string): Promise<void> {
  const res = await fetchWithTimeout(`/api/events/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
}

/**
 * DELETE /api/events/[id] — 이벤트를 영구히 지운다. 서버가 세션·자료·질문·설문응답·
 * 로그를 FK의 ON DELETE CASCADE로 함께 지운다(백엔드는 이미 구현돼 있었는데
 * 호출하는 클라이언트 함수·화면이 없었다 — 사용자가 테스트 이벤트를 지우려다 발견).
 */
export async function deleteStudioEvent(id: number): Promise<void> {
  const res = await fetchWithTimeout(`/api/events/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
}

/**
 * GET /api/auth/me — 현재 로그인 사용자(FE-15). 비로그인은 200 + `user: null`이라
 * 예외를 던지지 않는다(ADR 0007) — 게스트가 정상 상태다.
 */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const res = await fetchWithTimeout('/api/auth/me', { cache: 'no-store' });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  const data = (await res.json()) as { user: AuthUser | null };
  return data.user;
}

/** POST /api/auth/logout — 세션을 지운다(FE-15). */
export async function logoutStudioUser(): Promise<void> {
  const res = await fetchWithTimeout('/api/auth/logout', { method: 'POST' });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
}

/**
 * GET /api/events — 로그인한 사용자의 이벤트 목록(FE-15). 세션·자료 배열과 키 비주얼
 * 원문은 없다(BE-36) — 콘솔 카드는 개수(`sessionCount`·`documentCount`)만 보여주고,
 * 배열·원문은 열 때(FE-30의 단건 조회) 채워진다. 그래서 여기서 온 `keyVisual`은 빈 값이다.
 */
export async function fetchStudioEvents(): Promise<EventItem[]> {
  const res = await fetchWithTimeout('/api/events', { cache: 'no-store' });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  const data = (await res.json()) as { events: EventDTO[] };
  return data.events.map(dtoToEventItem);
}

/**
 * POST /api/events — 이벤트를 실제로 만든다(FE-15). 로그인 필수(서버가 401로 거절) —
 * 게스트의 "새 이벤트"는 이 함수를 부르지 않고 로컬에만 만든다.
 */
export async function createStudioEvent(input: {
  brand: string;
  title: string;
  venue?: string;
  date?: string;
  host?: string;
}): Promise<EventItem> {
  const res = await fetchWithTimeout('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  const dto = (await res.json()) as EventDTO;
  return dtoToEventItem(dto);
}

interface PresetDTO {
  id: string;
  label: string;
  h: number;
  c: number;
  origin: string;
}

/**
 * GET /api/presets — 로그인한 사용자가 볼 수 있는 프리셋(내장 + 본인 추출본, BE-25).
 * 내장 5종은 `lib/theme.ts`의 `PRESETS` 상수로 이미 있으니 `origin: 'extracted'`만
 * 골라 `customPresets`에 합친다(FE-40).
 */
export async function fetchStudioPresets(): Promise<Preset[]> {
  const res = await fetchWithTimeout('/api/presets', { cache: 'no-store' });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  const data = (await res.json()) as { presets: PresetDTO[] };
  return data.presets.filter((p) => p.origin === 'extracted').map((p) => ({ id: p.id, label: p.label, h: p.h, c: p.c }));
}

/**
 * POST /api/presets — 이미지에서 추출한 브랜드 프리셋을 실제로 저장한다(FE-40).
 * 로그인 필수(401) — 게스트는 이 함수를 부르지 않고 로컬에만 둔다.
 */
export async function createStudioPreset(input: {
  id: string;
  label: string;
  hue: number;
  chroma: number;
}): Promise<Preset> {
  const res = await fetchWithTimeout('/api/presets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, sourceKey: null }),
  });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  const dto = (await res.json()) as PresetDTO;
  return { id: dto.id, label: dto.label, h: dto.h, c: dto.c };
}

export interface ImportEventInput {
  clientRef: string;
  brand: string;
  title: string;
  venue: string | null;
  date: string | null;
  host: string | null;
  capacity: number | null;
  status: string;
  slug: string | null;
  theme: {
    presetId: string | null;
    mode: string;
    iconSet: string;
    density: string;
    keyVisual: string | null;
    kvPattern: string;
  };
  // 참여 설정 — 서버가 엄격한 boolean으로 받아 그대로 저장한다(BE-40). 빠뜨리면
  // 가져온 이벤트의 Q&A·설문·수료증이 전부 꺼진 채 들어간다.
  engage: { qa: boolean; survey: boolean; chat: boolean; cert: boolean };
  sessions: { time: string | null; title: string; speaker: string | null; kind: string }[];
}

export interface ImportResultDTO {
  clientRef: string;
  status: 'created' | 'exists' | 'failed';
  id?: number;
  slug?: string;
  slugChanged?: boolean;
  presetDropped?: boolean;
  error?: string;
}

/**
 * 게스트 로컬 이벤트(`localRef` 있음) → POST /api/events/import 본문(FE-39).
 *
 * **키 비주얼은 보내지 않는다** — `lib/import.ts`의 `theme.keyVisual` 검증 상한이
 * 2000자라, FE-19 이후의 실제 base64 이미지(몇백KB~1MB대)는 애초에 통과하지 못한다.
 * `localStorage` 용량 판단: 이미지를 가져오기에 실어 보내는 대신 **제외**하고,
 * 로그인 후 다시 올리게 한다 — 참조(서버가 모르는 blob URL)나 IndexedDB 경유는
 * 이 특수 문자뿐인 좁은 입력에 비해 과하다.
 */
export function toImportBody(e: EventItem): ImportEventInput {
  const capNum = e.cap === '' ? null : Number(e.cap);
  return {
    clientRef: e.localRef!,
    brand: e.brand,
    title: e.title,
    venue: e.venue || null,
    date: e.date || null,
    host: e.host || null,
    capacity: capNum != null && !Number.isNaN(capNum) ? capNum : null,
    status: e.status,
    slug: e.slug || null,
    theme: {
      presetId: e.presetId || null,
      mode: e.mode,
      iconSet: e.iconSet,
      density: e.density,
      keyVisual: null,
      kvPattern: e.kvPattern,
    },
    engage: e.engage,
    sessions: e.sessions.map((s) => ({
      time: s.time || null,
      title: s.title,
      speaker: s.speaker || null,
      kind: s.kind,
    })),
  };
}

/**
 * POST /api/events/import — 게스트 워크스페이스를 계정으로 가져온다(FE-39, BE-15).
 * 호출자가 `IMPORT_BATCH_SIZE` 이하로 나눠 보낸다 — 서버가 한 번에 받는 상한이다.
 */
export async function importGuestEvents(events: ImportEventInput[]): Promise<ImportResultDTO[]> {
  const res = await fetchWithTimeout('/api/events/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  const data = (await res.json()) as { results: ImportResultDTO[] };
  return data.results;
}
