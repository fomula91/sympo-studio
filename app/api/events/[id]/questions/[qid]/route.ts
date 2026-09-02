import type { NextRequest } from 'next/server';
import { BadRequest, eventId, getDb, json, withRoute } from '@/lib/db';

type QuestionCtx = { params: Promise<{ id: string; qid: string }> };

const STATUSES = ['published', 'hidden'];

/**
 * PATCH /api/events/[id]/questions/[qid] — 질문 숨김/복구 (BE-10)
 *
 * 스키마와 목록 쿼리는 처음부터 `status='hidden'`을 전제했는데(0001_init.sql,
 * GET의 `AND status = 'published'`), **그것을 수행하는 코드가 어디에도 없었다.**
 * 부적절한 질문이 올라오면 제거 경로가 이벤트 전체 삭제(CASCADE)나 자정 리셋
 * 대기뿐이었다.
 *
 * 지우지 않고 상태만 바꾸는 이유: 되돌릴 수 있어야 한다. 운영자가 실수로 내린
 * 질문을 복구할 방법이 없으면 모더레이션 자체를 주저하게 된다.
 *
 * **운영자용이라 공개 상태 게이트(BE-16)를 걸지 않는다** — 초안·보관 상태의
 * 행사도 정리할 수 있어야 한다. 다만 **지금은 인가 검사가 없어 누구나 호출할 수
 * 있다**(BE-13에서 소유권 검사를 얹는다). 그때까지는 이 엔드포인트가 열려 있다는
 * 것을 알고 쓴다.
 */
export const PATCH = withRoute(async (request: NextRequest, ctx: QuestionCtx) => {
  const db = await getDb();
  const id = await eventId(ctx as never);
  const { qid } = await ctx.params;
  const questionId = Number(qid);
  if (!Number.isInteger(questionId) || questionId <= 0) {
    throw new BadRequest('질문 id는 양의 정수여야 합니다.');
  }

  const raw = (await request.json().catch(() => {
    throw new BadRequest('요청 본문이 JSON이 아닙니다.');
  })) as { status?: unknown } | null;
  if (raw === null || typeof raw !== 'object') {
    throw new BadRequest('요청 본문은 JSON 객체여야 합니다.');
  }
  if (typeof raw.status !== 'string' || !STATUSES.includes(raw.status)) {
    throw new BadRequest(`status는 ${STATUSES.join('|')} 중 하나여야 합니다.`);
  }

  // event_id를 WHERE에 함께 둔다 — 남의 행사 질문을 id만으로 건드리지 못하게.
  const row = await db
    .prepare(
      `UPDATE questions SET status = ?
        WHERE id = ? AND event_id = ?
        RETURNING id, status`,
    )
    .bind(raw.status, questionId, id)
    .first<{ id: number; status: string }>();

  if (!row) return json({ error: '질문을 찾을 수 없습니다.' }, 404);
  return json(row);
});
