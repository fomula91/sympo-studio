import type { NextRequest } from 'next/server';
import { BadRequest, eventId, getDb, json, withRoute, type EventRow, type IdCtx } from '@/lib/db';
import {
  QUESTION_RATE_POLICY,
  toQuestionDTO,
  validateQuestionInput,
  type QuestionDTOInput,
  type QuestionRow,
} from '@/lib/qa';
import { evaluateRateLimit, rateKeys, rateLimitStatement } from '@/lib/rate-limit';

const WINDOW = 200;

/**
 * 폴링 응답의 엣지 캐시 수명(초).
 *
 * **읽기 티어를 실제로 줄이는 건 이것뿐이다.** 참가자 100명이 4초 폴링하면
 * 같은 URL에 초당 25건이 몰리는데, 엣지가 이 창 안의 요청을 대신 받아 주면
 * 오리진(=D1)은 창당 1건만 본다. ETag는 바이트만 아끼고 D1 읽기는 그대로다 —
 * 304를 만들려면 어차피 쿼리해서 태그를 계산해야 하기 때문이다.
 *
 * 3초인 이유: 폴링 간격(4초)보다 짧아 "다른 사람 질문이 곧 뜬다"는 체감이
 * 유지되면서(최악 7초), 동시 접속자가 많을수록 절감이 커진다.
 */
const POLL_CACHE_SECONDS = 3;

