import { eventId, getDb, json, withRoute, type IdCtx } from '@/lib/db';

interface AnswerCountRow {
  question_key: string;
  session_id: number | null;
  answer: string;
  count: number;
}

/**
 * GET /api/events/[id]/survey/summary — 설문 집계 (BE-4)
 *
 * 운영자 리포트(FE-5)의 입력이다. 문항별 답변 분포와 응답자 수, capacity 대비
 * 응답률을 한 번에 돌려준다 — 리포트 화면이 문항 수만큼 요청을 반복하지 않게.
 *
 * respondents가 곧 "그 문항에 답한 사람 수"다 — idx_survey_once(UNIQUE)가
 * (응답자, 문항)당 1행을 보장하므로 답변 카운트의 합이 그대로 인원이 된다.
 *
 * 존재 확인·응답자 수·분포를 batch 하나로 묶어 요청당 D1 왕복 1회.
 * 폴링 대상이 아니고(운영자가 열어 보는 화면) 캐시는 두지 않는다 — 행사 중
 * 실시간 응답률을 보는 것이 이 화면의 용도다.
 */
export const GET = withRoute(async (_request: Request, ctx: IdCtx) => {
  const db = await getDb();
  const id = await eventId(ctx);

  const [eventRes, respondentRes, distRes] = await db.batch([
    db.prepare('SELECT capacity FROM events WHERE id = ?').bind(id),
    db
      .prepare('SELECT COUNT(DISTINCT respondent) AS n FROM survey_responses WHERE event_id = ?')
      .bind(id),
    db
      .prepare(
        `SELECT question_key, session_id, answer, COUNT(*) AS count
         FROM survey_responses
         WHERE event_id = ?
         GROUP BY question_key, IFNULL(session_id, -1), answer
         ORDER BY question_key, IFNULL(session_id, -1), count DESC, answer`,
      )
      .bind(id),
  ]);

  const event = eventRes.results[0] as { capacity: number | null } | undefined;
  if (!event) return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);

  const respondents = (respondentRes.results[0] as { n: number }).n;

  // (문항, 세션) 단위로 접는다 — 행 순서는 위 ORDER BY가 보장하므로 같은
  // 문항의 행은 연속이고, 마지막 그룹과 키가 달라지는 지점이 곧 그룹 경계다.
  const questions: {
    questionKey: string;
    sessionId: number | null;
    respondents: number;
    answers: { answer: string; count: number }[];
  }[] = [];
  for (const row of distRes.results as unknown as AnswerCountRow[]) {
    const last = questions[questions.length - 1];
    if (last && last.questionKey === row.question_key && last.sessionId === row.session_id) {
      last.answers.push({ answer: row.answer, count: row.count });
      last.respondents += row.count;
    } else {
      questions.push({
        questionKey: row.question_key,
        sessionId: row.session_id,
        respondents: row.count,
        answers: [{ answer: row.answer, count: row.count }],
      });
    }
  }

  return json({
    capacity: event.capacity,
    respondents,
    // 분모(capacity)는 운영자가 넣는 예상 인원이라 없을 수 있다 — 그때 0으로
    // 나눠 NaN을 흘리는 대신 null로 "계산 불가"를 명시한다.
    responseRate: event.capacity ? Math.round((respondents / event.capacity) * 1000) / 1000 : null,
    questions,
  });
});
