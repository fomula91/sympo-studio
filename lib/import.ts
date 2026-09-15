import { validateSessionsBody, MAX_SESSIONS, type SessionInput } from './agenda';
import { BadRequest } from './db';
import { isEventStatus, statusBadRequestMessage } from './status';

/**
 * 게스트 워크스페이스 가져오기의 입력 검증 (BE-15).
 *
 * 이벤트 + 테마 + 아젠다를 **묶어서** 받는다. 이벤트마다 `POST` → 테마 `PATCH` →
 * 아젠다 N회를 돌리면 왕복이 수십 회로 늘고, 중간에 끊기면 **테마 없는 이벤트·
 * 아젠다 없는 이벤트 같은 반쪽 상태**가 서버에 남으며, 재시도가 중복을 만든다.
 */

/** 한 번에 가져올 수 있는 이벤트 수. 계정당 총량(20)보다 클 이유가 없다. */
export const MAX_IMPORT_EVENTS = 20;

const CLIENT_REF_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * slug 형식 (`autoSlug`가 만드는 모양과 같다).
 *
 * **길이만 보면 안 된다** (`/code-review` 발견). 이 값은 두 곳으로 흘러간다 —
 * ① 충돌 후보를 훑는 `slug LIKE '<slug>%'` 패턴, ② `events.slug`, 즉 **공개 URL의
 * 경로 조각**이다. `%`나 `_`를 넣으면 ①이 와일드카드가 되어 사실상 전수 조회가 되고,
 * 공백·슬래시가 들어가면 ②가 **열 수 없는 주소**가 된다 — `PATCH`는 slug를 일부러
 * 바꿔 주지 않으므로(공유된 링크가 깨진다) 운영자에게 고칠 방법이 없다.
 */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

export interface ImportTheme {
  presetId: string | null;
  mode: string | null;
  iconSet: string | null;
  density: string | null;
  keyVisual: string | null;
  kvPattern: string | null;
}

export interface ImportEvent {
  clientRef: string;
  brand: string;
  title: string;
  venue: string | null;
  date: string | null;
  host: string | null;
  capacity: number | null;
  status: string;
  slug: string | null;
  theme: ImportTheme;
  sessions: SessionInput[];
}

function slugOrNull(v: string | null, i: number): string | null {
  if (v === null) return null;
  if (!SLUG_PATTERN.test(v)) {
    throw new BadRequest(`events[${i}].slug는 소문자·숫자·하이픈 80자 이내여야 합니다.`);
  }
  return v;
}

function obj(v: unknown, field: string): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new BadRequest(`${field}는 객체여야 합니다.`);
  }
  return v as Record<string, unknown>;
}

function str(v: unknown, field: string, max: number, required = false): string | null {
  if (v === undefined || v === null || v === '') {
    if (required) throw new BadRequest(`${field}는 필수입니다.`);
    return null;
  }
  if (typeof v !== 'string') throw new BadRequest(`${field}는 문자열이어야 합니다.`);
  const t = v.trim();
  if (t.length > max) throw new BadRequest(`${field}는 ${max}자 이하여야 합니다.`);
  return t;
}

/**
 * 본문 → 가져올 이벤트 목록.
 *
 * **아젠다 검증은 BE-14의 것을 그대로 쓴다**(`validateSessionsBody`) — 같은 데이터를
 * 두 경로가 각자 검증하면 한쪽만 느슨해지는 날이 온다. 다만 여기 오는 세션은 전부
 * 신규라, 로컬 워크스페이스가 실어 보낸 `id`는 **서버의 id가 아니므로 버린다.**
 */
