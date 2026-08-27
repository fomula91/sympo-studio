import type { NextRequest } from 'next/server';
import { BadRequest, eventId, getDb, json, withRoute, type EventRow, type IdCtx } from '@/lib/db';
import {
  QUESTION_RATE_POLICY,
  toQuestionDTO,
  validateQuestionInput,
  type QuestionDTOInput,
  type QuestionRow,
} from '@/lib/qa';
import { assertRateLimit, rateKeys } from '@/lib/rate-limit';

/**
 * GET /api/events/[id]/questions — 질문 목록
 *
 * 참가자 화면이 3~5초 폴링으로 때리는 엔드포인트다(FE-3). status='hidden'은
 * 돌려주지 않는다 — 숨김 처리는 운영자 몫이고 참가자 화면에는 없던 일이다.
 * 최신 200건을 잘라 오래된 순으로 준다 — 채팅처럼 아래로 쌓이는 화면 전제는
 * 그대로되, 오래된 쪽부터 자르면 200건을 넘는 순간 새 질문이 영영 안 보이므로
 * 윈도우는 반드시 최신 쪽에 둔다.
 */
export const GET = withRoute(async (_request: NextRequest, ctx: IdCtx) => {
  const db = await getDb();
  const id = await eventId(ctx);

  const event = await db.prepare('SELECT id FROM events WHERE id = ?').bind(id).first();
  if (!event) return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);

  // created_at DESC라야 idx_questions_event(event_id, created_at DESC)를 걸어
  // 200건에서 멈춘다 — id DESC는 LIMIT과 무관하게 전체 행을 읽어 임시 정렬한다
  // (EXPLAIN QUERY PLAN 실측). 같은 초 동점만 아래 JS 정렬로 안정화한다.
  const { results } = await db
    .prepare(
      `SELECT id, session_id, body, author, created_at FROM questions
       WHERE event_id = ? AND status = 'published'
       ORDER BY created_at DESC LIMIT 200`,
    )
    .bind(id)
    .all<QuestionDTOInput>();

  const questions = results
    .sort((a, b) =>
      a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id,
    )
    .map(toQuestionDTO);

  return json({ questions });
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
 */
export const POST = withRoute(async (request: NextRequest, ctx: IdCtx) => {
  const db = await getDb();
  const id = await eventId(ctx);

  const event = await db
    .prepare('SELECT id, engage_qa FROM events WHERE id = ?')
    .bind(id)
    .first<Pick<EventRow, 'id' | 'engage_qa'>>();
  if (!event) return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);
  if (!event.engage_qa) return json({ error: '이 행사는 Q&A를 받지 않습니다.' }, 403);

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

  const keys = await rateKeys(request);
  await assertRateLimit(db, keys, QUESTION_RATE_POLICY);

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
