import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * D1 바인딩을 꺼낸다.
 *
 * `next dev`에서도 동작하려면 next.config.ts의 initOpenNextCloudflareForDev()가
 * 호출돼 있어야 한다. async: true를 쓰는 이유도 그것 — dev에서는 바인딩이
 * 비동기로 준비된다.
 */
export async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  const db = env.DB;
  if (!db) {
    throw new Error(
      'D1 바인딩(DB)을 찾을 수 없습니다. wrangler.jsonc의 d1_databases와 ' +
        'next.config.ts의 initOpenNextCloudflareForDev() 호출을 확인하세요.',
    );
  }
  return db;
}

/** events 테이블의 행. 컬럼명은 스키마와 1:1이다. */
export interface EventRow {
  id: number;
  slug: string;
  brand: string;
  title: string;
  venue: string | null;
  event_date: string | null;
  host: string | null;
  capacity: number | null;
  status: string;
  preset_id: string | null;
  mode: string;
  icon_set: string;
  density: string;
  key_visual: string | null;
  kv_pattern: string;
  engage_qa: number;
  engage_survey: number;
  engage_chat: number;
  engage_cert: number;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: number;
  event_id: number;
  sort_order: number;
  start_time: string | null;
  title: string;
  speaker: string | null;
  kind: string;
  created_at: string;
}

/** API 응답 형태. SQLite의 0/1을 boolean으로 되돌린다. */
export interface EventDTO {
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
  createdAt: string;
  updatedAt: string;
}

export function toEventDTO(row: EventRow): EventDTO {
  return {
    id: row.id,
    slug: row.slug,
    brand: row.brand,
    title: row.title,
    venue: row.venue,
    date: row.event_date,
    host: row.host,
    capacity: row.capacity,
    status: row.status,
    theme: {
      presetId: row.preset_id,
      mode: row.mode,
      iconSet: row.icon_set,
      density: row.density,
      keyVisual: row.key_visual,
      kvPattern: row.kv_pattern,
    },
    engage: {
      qa: !!row.engage_qa,
      survey: !!row.engage_survey,
      chat: !!row.engage_chat,
      cert: !!row.engage_cert,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toSessionDTO(row: SessionRow) {
  return {
    id: row.id,
    order: row.sort_order,
    time: row.start_time,
    title: row.title,
    speaker: row.speaker,
    kind: row.kind,
  };
}

/**
 * slug 중복을 피해 확정한다.
 *
 * slug UNIQUE는 이 스키마의 핵심 제약이다 — 회차마다 주소가 달라야 공유 캐시가
 * 이전 회차를 물고 있을 수 없다. 충돌하면 예외를 던지는 대신 `-2`, `-3`을 붙인다.
 * 운영자가 같은 이름으로 회차를 여러 번 만드는 것은 정상 흐름이기 때문이다.
 */
export async function ensureUniqueSlug(db: D1Database, base: string): Promise<string> {
  const clean = base || 'event';
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? clean : `${clean}-${n}`;
    const hit = await db.prepare('SELECT 1 FROM events WHERE slug = ?').bind(candidate).first();
    if (!hit) return candidate;
  }
  // 100개까지 충돌하면 이름 규칙 자체가 잘못된 것이므로 조용히 넘기지 않는다.
  throw new Error(`slug 후보를 100회 시도했으나 모두 충돌했습니다: ${clean}`);
}

/** HTTP 상태를 아는 예외의 공통 부모. withRoute가 status 그대로 응답을 만든다. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** 잘못된 입력 → 400. */
export class BadRequest extends ApiError {
  constructor(message: string) {
    super(message, 400);
  }
}

/**
 * 라우트 핸들러 공통 래퍼 — ApiError(BadRequest 400, RateLimited 429 …)를
 * 사람이 읽을 사유가 담긴 JSON으로 바꾼다. 핸들러마다 try/catch를 복사하면
 * 새 핸들러가 catch를 빼먹는 순간 400이 사유 없는 500으로 새므로(FE-3은
 * 이 응답 본문을 그대로 보여준다), 매핑은 이 한 곳에만 둔다.
 */
export function withRoute<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message }, e.status);
      throw e;
    }
  };
}

/** Next.js 16에서 동적 라우트의 params는 Promise다. await 없이 쓰면 런타임에서 터진다. */
export type IdCtx = { params: Promise<{ id: string }> };

/** `[id]` 라우트 공통 — 경로 파라미터를 검증해 숫자 id로 바꾼다. */
export async function eventId(ctx: IdCtx): Promise<number> {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequest('id는 양의 정수여야 합니다.');
  return n;
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}
