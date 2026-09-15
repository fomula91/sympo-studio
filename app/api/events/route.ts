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
import { requireUser, sessionTokenHash, sessionUserIdSql } from '@/lib/auth';
import { EVENT_WRITE_RATE_POLICY, MAX_EVENTS_PER_USER } from '@/lib/events';
import {
  evaluateRateLimit, rateCounterStatement, rateUsageStatements, userRateKeys,
} from '@/lib/rate-limit';
import { isEventStatus, statusBadRequestMessage } from '@/lib/status';

/**
 * GET /api/events — 이벤트 목록
 *
 * 콘솔 화면의 검색·상태 필터·정렬을 그대로 받는다.
 *   ?q=검색어  ?status=진행중  ?sort=최신|행사일|이름
 *
 * **보이는 범위는 소유권으로 갈린다** (BE-13 ③ · BE-24). 예전에는 `owner_id` 필터가
 * 없어 **남의 이벤트가 전부 목록에 나왔다.** 지금은 로그인하면 "내 것 + 데모",
 * 게스트는 데모(`owner_id IS NULL`)만이다.
 *
 * 데모를 로그인 사용자에게도 남겨 두는 이유: 데모는 숨길 남의 데이터가 아니라
 * **제품이 스스로를 보여주는 화면**이고, 로그인했다고 그것이 사라지면 "로그인하면
 * 잃는다"가 또 하나 생긴다(ADR 0007).
 */
export const GET = withRoute(async (request: NextRequest) => {
  const db = await getDb();
  const sp = request.nextUrl.searchParams;
  const q = sp.get('q')?.trim();
  const status = sp.get('status')?.trim();
  const sort = sp.get('sort') ?? '최신';

  const where: string[] = [];
  const binds: unknown[] = [];

  // 소유권 판정을 **같은 문 안**에서 한다 — 세션을 따로 조회하면 요청당 D1 왕복이
  // 하나 늘고, 콘솔은 화면 하나에 여러 API를 연속으로 부른다(BE-13 ⑥).
  // 토큰이 없거나 만료면 서브쿼리가 NULL이라 무소유(데모) 행만 남는다.
  where.push(`(owner_id IS NULL OR owner_id = ${sessionUserIdSql(binds.length + 1)})`);
  binds.push(await sessionTokenHash(request));

  if (q) {
    // 자리번호를 **계산해서** 쓴다. 예전엔 `?1`이 하드코딩이었는데, 앞에 소유권
    // 조건이 붙으면서 1번 자리의 주인이 바뀌었다 — 그대로 뒀다면 검색어가 아니라
    // **사용자 id로 LIKE 검색**을 하게 된다.
    const at = binds.length + 1;
    where.push(`(title LIKE ?${at} OR brand LIKE ?${at} OR venue LIKE ?${at})`);
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
 *
 * **로그인이 필요하다** (BE-13 ①). 예전에는 누구나 만들 수 있었고 비로그인이 만든
 * 행은 `owner_id NULL`, 즉 **데모와 같은 무소유 행**이 됐다 — 자정 리셋이 지우는
 * 대상이라 만든 사람은 하룻밤 뒤 잃고, 그때까지는 **아무나 고치고 지울 수 있었다**
 * (`assertCanEdit`가 무소유를 통과시킨다). 게스트의 작업을 지키는 장치는 로컬
 * 워크스페이스와 가져오기(BE-15)이지 서버에 무소유 행을 쌓는 것이 아니다.
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

  // 소유자를 정하지 못하면 이 요청은 시작할 이유가 없다 — 본문 검증보다 먼저 끊는다.
  const owner = await requireUser(db, request);

  // 속도(rate limit)와 총량(계정당 이벤트 수)은 다른 것을 막는다 — 하루 한도씩
  // 꾸준히 만들면 총량은 계속 는다(BE-13 ⑦). 둘을 한 batch로 읽어 왕복을 늘리지 않는다.
  const now = Date.now();
  const keys = await userRateKeys(request, owner.id, now);
  const [rateRes, countRes] = await db.batch([
    rateCounterStatement(db, keys, EVENT_WRITE_RATE_POLICY, 0, now),
    db.prepare('SELECT COUNT(*) AS n FROM events WHERE owner_id = ?').bind(owner.id),
  ]);
  evaluateRateLimit(rateRes.results as never, keys, EVENT_WRITE_RATE_POLICY, 0, 1, now);
  const owned = Number((countRes.results[0] as { n?: number } | undefined)?.n ?? 0);
  if (owned >= MAX_EVENTS_PER_USER) {
    throw new BadRequest(
      `계정당 이벤트는 ${MAX_EVENTS_PER_USER}개까지입니다. 쓰지 않는 이벤트를 지우고 다시 시도해 주세요.`,
    );
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


  // 카운터 증가를 삽입과 **같은 batch**에 싣는다(ADR 0008) — 요청마다 올리면 400으로
  // 튕긴 요청까지 D1 쓰기 티어를 태우고, 따로 올리면 삽입만 성공한 채 카운터가
  // 빠질 수 있다.
  const [insertRes] = await db.batch<EventRow>([
    db
      .prepare(
        // 총량 판정을 **삽입문 안에** 한 번 더 둔다. 위의 사전 검사는 읽고-나서-쓰는
        // 구조라 동시 요청이 둘 다 통과해 상한을 넘을 수 있다(Codex 교차 리뷰).
        // D1은 쓰기를 직렬화하므로 이 술어가 커밋 시점 값으로 평가돼 **실제 천장**이 된다.
        `INSERT INTO events (slug, brand, title, venue, event_date, host, capacity, status, owner_id)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE (SELECT COUNT(*) FROM events WHERE owner_id = ?) < ?
         RETURNING *`,
      )
      .bind(
        slug, brand, title, venue, date, host, body.capacity ?? null, status, owner.id,
        owner.id, MAX_EVENTS_PER_USER,
      ),
    ...rateUsageStatements(db, keys, EVENT_WRITE_RATE_POLICY, 0, 1, now),
  ]);

  const row = insertRes.results[0];
  // 술어에 걸렸다 = 그 사이 상한이 찼다. 사전 검사와 같은 문구로 돌려준다.
  if (!row) {
    throw new BadRequest(
      `계정당 이벤트는 ${MAX_EVENTS_PER_USER}개까지입니다. 쓰지 않는 이벤트를 지우고 다시 시도해 주세요.`,
    );
  }
  return json(toEventDTO(row), 201);
});
