import type { NextRequest } from 'next/server';
import { assertCanEdit } from '@/lib/auth';
import { BadRequest, eventId, getDb, json, withRoute, type IdCtx } from '@/lib/db';
import { toQuestionDTO, type QuestionDTOInput } from '@/lib/qa';

// 참가자 목록과 분리한다. 숨긴 질문은 운영자 권한 확인 후에만 읽을 수 있다.
export const GET = withRoute(async (request: NextRequest, ctx: IdCtx) => {
  const db = await getDb();
  const id = await eventId(ctx);
  await assertCanEdit(db, request, id);
  const raw = request.nextUrl.searchParams.get('before');
  const before = raw === null ? null : Number(raw);
  if (before !== null && (!Number.isSafeInteger(before) || before <= 0)) {
    throw new BadRequest('before는 양의 정수여야 합니다.');
  }
  const result = await db.prepare(
    `SELECT id, session_id, body, author, created_at, status FROM questions
     WHERE event_id = ?${before === null ? '' : ' AND id < ?'} ORDER BY id DESC LIMIT 51`,
  ).bind(...(before === null ? [id] : [id, before])).all<QuestionDTOInput & { status: string }>();
  const rows = result.results.slice(0, 50);
  return json({
    questions: rows.map((row) => ({ ...toQuestionDTO(row), status: row.status })),
    nextCursor: result.results.length > 50 ? rows[rows.length - 1].id : null,
  }, 200, { 'Cache-Control': 'private, no-store' });
});
