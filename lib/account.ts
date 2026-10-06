import { deleteDocumentObjects } from './retention';

/**
 * 계정 삭제 (BE-41, ADR 0007 「계정 삭제」).
 *
 * 지워지는 범위는 **스키마의 CASCADE가 정한다** — `users`를 지우면 `oauth_accounts`·
 * `auth_sessions`·`brand_presets`(owner_id)·`events`(owner_id)가 따라가고, 이벤트 아래의
 * 아젠다·자료·질문·설문 응답·로그가 다시 따라간다. 남의 이벤트(공용 데모 포함)가 이
 * 사용자의 프리셋을 쓰고 있었다면 `events.preset_id`의 `ON DELETE SET NULL`로 그 칸만
 * 비고 이벤트는 남는다.
 *
 * R2 객체만 CASCADE를 따라오지 않는다 — 자료 행을 같은 배치에서 먼저 지우며
 * `RETURNING r2_key`로 키를 받아, 커밋된 뒤 R2에서도 지운다(BE-35와 같은 방식). 배치는 한
 * 트랜잭션이라 사용자 삭제가 실패하면 자료 행 삭제도 되돌려진다. R2 삭제가 실패해도
 * 던지지 않는다 — 남은 객체는 자정 Cron이 회수한다.
 *
 * @returns 지운 이벤트 수. 사용자 행이 이미 없으면 `null`(호출자가 404로 접는다).
 */
export async function deleteAccount(
  db: D1Database,
  bucket: R2Bucket,
  userId: number,
): Promise<{ events: number } | null> {
  const [docsRes, eventsRes, userRes] = await db.batch([
    db
      .prepare(
        'DELETE FROM documents WHERE event_id IN (SELECT id FROM events WHERE owner_id = ?) RETURNING r2_key',
      )
      .bind(userId),
    // 개수를 응답에 싣기 위해 이벤트를 먼저 지운다. 빠뜨려도 아래 사용자 삭제의
    // CASCADE가 지우므로 결과는 같다.
    db.prepare('DELETE FROM events WHERE owner_id = ? RETURNING id').bind(userId),
    db.prepare('DELETE FROM users WHERE id = ? RETURNING id').bind(userId),
  ]);
  if (!(userRes.results as { id: number }[])[0]) return null;

  const gone = docsRes.results as { r2_key: string | null }[];
  await deleteDocumentObjects(bucket, gone.map((r) => r.r2_key), `account ${userId} delete`);
  return { events: eventsRes.results.length };
}
