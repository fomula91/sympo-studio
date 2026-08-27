import type { NextRequest } from 'next/server';
import { BadRequest, eventId, getDb, json, withRoute, type EventRow, type IdCtx } from '@/lib/db';
import { assertRateLimit, rateKeys, sha16, TOKEN_PATTERN } from '@/lib/rate-limit';
import { SURVEY_RATE_POLICY, validateSurveyBody } from '@/lib/survey';

/**
 * POST /api/events/[id]/survey — 설문 응답 저장 (BE-4)
 *
 * 문항 하나가 행 하나(0001_init.sql의 survey_responses 주석). 한 요청에 문항
 * 여러 개를 배치로 받아 D1 왕복을 줄인다 — 2단 폼(행사 전체 문항 몰아 제출)과
 * "세션 끝날 때마다 1문항"(단건 제출) 두 흐름을 같은 계약으로 담는다.
 *
 * x-client-token이 질문 POST와 달리 필수다. 같은 응답자의 재제출을 응답 수정으로
 * 접는 UNIQUE 판정(idx_survey_once)의 respondent가 토큰에서 파생되는데, 토큰
 * 없이 IP로 폴백하면 행사장 Wi-Fi(단일 egress IP)의 참가자 전원이 같은
 * respondent가 되어 서로의 응답을 덮어쓴다 — 강등이 오히려 데이터를 부순다.
 *
 * 재제출은 409가 아니라 덮어쓰기다 — "실수로 잘못 눌렀다"가 정상 흐름이고,
 * 문항당 최신 응답 1행만 남아야 집계(GROUP BY)가 응답률을 왜곡 없이 센다.
 */
export const POST = withRoute(async (request: NextRequest, ctx: IdCtx) => {
  const db = await getDb();
  const id = await eventId(ctx);

  const event = await db
    .prepare('SELECT id, engage_survey FROM events WHERE id = ?')
    .bind(id)
    .first<Pick<EventRow, 'id' | 'engage_survey'>>();
  if (!event) return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);
  if (!event.engage_survey) return json({ error: '이 행사는 설문을 받지 않습니다.' }, 403);

  const raw = (await request.json().catch(() => {
    throw new BadRequest('요청 본문이 JSON이 아닙니다.');
  })) as unknown;
  const answers = validateSurveyBody(raw);

  // 세션 소속 검증 — 문항이 여러 세션에 걸칠 수 있으므로 IN 하나로 묶어
  // 왕복 1회로 끝낸다.
  const sessionIds = [...new Set(answers.map((a) => a.sessionId).filter((v): v is number => v !== null))];
  if (sessionIds.length > 0) {
    const placeholders = sessionIds.map(() => '?').join(', ');
    const { results } = await db
      .prepare(`SELECT id FROM sessions WHERE event_id = ? AND id IN (${placeholders})`)
      .bind(id, ...sessionIds)
      .all<{ id: number }>();
    if (results.length !== sessionIds.length) {
      const found = new Set(results.map((r) => r.id));
      const missing = sessionIds.filter((s) => !found.has(s));
      throw new BadRequest(`해당 이벤트의 세션이 아닙니다: ${missing.join(', ')}`);
    }
  }

  const token = request.headers.get('x-client-token');
  if (!token || !TOKEN_PATTERN.test(token)) {
    throw new BadRequest('설문 제출에는 유효한 x-client-token 헤더가 필요합니다.');
  }
  // respondent는 rate limit 키(날짜 소금, 매일 로테이션)와 달리 안정적이어야
  // 재제출이 같은 행으로 접힌다. 소금 없이 해시만 — 원문 토큰은 저장하지 않는다.
  const respondent = await sha16(`respondent|${token}`);

  const keys = await rateKeys(request);
  await assertRateLimit(db, keys, SURVEY_RATE_POLICY, answers.length);

  // ON CONFLICT의 대상은 idx_survey_once(UNIQUE)와 정확히 같은 표현식이어야
  // 한다 — session_id NULL을 IFNULL로 접는 것까지 포함해서.
  // 덮어쓸 때 created_at·해시를 갱신하고 write_count를 올린다: 재제출은 행을
  // 늘리지 않으므로, 쓰기 누적이 하루 한도 판정(countWrites)에 잡혀야 같은
  // 문항 반복 제출이 rate limit을 우회하지 못한다.
  const statements = answers.map((a) =>
    db
      .prepare(
        `INSERT INTO survey_responses
           (event_id, session_id, question_key, answer, respondent, client_hash, token_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(event_id, respondent, question_key, IFNULL(session_id, -1))
         DO UPDATE SET
           answer = excluded.answer,
           client_hash = excluded.client_hash,
           token_hash = excluded.token_hash,
           write_count = write_count + 1,
           created_at = datetime('now')`,
      )
      .bind(id, a.sessionId, a.questionKey, a.answer, respondent, keys.ipHash, keys.tokenHash),
  );

  try {
    // batch는 D1에서 단일 트랜잭션이다 — 문항 일부만 저장된 어정쩡한 상태가
    // 남지 않는다.
    await db.batch(statements);
  } catch (e) {
    // 자정(KST) 시드 리셋과 경합하면 위의 존재 검사 이후 이벤트가 사라질 수
    // 있다 — 그때의 FK 위반은 결함이 아니라 "이벤트가 없어졌다"이므로 404.
    if (e instanceof Error && e.message.includes('FOREIGN KEY constraint failed')) {
      return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);
    }
    throw e;
  }

  return json({ saved: answers.length }, 201);
});
