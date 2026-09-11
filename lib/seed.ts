import { autoSlug, SESSIONS0 } from './data';

/**
 * 데모 데이터를 시드 상태로 되돌린다. 매일 자정(KST) Cron이 호출한다(BE-3).
 *
 * 공개 데모라 방문자가 무엇이든 만들고 남길 수 있다 — 리셋은 두 가지를 보장한다:
 *   1. 남용으로 쌓인 행이 하루를 넘겨 살아남지 않는다(무료 티어·rate limit 해시의 전제).
 *   2. 링크를 여는 사람이 항상 같은 시연 상태에서 시작한다.
 *
 * events를 지우면 sessions·documents·questions·survey_responses·event_logs가
 * 전부 CASCADE로 따라 지워진다(0001_init.sql). 시드는 행사 하나 + 아젠다 +
 * 예시 질문 2건 + 예시 설문 응답 5건 — FE-3·FE-5가 폴링·집계로 바로 그려볼 수
 * 있는 최소 상태다.
 */
// 데모 행사의 원본 값. slug는 손으로 쓰지 않고 POST /api/events와 같은
// autoSlug로 파생한다 — 값을 고치고 slug를 잊으면 다음 리셋이 생성 규칙과
// 어긋난 주소로 재시드돼 공유된 데모 링크가 깨진다.
const DEMO_TITLE = 'MERIDIAN 심포지엄';
const DEMO_VENUE = '아르떼 호텔 서울';
const DEMO_DATE = '2026-08-15';

