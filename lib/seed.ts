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
 * 예시 질문 2건 — FE-3이 폴링으로 바로 그려볼 수 있는 최소 상태다.
 */
// 데모 행사의 원본 값. slug는 손으로 쓰지 않고 POST /api/events와 같은
// autoSlug로 파생한다 — 값을 고치고 slug를 잊으면 다음 리셋이 생성 규칙과
// 어긋난 주소로 재시드돼 공유된 데모 링크가 깨진다.
const DEMO_TITLE = 'MERIDIAN 심포지엄';
const DEMO_VENUE = '아르떼 호텔 서울';
const DEMO_DATE = '2026-08-15';

export async function resetDemoData(db: D1Database): Promise<void> {
  const statements: D1PreparedStatement[] = [db.prepare('DELETE FROM events')];

  statements.push(
    db
      .prepare(
        `INSERT INTO events
           (id, slug, brand, title, venue, event_date, host, capacity, status,
            engage_qa, engage_survey, engage_chat, engage_cert)
         VALUES (1, ?, 'MERIDIAN', ?, ?, ?, '좌장 서정우', 120, '진행중', 1, 1, 0, 1)`,
      )
      .bind(autoSlug(DEMO_TITLE, DEMO_VENUE, DEMO_DATE), DEMO_TITLE, DEMO_VENUE, DEMO_DATE),
  );

  // 세션 id를 SESSIONS0의 값으로 고정한다 — DELETE 후에도 AUTOINCREMENT
  // 시퀀스는 이어지므로, 자동 배번에 맡기면 리셋마다 id가 +6씩 밀려
  // SESSIONS0의 id(1~6)를 든 클라이언트의 sessionId 참조가 전부 깨진다.
  for (const [i, s] of SESSIONS0.entries()) {
    statements.push(
      db
        .prepare(
          `INSERT INTO sessions (id, event_id, sort_order, start_time, title, speaker, kind)
           VALUES (?, 1, ?, ?, ?, ?, ?)`,
        )
        .bind(s.id, i, s.time, s.title, s.speaker, s.kind),
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
