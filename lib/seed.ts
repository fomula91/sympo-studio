import { SESSIONS0 } from './data';

/**
 * 데모 데이터를 시드 상태로 되돌린다. 매일 자정(KST) Cron이 호출한다(BE-3).
 *
 * 공개 데모라 방문자가 무엇이든 만들고 남길 수 있다 — 리셋은 두 가지를 보장한다:
 *   1. 남용으로 쌓인 행이 하루를 넘겨 살아남지 않는다(무료 티어·rate limit 해시의 전제).
 *   2. 링크를 여는 사람이 항상 같은 시연 상태에서 시작한다.
 *
 * events를 지우면 sessions·documents·questions·survey_responses·event_logs가
 * 전부 CASCADE로 따라 지워진다(0001_init.sql). 시드는 행사 하나 + 아젠다 +
 * 예시 질문 2건 — FE-3이 폴링으로 바로 그려볼 수 있는 최소 상태다.
 */
export async function resetDemoData(db: D1Database): Promise<void> {
  const statements: D1PreparedStatement[] = [db.prepare('DELETE FROM events')];

  statements.push(
    db
      .prepare(
        `INSERT INTO events
           (id, slug, brand, title, venue, event_date, host, capacity, status,
            engage_qa, engage_survey, engage_chat, engage_cert)
         VALUES (1, 'meridian-arte-seoul-260815', 'MERIDIAN', 'MERIDIAN 심포지엄',
                 '아르떼 호텔 서울', '2026-08-15', '좌장 서정우', 120, '진행중', 1, 1, 0, 1)`,
      ),
  );

  for (const [i, s] of SESSIONS0.entries()) {
    statements.push(
      db
        .prepare(
          `INSERT INTO sessions (event_id, sort_order, start_time, title, speaker, kind)
           VALUES (1, ?, ?, ?, ?, ?)`,
        )
        .bind(i, s.time, s.title, s.speaker, s.kind),
    );
  }

  // 예시 질문 — client_hash NULL이라 rate limit 판정에 섞이지 않는다.
  statements.push(
    db
      .prepare(
        `INSERT INTO questions (event_id, body, author) VALUES
           (1, 'ATELOVAN 장기 복용 시 모니터링 주기는 어떻게 가져가는 것이 좋을까요?', '참가자'),
           (1, '고령 환자에서 용량 조절 기준이 궁금합니다.', NULL)`,
      ),
  );

  await db.batch(statements);
}
