import type { NextRequest } from 'next/server';
import { validateSessionsBody } from '@/lib/agenda';
import {
  BadRequest,
  eventId,
  getDb,
  json,
  toSessionDTO,
  withRoute,
  type IdCtx,
  type SessionRow,
} from '@/lib/db';

/**
 * PUT /api/events/[id]/sessions — 아젠다 목록 저장 (BE-14)
 *
 * 목록 전체를 받아 서버를 그 상태로 맞춘다. 추가·수정·삭제·순서 변경이 요청
 * 하나로 끝나는 것이 요점이다 — 에디터의 드래그 정렬은 한 번 놓을 때마다 여러
 * 행의 sort_order가 동시에 바뀌므로, 행 단위 PATCH를 N번 보내면 중간에 끊긴
 * 순간 화면과 서버의 순서가 어긋난 채로 남는다.
 *
 * **전체 삭제 후 재삽입이 아니라 id 기준 diff다.** 재삽입하면 세션 id가 전부
 * 새로 발급되고, questions·survey_responses·documents가 들고 있던 session_id
 * 참조가 한꺼번에 끊긴다(FK가 SET NULL이라 조용히 NULL이 된다). 시드가 세션
 * id를 1~6으로 고정해 둔 것도 같은 이유다(lib/seed.ts).
 *
 * 배열의 위치가 곧 sort_order다 — order를 필드로 받으면 클라이언트가 보낸 값과
 * 배열 순서가 어긋난 입력을 서버가 판정해야 한다.
 */
export const PUT = withRoute(async (request: NextRequest, ctx: IdCtx) => {
  const db = await getDb();
  const id = await eventId(ctx);

  const raw = (await request.json().catch(() => {
    throw new BadRequest('요청 본문이 JSON이 아닙니다.');
  })) as unknown;
  const items = validateSessionsBody(raw);

  // 존재 확인과 기존 id 조회를 batch로 묶어 읽기 왕복 1회.
  const [eventRes, existingRes] = await db.batch([
    db.prepare('SELECT id FROM events WHERE id = ?').bind(id),
    db.prepare('SELECT id FROM sessions WHERE event_id = ?').bind(id),
  ]);
  if (!eventRes.results[0]) return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);

  const existing = new Set((existingRes.results as { id: number }[]).map((r) => r.id));

  // 남의 이벤트 세션 id를 실어 보내면 400. 그냥 두면 아래 UPDATE의
  // `AND event_id = ?`에 걸려 0행 갱신으로 조용히 넘어간다 — 클라이언트는
  // 저장됐다고 믿는다.
  const foreign = items.filter((s) => s.id !== null && !existing.has(s.id)).map((s) => s.id);
  if (foreign.length > 0) {
    throw new BadRequest(`이 이벤트의 세션이 아닙니다: ${foreign.join(', ')}`);
  }

  const keep = new Set(items.filter((s) => s.id !== null).map((s) => s.id as number));
  const removed = [...existing].filter((x) => !keep.has(x));

  const statements = [];

  if (removed.length > 0) {
    const ph = removed.map(() => '?').join(', ');
    // 세션을 지우기 전에 그 세션의 설문 응답을 먼저 지운다. 두 가지 이유가 있다.
    //
    // 1) survey_responses.session_id가 ON DELETE SET NULL이라 세션이 사라지면
    //    "세션 3에 대한 응답"이 "행사 전체 응답"으로 둔갑한다. 집계(GROUP BY)가
    //    없는 세션의 평가를 전체 만족도에 섞는다.
    // 2) 그 NULL 변환이 idx_survey_once(event_id, respondent, question_key,
    //    IFNULL(session_id,-1))와 충돌한다 — 같은 응답자가 전체 문항에도 답했다면
    //    UNIQUE 위반으로 세션 삭제 자체가 500이 된다.
    //
    // 스키마에서 CASCADE로 바꾸는 것이 정석이지만 SQLite는 FK를 ALTER할 수 없어
    // 테이블 재생성이 필요하고, 그 마이그레이션이 아직 머지되지 않은 BE-4의
    // 0003(같은 테이블에 컬럼 추가)과 적용 순서로 얽힌다. BE-4 머지 후 스키마로
    // 옮기는 것을 남겨 둔다.
    statements.push(
      db
        .prepare(`DELETE FROM survey_responses WHERE event_id = ? AND session_id IN (${ph})`)
        .bind(id, ...removed),
      db.prepare(`DELETE FROM sessions WHERE event_id = ? AND id IN (${ph})`).bind(id, ...removed),
    );
  }

  items.forEach((s, order) => {
    if (s.id === null) {
      statements.push(
        db
          .prepare(
            `INSERT INTO sessions (event_id, sort_order, start_time, title, speaker, kind)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(id, order, s.time, s.title, s.speaker, s.kind),
      );
    } else {
      statements.push(
        db
          .prepare(
            `UPDATE sessions
                SET sort_order = ?, start_time = ?, title = ?, speaker = ?, kind = ?
              WHERE id = ? AND event_id = ?`,
          )
          .bind(order, s.time, s.title, s.speaker, s.kind, s.id, id),
      );
    }
  });

  // 확정된 목록을 같은 트랜잭션 안에서 되읽는다 — 새로 만든 행의 id를 클라이언트가
  // 받아야 다음 저장에서 INSERT가 아니라 UPDATE로 간다. 별도 GET으로 빼면 그
  // 사이의 변경이 섞인다.
  statements.push(
    db
      .prepare('SELECT * FROM sessions WHERE event_id = ? ORDER BY sort_order, id')
      .bind(id),
  );

  let results;
  try {
    // batch는 D1에서 단일 트랜잭션이다 — 순서만 바뀌고 삭제는 안 된 중간 상태가
    // 남지 않는다.
    results = await db.batch(statements);
  } catch (e) {
    // 자정(KST) 시드 리셋과 경합하면 위의 존재 확인 이후 이벤트가 사라질 수 있다.
    if (e instanceof Error && e.message.includes('FOREIGN KEY constraint failed')) {
      return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);
    }
    throw e;
  }

  const final = results[results.length - 1].results as unknown as SessionRow[];
  return json({ sessions: final.map(toSessionDTO) });
});
