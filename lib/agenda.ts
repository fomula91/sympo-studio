import { BadRequest } from './db';

// 아젠다(sessions)·자료(documents) 쓰기의 입력 검증 (BE-14).
//
// 두 테이블은 편집 방식이 같다 — 운영자가 목록 전체를 늘어놓고 순서를 끌어
// 옮긴다. 그래서 API도 "목록을 통째로 보내면 서버가 그 상태로 맞춘다"는 한 벌
// (PUT)이고, 배열의 위치가 곧 sort_order다. 순서를 별도 필드로 받으면 클라이언트가
// 보낸 order 값과 배열 순서가 어긋나는 상태를 서버가 판정해야 한다.
//
// 상한은 무료 티어 보호가 아니라 입력 사고 방지가 목적이다 — 하루 행사의
// 아젠다가 60개를 넘을 일은 없고, 넘었다면 클라이언트 버그다.

export const MAX_SESSIONS = 60;
export const MAX_DOCUMENTS = 60;

const TITLE_MAX = 120;
const SPEAKER_MAX = 80;
const DOC_NAME_MAX = 160;
const TAG_MAX = 40;

/** 0001_init.sql의 sessions.kind 주석과 같은 목록. 화이트리스트 밖은 400. */
const SESSION_KINDS = ['OPENING', 'LECTURE', 'PANEL', 'QA', 'CASE', 'CLOSING'];

/** documents.status — 'ready'는 파일이 있는 상태다(BE-6). */
const DOCUMENT_STATUSES = ['pending', 'ready'];

/** 'HH:MM' 24시간. 자정 넘김(24:00)은 없다 — 다음 날짜의 행사다. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface SessionInput {
  /** 기존 행이면 id, 새 행이면 null. 이 구분이 곧 UPDATE/INSERT 분기다. */
  id: number | null;
  time: string | null;
  title: string;
  speaker: string | null;
  kind: string;
}

export interface DocumentInput {
  id: number | null;
  sessionId: number | null;
  displayName: string;
  tag: string | null;
  status: string;
}

function asObject(v: unknown, field: string): Record<string, unknown> {
  // JSON 리터럴 null은 파싱에 성공하고 typeof가 'object'다 — 둘 다 막는다.
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new BadRequest(`${field}는 객체여야 합니다.`);
  }
  return v as Record<string, unknown>;
}

function text(v: unknown, field: string, max: number, required: boolean): string | null {
  if (v === undefined || v === null || v === '') {
    if (required) throw new BadRequest(`${field}는 필수입니다.`);
    return null;
  }
  if (typeof v !== 'string') throw new BadRequest(`${field}는 문자열이어야 합니다.`);
  const trimmed = v.trim();
  if (required && trimmed.length === 0) throw new BadRequest(`${field}는 필수입니다.`);
  if (trimmed.length > max) throw new BadRequest(`${field}는 ${max}자 이하여야 합니다.`);
  return trimmed.length === 0 ? null : trimmed;
}

/** 행 id는 양의 정수이거나 없음(새 행). 0·음수·소수는 존재할 수 없는 id다. */
function rowId(v: unknown, field: string): number | null {
  if (v === undefined || v === null) return null;
  if (!Number.isInteger(v) || (v as number) <= 0) {
    throw new BadRequest(`${field}는 양의 정수여야 합니다.`);
  }
  return v as number;
}

function pickList(raw: unknown, key: string, max: number): unknown[] {
  // 최상위 본문만 문구를 따로 둔다 — `${field}는`으로 조립하면 '요청 본문는'이
  // 되고, 이 프로젝트는 error 문구를 화면에 그대로 노출한다(API-Guide-FE).
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequest('요청 본문은 JSON 객체여야 합니다.');
  }
  const list = (raw as Record<string, unknown>)[key];
  if (!Array.isArray(list)) throw new BadRequest(`${key}는 배열이어야 합니다.`);
  if (list.length > max) throw new BadRequest(`${key}는 ${max}개 이하여야 합니다.`);
  return list;
}

/**
 * 같은 id가 배열에 두 번 오면 거절한다.
 *
 * 그냥 두면 UPDATE가 두 번 실행돼 마지막 값이 이기고, 클라이언트는 자기가
 * 보낸 두 항목 중 하나가 사라진 것을 성공(200)으로 받는다 — 조용한 유실이다.
 */
function assertNoDuplicateIds(ids: (number | null)[], field: string): void {
  const seen = new Set<number>();
  for (const id of ids) {
    if (id === null) continue;
    if (seen.has(id)) throw new BadRequest(`${field}에 같은 id가 두 번 있습니다: ${id}`);
    seen.add(id);
  }
}

/** PUT /api/events/[id]/sessions 본문 → 정리된 아젠다 목록(배열 순서 = 표시 순서). */
export function validateSessionsBody(raw: unknown): SessionInput[] {
  const list = pickList(raw, 'sessions', MAX_SESSIONS);

  const items = list.map((entry, i) => {
    const o = asObject(entry, `sessions[${i}]`);
    const time = text(o.time, `sessions[${i}].time`, 5, false);
    if (time !== null && !TIME_PATTERN.test(time)) {
      throw new BadRequest(`sessions[${i}].time은 HH:MM 형식이어야 합니다.`);
    }
    const kind = text(o.kind, `sessions[${i}].kind`, 16, false) ?? 'LECTURE';
    if (!SESSION_KINDS.includes(kind)) {
      throw new BadRequest(`sessions[${i}].kind는 ${SESSION_KINDS.join('|')} 중 하나여야 합니다.`);
    }
    return {
      id: rowId(o.id, `sessions[${i}].id`),
      time,
      title: text(o.title, `sessions[${i}].title`, TITLE_MAX, true)!,
      speaker: text(o.speaker, `sessions[${i}].speaker`, SPEAKER_MAX, false),
      kind,
    };
  });

  assertNoDuplicateIds(
    items.map((s) => s.id),
    'sessions',
  );
  return items;
}

/** PUT /api/events/[id]/documents 본문 → 정리된 자료 목록. 파일 자체는 BE-6 소관. */
export function validateDocumentsBody(raw: unknown): DocumentInput[] {
  const list = pickList(raw, 'documents', MAX_DOCUMENTS);

  const items = list.map((entry, i) => {
    const o = asObject(entry, `documents[${i}]`);
    const id = rowId(o.id, `documents[${i}].id`);
    const status = text(o.status, `documents[${i}].status`, 16, false) ?? 'pending';
    if (!DOCUMENT_STATUSES.includes(status)) {
      throw new BadRequest(
        `documents[${i}].status는 ${DOCUMENT_STATUSES.join('|')} 중 하나여야 합니다.`,
      );
    }
    // 새 자료는 파일이 아직 없다(r2_key NULL) — 'ready'로 시작할 수 없다.
    // 이걸 막지 않으면 참가자 화면이 열 수 없는 자료를 "준비됨"으로 그린다.
    if (id === null && status === 'ready') {
      throw new BadRequest(
        `documents[${i}]: 새 자료는 pending으로만 만들 수 있습니다(파일 업로드는 BE-6).`,
      );
    }
    return {
      id,
      sessionId: rowId(o.sessionId, `documents[${i}].sessionId`),
      displayName: text(o.displayName, `documents[${i}].displayName`, DOC_NAME_MAX, true)!,
      tag: text(o.tag, `documents[${i}].tag`, TAG_MAX, false),
      status,
    };
  });

  assertNoDuplicateIds(
    items.map((d) => d.id),
    'documents',
  );
  return items;
}
