import type { NextRequest } from 'next/server';
import {
  assertPublicEvent,
  BadRequest,
  eventId,
  getDb,
  json,
  withRoute,
  type IdCtx,
} from '@/lib/db';
import { LOG_RATE_POLICY, validateLogsBody } from '@/lib/logs';
import { evaluateRateLimit, rateKeys, rateLimitStatement, sha16, TOKEN_PATTERN } from '@/lib/rate-limit';

/**
 * POST /api/events/[id]/logs — 이벤트 로그 적재 (BE-5)
 *
 * 참가자 화면이 열람 흔적을 모아 보낸다. 리포트(FE-5)가 샘플 대신 실측을 그리게
 * 하는 원자료다.
 *
 * **배치로 받는 이유**: 한 참가자가 아젠다를 훑으면 세션 6개 + 자료 4개가 순식간에
 * 쌓인다. 건별로 받으면 D1 쓰기보다 요청 수가 먼저 부담이 된다.
 *
 * **visitor는 토큰에서 파생한다**(설문의 respondent와 같은 규칙): 날짜 소금 없이
 * 안정적이어야 "같은 사람의 열람"을 하나로 셀 수 있다. rate limit 판정용
 * token_hash는 매일 로테이션하므로 다른 값이다.
 *
 * 토큰이 없으면 **거절하지 않고 visitor를 NULL로 둔다** — 집계에서 "몇 명이"를
 * 못 세게 될 뿐 "몇 번"은 남는다. 로그는 참여 기능이 아니라 계측이라, 토큰이
 * 없다고 화면 동작을 막을 이유가 없다.
 */
export const POST = withRoute(async (request: NextRequest, ctx: IdCtx) => {
  const db = await getDb();
  const id = await eventId(ctx);

  const raw = (await request.json().catch(() => {
    throw new BadRequest('요청 본문이 JSON이 아닙니다.');
  })) as unknown;
  const logs = validateLogsBody(raw);

  const keys = await rateKeys(request);
  const token = request.headers.get('x-client-token');
  const visitor = token && TOKEN_PATTERN.test(token) ? await sha16(`visitor|${token}`) : null;

  const [eventRes, rateRes] = await db.batch([
    db.prepare('SELECT id, status FROM events WHERE id = ?').bind(id),
    rateLimitStatement(db, keys, LOG_RATE_POLICY),
  ]);
  // 비공개 상태는 없는 이벤트와 같은 404다(BE-16).
  assertPublicEvent(eventRes.results[0] as { status?: string });
  evaluateRateLimit(rateRes.results[0] as never, LOG_RATE_POLICY, logs.length);

  const statements = logs.map((l) =>
    db
      .prepare(
        `INSERT INTO event_logs
           (event_id, kind, session_id, document_id, visitor, client_hash, token_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, l.kind, l.sessionId, l.documentId, visitor, keys.ipHash, keys.tokenHash),
  );

  try {
    await db.batch(statements);
  } catch (e) {
    // 자정(KST) 시드 리셋과 경합하면 존재 확인 이후 이벤트가 사라질 수 있다.
    if (e instanceof Error && e.message.includes('FOREIGN KEY constraint failed')) {
      return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);
    }
    throw e;
  }

  return json({ saved: logs.length }, 201);
});
