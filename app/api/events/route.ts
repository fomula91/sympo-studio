import type { NextRequest } from 'next/server';
import { autoSlug } from '@/lib/data';
import {
  BadRequest,
  ensureUniqueSlug,
  getDb,
  json,
  toEventDTO,
  withRoute,
  type EventRow,
} from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { isEventStatus, statusBadRequestMessage } from '@/lib/status';

/**
 * GET /api/events — 이벤트 목록
 *
 * 콘솔 화면의 검색·상태 필터·정렬을 그대로 받는다.
 *   ?q=검색어  ?status=진행중  ?sort=최신|행사일|이름
 */
export const GET = withRoute(async (request: NextRequest) => {
  const db = await getDb();
  const sp = request.nextUrl.searchParams;
  const q = sp.get('q')?.trim();
  const status = sp.get('status')?.trim();
  const sort = sp.get('sort') ?? '최신';

  const where: string[] = [];
  const binds: unknown[] = [];

  if (q) {
    where.push('(title LIKE ?1 OR brand LIKE ?1 OR venue LIKE ?1)');
    binds.push(`%${q}%`);
  }
  if (status && status !== '전체') {
    // 목록 밖의 값은 400으로 끊는다(BE-23). 그냥 통과시키면 0건을 돌려주는데,
    // 화면에는 "해당 상태의 이벤트가 없음"과 "오타로 잘못 물었음"이 똑같이 보인다.
    if (!isEventStatus(status)) throw new BadRequest(statusBadRequestMessage());
    where.push(`status = ?${binds.length + 1}`);
    binds.push(status);
  }

  // 정렬 키는 화이트리스트로만 매핑한다. 문자열을 그대로 SQL에 넣지 않는다.
  const orderBy =
    sort === '행사일' ? 'event_date DESC' : sort === '이름' ? 'title ASC' : 'created_at DESC';

  const sql =
    'SELECT * FROM events' +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY ${orderBy} LIMIT 200`;

  const { results } = await db
    .prepare(sql)
    .bind(...binds)
    .all<EventRow>();

  return json({ events: results.map(toEventDTO) });
});

interface CreateBody {
  brand?: unknown;
  title?: unknown;
  venue?: unknown;
  date?: unknown;
  host?: unknown;
  capacity?: unknown;
  status?: unknown;
  slug?: unknown;
}

function str(v: unknown, field: string, required = false): string | null {
  if (v === undefined || v === null || v === '') {
    if (required) throw new BadRequest(`${field}는 필수입니다.`);
    return null;
  }
  if (typeof v !== 'string') throw new BadRequest(`${field}는 문자열이어야 합니다.`);
  return v.trim();
}

/**
 * POST /api/events — 이벤트 생성
 *
 * slug를 넘기지 않으면 행사명·장소·날짜에서 만든다. 어느 쪽이든 중복은
 * 접미사로 피한다(ensureUniqueSlug).
 */
export const POST = withRoute(async (request: NextRequest) => {
  const db = await getDb();
  const body = (await request.json().catch(() => {
    throw new BadRequest('요청 본문이 JSON이 아닙니다.');
  })) as CreateBody | null;
  // JSON 리터럴 null은 파싱에 성공하므로 위 catch에 안 걸린다.
  if (body === null || typeof body !== 'object') {
    throw new BadRequest('요청 본문은 JSON 객체여야 합니다.');
  }

  const brand = str(body.brand, 'brand', true)!;
  const title = str(body.title, 'title', true)!;
  const venue = str(body.venue, 'venue');
  const date = str(body.date, 'date');
  const host = str(body.host, 'host');
  // 목록 밖의 값을 막는 것이 요점이다(BE-23) — PATCH와 같은 이유다. 생성 경로도
  // 아무 문자열이나 받아 201로 돌려주고 있었고, 그렇게 만들어진 이벤트는 공개
  // 페이지가 처음부터 404라 운영자가 원인을 짚을 단서가 없다.
  const status = str(body.status, 'status') ?? '초안';
  if (!isEventStatus(status)) throw new BadRequest(statusBadRequestMessage());

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BadRequest('date는 YYYY-MM-DD 형식이어야 합니다.');
  }
  if (body.capacity !== undefined && body.capacity !== null) {
    // 음수를 막는 것이 요점이다(BE-19 ②) — capacity는 응답률·참석률의 분모라,
    // 음수가 들어가면 집계가 음수 비율을 내보내고 화면이 막대를 반대로 그린다.
    if (typeof body.capacity !== 'number' || body.capacity < 0) {
      throw new BadRequest('capacity는 0 이상의 숫자여야 합니다(응답률·참석률의 분모).');
    }
  }

  const requested = str(body.slug, 'slug') ?? autoSlug(title, venue ?? '', date ?? '');
  const slug = await ensureUniqueSlug(db, requested);

  // 로그인했으면 소유자를 박고, 아니면 NULL로 둔다 — NULL은 데모 이벤트라는 뜻이고
  // 자정 Cron의 리셋 대상이 된다(lib/seed.ts). **여기서 로그인을 요구하지는 않는다** —
  // 게스트를 401로 막는 것은 BE-13의 일이고, 이 커밋에서 함께 잠그면 참가자·데모
  // 경로의 회귀를 한 번에 판정해야 해서 위험이 섞인다.
  //
  // 이 한 줄이 없으면 owner_id를 가진 행이 **아예 생길 수 없어**, 0010이 만든 컬럼도
  // 시드 가드(`WHERE owner_id IS NULL`)도 CASCADE도 지킬 대상이 없는 채로 남는다.
  const owner = await getSessionUser(db, request);

  const row = await db
    .prepare(
      `INSERT INTO events (slug, brand, title, venue, event_date, host, capacity, status, owner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
    .bind(slug, brand, title, venue, date, host, body.capacity ?? null, status, owner?.id ?? null)
    .first<EventRow>();

  if (!row) throw new Error('이벤트 생성 후 행을 돌려받지 못했습니다.');
  return json(toEventDTO(row), 201);
});