export async function resetDemoData(db: D1Database): Promise<void> {
  const demoSlug = autoSlug(DEMO_TITLE, DEMO_VENUE, DEMO_DATE);

  // **데모 이벤트를 지웠다 다시 만들지 않는다 — 제자리에서 되돌린다.**
  //
  // 예전에는 `DELETE FROM events`가 테이블을 비워서 `VALUES (1, ...)` 재삽입이 항상
  // 성공했다. BE-12가 삭제를 `WHERE owner_id IS NULL`로 한정하면서 **그 보장이
  // 사라졌다** — 새 DB에서 첫 이벤트를 로그인 사용자가 만들면 그 행이 id 1을 차지하고,
  // 삭제는 건너뛰고, 재삽입이 `UNIQUE constraint failed: events.id`로 터진다(실측).
  // `db.batch`는 원자적이라 리셋 전체가 롤백되고, worker/index.ts가 이걸 await한 뒤
  // 부르는 **R2 고아 정리(스스로 "유일한 상한"이라 적힌 것)까지 영영 안 돈다.**
  // 이 사고 경로는 BE-12 코드리뷰가 찾았다.
  //
  // 그래서 id를 고정하지 않는다. 대신 **slug로 데모 행을 찾아 UPDATE**하고, 없을 때만
  // INSERT한다 — id가 매일 흔들리지도 않고(지웠다 만들면 AUTOINCREMENT가 새 번호를
  // 준다) 남의 id를 침범하지도 않는다.
  const found = await db
    .prepare('SELECT id FROM events WHERE slug = ? AND owner_id IS NULL')
    .bind(demoSlug)
    .first<{ id: number }>();

  const eventId =
    found?.id ??
    (
      await db
        .prepare(
          `INSERT INTO events
             (slug, brand, title, venue, event_date, host, capacity, status,
              engage_qa, engage_survey, engage_chat, engage_cert)
           VALUES (?, 'MERIDIAN', ?, ?, ?, '좌장 서정우', 120, '공개', 1, 1, 0, 1)
           RETURNING id`,
        )
        .bind(demoSlug, DEMO_TITLE, DEMO_VENUE, DEMO_DATE)
        .first<{ id: number }>()
    )?.id;

  if (!eventId) throw new Error('데모 이벤트를 만들지 못했습니다.');

  // 데모 행을 되돌리고, 그 사이 게스트가 서버에 만든 다른 무소유 이벤트는 치운다.
  // 사용자 이벤트(owner_id IS NOT NULL)는 어느 쪽으로도 건드리지 않는다.
  await db.batch([
    db.prepare('DELETE FROM events WHERE owner_id IS NULL AND id != ?').bind(eventId),
    db
      .prepare(
        `UPDATE events
            SET brand = 'MERIDIAN', title = ?, venue = ?, event_date = ?, host = '좌장 서정우',
                capacity = 120, status = '공개',
                engage_qa = 1, engage_survey = 1, engage_chat = 0, engage_cert = 1,
                updated_at = datetime('now')
          WHERE id = ?`,
      )
      .bind(DEMO_TITLE, DEMO_VENUE, DEMO_DATE, eventId),
    // 자식은 전부 새로 깐다. events를 지우지 않으므로 CASCADE가 안 돌아 직접 지운다.
    db.prepare('DELETE FROM event_logs WHERE event_id = ?').bind(eventId),
    db.prepare('DELETE FROM survey_responses WHERE event_id = ?').bind(eventId),
    db.prepare('DELETE FROM questions WHERE event_id = ?').bind(eventId),
    db.prepare('DELETE FROM documents WHERE event_id = ?').bind(eventId),
    db.prepare('DELETE FROM sessions WHERE event_id = ?').bind(eventId),
  ]);

  // 세션 id도 고정하지 않는다 — 같은 이유로 남의 id와 부딪힐 수 있다. 대신 삽입
  // 결과에서 받아 아래 설문·로그가 그 값을 쓴다. **id가 하룻밤에 한 번 바뀌지만**,
  // 참가자 화면은 공개 조회 응답의 실제 id를 쓰므로(FE-3) 다시 열면 맞춰진다.
  const inserted = await db.batch<{ id: number }>(
    SESSIONS0.map((x, i) =>
      db
        .prepare(
          `INSERT INTO sessions (event_id, sort_order, start_time, title, speaker, kind)
           VALUES (?, ?, ?, ?, ?, ?)
           RETURNING id`,
        )
        .bind(eventId, i, x.time, x.title, x.speaker, x.kind),
    ),
  );
  const sessionIds = inserted.map((r) => r.results[0].id);

  const statements: D1PreparedStatement[] = [];

  // 예시 질문 — client_hash NULL이라 rate limit 판정에 섞이지 않는다.
  statements.push(
    db
      .prepare(
        `INSERT INTO questions (event_id, body, author) VALUES
           (?1, 'ATELOVAN 장기 복용 시 모니터링 주기는 어떻게 가져가는 것이 좋을까요?', '참가자'),
           (?1, '고령 환자에서 용량 조절 기준이 궁금합니다.', NULL)`,
      )
      .bind(eventId),
  );

  // 예시 설문 응답 — 집계(BE-4)와 리포트(FE-5)가 빈 화면으로 시작하지 않게 한다.
  // respondent는 시드 전용 표식이고 client_hash NULL이라 rate limit 판정에 섞이지 않는다.
  // updated_at을 함께 넣는다 — 0004에서 판정이 이 컬럼으로 옮겨갔고, NULL로 두면
  // 시드 행만 판정에서 빠지는 특례가 생긴다.
  statements.push(
    db
      .prepare(
        `INSERT INTO survey_responses
           (event_id, session_id, question_key, answer, respondent, updated_at) VALUES
           (?1, ?2,   'session_rating',       '5', 'seed-r1', datetime('now')),
           (?1, ?2,   'session_rating',       '4', 'seed-r2', datetime('now')),
           (?1, NULL, 'overall_satisfaction', '5', 'seed-r1', datetime('now')),
           (?1, NULL, 'overall_satisfaction', '4', 'seed-r2', datetime('now')),
           (?1, NULL, 'overall_satisfaction', '4', 'seed-r3', datetime('now'))`,
      )
      .bind(eventId, sessionIds[0]),
  );

  // 예시 이벤트 로그 — 리포트(FE-5)가 빈 화면이 아니라 그려볼 수 있는 최소 상태.
  // visitor는 실제 적재와 같은 형태(16자 해시)로 지어낸 값이고, client_hash·
  // token_hash는 NULL이라 rate limit 판정에 섞이지 않는다.
  const seedVisitors = ['seedvisitor00001', 'seedvisitor00002', 'seedvisitor00003'];
  for (const v of seedVisitors) {
    statements.push(
      db
        .prepare(`INSERT INTO event_logs (event_id, kind, visitor) VALUES (?, 'page_view', ?)`)
        .bind(eventId, v),
    );
    for (const sessionId of sessionIds.slice(0, 3)) {
      statements.push(
        db
          .prepare(
            `INSERT INTO event_logs (event_id, kind, session_id, visitor) VALUES (?, 'session_view', ?, ?)`,
          )
          .bind(eventId, sessionId, v),
      );
    }
  }
  statements.push(
    db
      .prepare(`INSERT INTO event_logs (event_id, kind, visitor) VALUES (?, 'survey_complete', ?)`)
      .bind(eventId, seedVisitors[0]),
  );

  await db.batch(statements);
}
