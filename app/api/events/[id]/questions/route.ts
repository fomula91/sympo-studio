import type { NextRequest } from 'next/server';
import { BadRequest, getDb, json, type EventRow } from '@/lib/db';
import {
  assertRateLimit,
  clientHash,
  RateLimited,
  toQuestionDTO,
  validateQuestionInput,
  type QuestionRow,
} from '@/lib/qa';

/** Next.js 16에서 params는 Promise다. await 없이 쓰면 런타임에서 터진다. */
type Ctx = { params: Promise<{ id: string }> };

async function eventId(ctx: Ctx): Promise<number> {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequest('id는 양의 정수여야 합니다.');
  return n;
}

/**
 * GET /api/events/[id]/questions — 질문 목록
 *
 * 참가자 화면이 3~5초 폴링으로 때리는 엔드포인트다(FE-3). status='hidden'은
 * 돌려주지 않는다 — 숨김 처리는 운영자 몫이고 참가자 화면에는 없던 일이다.
 * 오래된 것부터(ASC) 준다 — 채팅처럼 아래로 쌓이는 화면을 전제한다.
 */
export async function GET(_request: NextRequest, ctx: Ctx) {
  try {
    const db = await getDb();
    const id = await eventId(ctx);

    const event = await db.prepare('SELECT id FROM events WHERE id = ?').bind(id).first();
    if (!event) return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);

    const { results } = await db
      .prepare(
        `SELECT * FROM questions
         WHERE event_id = ? AND status = 'published'
         ORDER BY created_at ASC, id ASC LIMIT 200`,
      )
      .bind(id)
      .all<QuestionRow>();

    return json({ questions: results.map(toQuestionDTO) });
  } catch (e) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400);
    throw e;
  }
}

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
 *   - IP당 rate limit: 60초 3건 / 하루 30건 (판정은 questions 테이블 자체로)
 * 실패는 조용히 넘기지 않는다 — 400/403/429에 사람이 읽을 이유를 담는다(FE-3의
 * "rate limit 초과 시 사용자가 이유를 알 수 있음"이 이 응답을 그대로 보여준다).
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  try {
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
    })) as CreateBody;

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

    const hash = await clientHash(request);
    await assertRateLimit(db, hash);

    const row = await db
      .prepare(
        `INSERT INTO questions (event_id, session_id, body, author, client_hash)
         VALUES (?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(id, sessionId, body, author, hash)
      .first<QuestionRow>();

    if (!row) throw new Error('질문 저장 후 행을 돌려받지 못했습니다.');
    return json(toQuestionDTO(row), 201);
  } catch (e) {
    if (e instanceof BadRequest) return json({ error: e.message }, 400);
    if (e instanceof RateLimited) return json({ error: e.message }, 429);
    throw e;
  }
}
