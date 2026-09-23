// FE-30 — 스튜디오(운영자 화면)가 실제 D1 이벤트를 읽고 쓰기 위한 클라이언트 헬퍼.
// 참가자용 클라이언트(lib/api.ts)와 분리한다 — 인증·용도가 다르다.
import { ApiClientError, fetchWithTimeout } from '@/lib/api';
import type { AuthUser, EventDetail, EventItem, Session, StudioDocument } from '@/lib/types';

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
    keyVisual: string | null;
    kvPattern: string;
  };
  engage: { qa: boolean; survey: boolean; chat: boolean; cert: boolean };
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

function dtoToEventItem(dto: EventDTO): EventItem {
  const dateCode = dto.date ? dto.date.replace(/-/g, '').slice(2) : '';
  const sessions: Session[] = (dto.sessions ?? []).map((s) => ({
    id: s.id,
    time: s.time ?? '',
    title: s.title,
    speaker: s.speaker ?? '',
    kind: s.kind,
  }));
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
  // blob: URL은 이 브라우저 탭에서만 유효하다 — 그대로 저장하면 참가자 브라우저에서는
  // 절대 안 열리고 새로고침만 해도 깨진다(FE-19). 실제 업로드(R2)가 붙기 전까지는
  // 지우는 것(빈 문자열)만 서버에 보내고 blob: 값 자체는 동기화에서 뺀다.
  if (delta.keyVisual !== undefined && !delta.keyVisual.startsWith('blob:')) {
    body.keyVisual = delta.keyVisual;
  }
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
 * GET /api/events — 로그인한 사용자의 이벤트 목록(FE-15). 세션 배열은 없다(EventDTO
 * 참조) — 콘솔 카드는 개수만 보여주므로 열 때(FE-30의 단건 조회)만 채워지면 된다.
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
