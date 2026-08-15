import type { NextRequest } from 'next/server';
import { autoSlug } from '@/lib/data';
import { BadRequest, ensureUniqueSlug, getDb, json, toEventDTO, type EventRow } from '@/lib/db';

/**
 * GET /api/events — 이벤트 목록
 *
 * 콘솔 화면의 검색·상태 필터·정렬을 그대로 받는다.
 *   ?q=검색어  ?status=진행중  ?sort=최신|행사일|이름
 */
export async function GET(request: NextRequest) {
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
}

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
export async function POST(request: NextRequest) {
  try {
    const db = await getDb();
    const body = (await request.json().catch(() => {
      throw new BadRequest('요청 본문이 JSON이 아닙니다.');
    })) as CreateBody;

    const brand = str(body.brand, 'brand', true)!;
    const title = str(body.title, 'title', true)!;
    const venue = str(body.venue, 'venue');
    const date = str(body.date, 'date');
    const host = str(body.host, 'host');
    const status = str(body.status, 'status') ?? '초안';

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequest('date는 YYYY-MM-DD 형식이어야 합니다.');
    }
    if (body.capacity !== undefined && body.capacity !== null && typeof body.capacity !== 'number') {
      throw new BadRequest('capacity는 숫자여야 합니다.');
    }

    const requested = str(body.slug, 'slug') ?? autoSlug(title, venue ?? '', date ?? '');
    const slug = await ensureUniqueSlug(db, requested);

    const row = await db
      .prepare(
        `INSERT INTO events (slug, brand, title, venue, event_date, host, capacity, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`,
      )
      .bind(slug, brand, title, venue, date, host, body.capacity ?? null, status)
      .first<EventRow>();

    if (!row) throw new Error('이벤트 생성 후 행을 돌려받지 못했습니다.');
    return json(toEventDTO(row), 201);
  } catch (e) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400);
    throw e;
  }
}
