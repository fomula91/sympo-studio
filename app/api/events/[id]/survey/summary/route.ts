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
 *
 * 짧은 엣지 캐시를 둔다(BE-8). 처음엔 "운영자가 열어 보는 화면이라 폴링 대상이
 * 아니다"로 캐시를 뺐는데, 그 전제가 틀렸다 — 분포 쿼리는 이벤트의 응답 행을
 * 전부 GROUP BY로 훑으므로 **요청 하나가 응답 수에 비례해 읽는다.** FE-5가
 * 리포트를 열어두고 갱신하면 시청자 한 명이 읽기 티어의 상당 부분을 쓴다.
 * 5초는 "행사 중 실시간 응답률"이라는 용도를 해치지 않는 선이다.
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
    //
    // 1을 넘지 않게 자른다. capacity는 실측이 아니라 운영자가 손으로 넣는
    // 예상 인원이라 응답자 수가 그것을 넘을 수 있고(예상 3명·응답 50명 → 1667%),
    // 리포트(FE-5)가 이 값으로 막대를 그리면 화면을 뚫는다. 잘라도 정보는
    // 잃지 않는다 — respondents와 capacity가 응답에 그대로 있어, 분모가 잘못됐다는
    // 사실은 그 둘을 비교하면 드러난다.
    responseRate: event.capacity
      ? Math.min(1, Math.round((respondents / event.capacity) * 1000) / 1000)
      : null,
    questions,
  }, 200, { 'Cache-Control': 'public, max-age=5' });
});