/** DTO의 ISO(…T…Z)를 SQLite datetime('YYYY-MM-DD HH:MM:SS')로 되돌린다. */
function toSqliteTime(iso: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]} ${m[2]}` : null;
}

/**
 * GET /api/events/[id]/questions — 질문 목록
 *
 * 참가자 화면이 3~5초 폴링으로 때리는 엔드포인트다(FE-3). status='hidden'은
 * 돌려주지 않는다 — 숨김 처리는 운영자 몫이고 참가자 화면에는 없던 일이다.
 * 최신 200건을 잘라 오래된 순으로 준다 — 채팅처럼 아래로 쌓이는 화면 전제는
 * 그대로되, 오래된 쪽부터 자르면 200건을 넘는 순간 새 질문이 영영 안 보이므로
 * 윈도우는 반드시 최신 쪽에 둔다.
 *
 * 읽기 남용 통제 3층(BE-8):
 *   1. `Cache-Control` — 동시 폴링을 엣지가 흡수한다(위 상수 주석).
 *   2. `?since=<createdAt>` — 커서를 주면 그 이후만 돌려준다. 응답이 대개 빈
 *      배열이라 바이트가 줄고, D1도 인덱스 범위 끝만 읽는다. **선택 파라미터다**
 *      — 안 주면 기존처럼 전체 윈도우라 기존 클라이언트가 깨지지 않는다.
 *   3. ETag/304 — 바뀐 게 없으면 본문을 안 보낸다(D1 읽기는 그대로).
 * 존재 확인과 목록 조회는 batch로 묶어 **요청당 D1 왕복 1회**다.
 */
export const GET = withRoute(async (request: NextRequest, ctx: IdCtx) => {
  const db = await getDb();
  const id = await eventId(ctx);

  const sinceRaw = request.nextUrl.searchParams.get('since');
  let since: string | null = null;
  if (sinceRaw) {
    since = toSqliteTime(sinceRaw);
    if (!since) throw new BadRequest('since는 ISO-8601 시각이어야 합니다.');
  }

  const listSql = since
    ? `SELECT id, session_id, body, author, created_at FROM questions
       WHERE event_id = ? AND status = 'published' AND created_at > ?
       ORDER BY created_at DESC LIMIT ${WINDOW}`
    : // created_at DESC라야 idx_questions_event(event_id, created_at DESC)를 걸어
      // 200건에서 멈춘다 — id DESC는 LIMIT과 무관하게 전체 행을 읽어 임시 정렬한다
      // (EXPLAIN QUERY PLAN 실측). 같은 초 동점만 아래 JS 정렬로 안정화한다.
      `SELECT id, session_id, body, author, created_at FROM questions
       WHERE event_id = ? AND status = 'published'
       ORDER BY created_at DESC LIMIT ${WINDOW}`;

  const listStmt = since
    ? db.prepare(listSql).bind(id, since)
    : db.prepare(listSql).bind(id);

  const [eventRes, listRes] = await db.batch([
    db.prepare('SELECT id FROM events WHERE id = ?').bind(id),
    listStmt,
  ]);

  if (!eventRes.results[0]) return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);

  const rows = listRes.results as unknown as QuestionDTOInput[];
  const questions = rows
    .sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id,
    )
    .map(toQuestionDTO);

  // 마지막 항목의 (id, 시각)이면 이 윈도우를 유일하게 식별한다 — 새 질문이
  // 들어오거나 숨김 처리로 윈도우가 밀리면 둘 중 하나가 반드시 바뀐다.
  const last = questions[questions.length - 1];
  const etag = `W/"${questions.length}-${last ? `${last.id}-${last.createdAt}` : 'empty'}"`;
  const headers = {
    'Cache-Control': `public, max-age=${POLL_CACHE_SECONDS}`,
    ETag: etag,
  };

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }

  return json({ questions }, 200, headers);
});

interface CreateBody {
  body?: unknown;
  author?: unknown;
  sessionId?: unknown;
}

/**
 * POST /api/events/[id]/questions — 질문 저장
 *
 * 남용 통제를 이 자리에서 함께 한다(BE-3의 요점 — 나중이 아니라).
 *   - 글자 수 제한: body 2~300자, author ≤ 40자
 *   - rate limit 2층(ADR 0006): x-client-token 브라우저 버킷 60초 3건/하루 30건
 *     + IP 총량 60초 20건/하루 300건. 토큰 없으면 IP 단독 버킷(3건/30건)으로 강등
 * 실패는 조용히 넘기지 않는다 — 400/403/429에 사람이 읽을 이유를 담는다(FE-3의
 * "rate limit 초과 시 사용자가 이유를 알 수 있음"이 이 응답을 그대로 보여준다).
 *
 * 이벤트 조회와 rate limit 판정을 batch로 묶는다(BE-8) — 순서상 둘 다 필요하고
 * 서로를 기다릴 이유가 없어 왕복 2회가 1회로 준다. 덕분에 403(qa off)으로 끝나는
 * 무효 POST도 읽기 1회만 쓴다. **다만 이것이 무효 POST를 "제한"하지는 않는다**:
 * 판정이 questions 테이블의 행을 세는 구조라 한 번도 성공한 적 없는 클라이언트는
 * 셀 행이 없어 영원히 한도에 안 걸린다. 시도 자체를 세려면 (키, 창) 단위 카운터가
 * 필요하고, 그건 "별도 저장소 없이 대상 테이블로 판정"(ADR 0006)을 바꾸는 결정이라
 * 여기서 하지 않는다.
 */
export const POST = withRoute(async (request: NextRequest, ctx: IdCtx) => {
  const db = await getDb();
  const id = await eventId(ctx);

  // 해시 계산은 순수 연산이라 DB보다 먼저 끝내 둔다 — batch에 실어 보내야 한다.
  const keys = await rateKeys(request);

  const [eventRes, rateRes] = await db.batch([
    db.prepare('SELECT id, engage_qa FROM events WHERE id = ?').bind(id),
    rateLimitStatement(db, keys, QUESTION_RATE_POLICY),
  ]);

  const event = eventRes.results[0] as Pick<EventRow, 'id' | 'engage_qa'> | undefined;
  if (!event) return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);
  if (!event.engage_qa) return json({ error: '이 행사는 Q&A를 받지 않습니다.' }, 403);

  evaluateRateLimit(rateRes.results[0] as never, QUESTION_RATE_POLICY);

  const raw = (await request.json().catch(() => {
    throw new BadRequest('요청 본문이 JSON이 아닙니다.');
  })) as CreateBody | null;
  // JSON 리터럴 null은 파싱에 성공하므로 위 catch에 안 걸린다 — 여기서 막지
  // 않으면 아래 프로퍼티 접근이 TypeError로 터져 400이 아니라 500이 된다.
  if (raw === null || typeof raw !== 'object') {
    throw new BadRequest('요청 본문은 JSON 객체여야 합니다.');
  }

  const { body, author } = validateQuestionInput(raw.body, raw.author);

  let sessionId: number | null = null;
  if (raw.sessionId !== undefined && raw.sessionId !== null) {
    if (typeof raw.sessionId !== 'number' || !Number.isInteger(raw.sessionId)) {
      throw new BadRequest('sessionId는 정수여야 합니다.');
    }
    const session = await db
      .prepare('SELECT 1 FROM sessions WHERE id = ? AND event_id = ?')
      .bind(raw.sessionId, id)
      .first();
    if (!session) throw new BadRequest('해당 이벤트의 세션이 아닙니다.');
    sessionId = raw.sessionId;
  }

  let row: QuestionRow | null;
  try {
    row = await db
      .prepare(
        `INSERT INTO questions (event_id, session_id, body, author, client_hash, token_hash)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(id, sessionId, body, author, keys.ipHash, keys.tokenHash)
      .first<QuestionRow>();
  } catch (e) {
    // 자정(KST) 시드 리셋과 경합하면 위의 존재 검사 이후 이벤트가 사라질 수
    // 있다 — 그때의 FK 위반은 결함이 아니라 "이벤트가 없어졌다"이므로 404.
    if (e instanceof Error && e.message.includes('FOREIGN KEY constraint failed')) {
      return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);
    }
    throw e;
  }

  if (!row) throw new Error('질문 저장 후 행을 돌려받지 못했습니다.');
  return json(toQuestionDTO(row), 201);
});