export function validateImportBody(raw: unknown): ImportEvent[] {
  const root = obj(raw, '요청 본문');
  const list = root.events;
  if (!Array.isArray(list)) throw new BadRequest('events는 배열이어야 합니다.');
  if (list.length === 0) throw new BadRequest('가져올 이벤트가 없습니다.');
  if (list.length > MAX_IMPORT_EVENTS) {
    throw new BadRequest(`한 번에 가져올 수 있는 이벤트는 ${MAX_IMPORT_EVENTS}개까지입니다.`);
  }

  const seen = new Set<string>();
  return list.map((entry, i) => {
    const o = obj(entry, `events[${i}]`);

    const clientRef = str(o.clientRef, `events[${i}].clientRef`, 64, true)!;
    if (!CLIENT_REF_PATTERN.test(clientRef)) {
      throw new BadRequest(`events[${i}].clientRef는 영숫자·_·- 8~64자여야 합니다.`);
    }
    // 같은 요청 안의 중복은 **여기서** 막는다. DB의 UNIQUE에 맡기면 두 번째 항목이
    // "이미 있음"으로 조용히 넘어가 사용자는 둘 다 올라갔다고 믿는다.
    if (seen.has(clientRef)) throw new BadRequest(`clientRef가 중복됩니다: ${clientRef}`);
    seen.add(clientRef);

    const status = str(o.status, `events[${i}].status`, 16) ?? '초안';
    if (!isEventStatus(status)) throw new BadRequest(statusBadRequestMessage());

    const date = str(o.date, `events[${i}].date`, 10);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequest(`events[${i}].date는 YYYY-MM-DD 형식이어야 합니다.`);
    }

    let capacity: number | null = null;
    if (o.capacity !== undefined && o.capacity !== null) {
      if (typeof o.capacity !== 'number' || o.capacity < 0) {
        throw new BadRequest(`events[${i}].capacity는 0 이상의 숫자여야 합니다.`);
      }
      capacity = o.capacity;
    }

    const t = o.theme === undefined || o.theme === null ? {} : obj(o.theme, `events[${i}].theme`);
    const theme: ImportTheme = {
      presetId: str(t.presetId, `events[${i}].theme.presetId`, 40),
      mode: str(t.mode, `events[${i}].theme.mode`, 16),
      iconSet: str(t.iconSet, `events[${i}].theme.iconSet`, 16),
      density: str(t.density, `events[${i}].theme.density`, 16),
      // 게스트 워크스페이스의 키비주얼은 `blob:` URL일 수 있다(FE-19) — 그건 그
      // 브라우저에서만 유효하므로 서버에 올려 봐야 죽은 값이다. 길이만 막고
      // 그대로 받아 두되, 실제 이미지 이관은 FE-19의 몫이다.
      keyVisual: str(t.keyVisual, `events[${i}].theme.keyVisual`, 2000),
      kvPattern: str(t.kvPattern, `events[${i}].theme.kvPattern`, 16),
    };

    const rawSessions = o.sessions === undefined || o.sessions === null ? [] : o.sessions;
    if (!Array.isArray(rawSessions)) {
      throw new BadRequest(`events[${i}].sessions는 배열이어야 합니다.`);
    }
    if (rawSessions.length > MAX_SESSIONS) {
      throw new BadRequest(`events[${i}].sessions는 ${MAX_SESSIONS}개까지입니다.`);
    }
    // 로컬 id를 그대로 넘기면 BE-14의 검증이 "이 이벤트의 세션이 아니다"로 막는다.
    // 가져오기의 세션은 전부 신규라 id를 비우고 통과시킨다.
    const sessions = validateSessionsBody({
      sessions: rawSessions.map((s) => ({ ...obj(s, `events[${i}].sessions[]`), id: null })),
    });

    return {
      clientRef,
      brand: str(o.brand, `events[${i}].brand`, 80, true)!,
      title: str(o.title, `events[${i}].title`, 120, true)!,
      venue: str(o.venue, `events[${i}].venue`, 120),
      date,
      host: str(o.host, `events[${i}].host`, 80),
      capacity,
      status,
      slug: slugOrNull(str(o.slug, `events[${i}].slug`, 80), i),
      theme,
      sessions,
    };
  });
}
