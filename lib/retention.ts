/**
 * 이벤트 로그 보존 기간 정리 (BE-5).
 *
 * event_logs는 참가자 화면이 자동으로 쌓는 테이블이라 **방치하면 단조 증가한다** —
 * 다른 테이블과 달리 사람이 지우는 경로가 없다. 스키마 단계에서 이미
 * idx_logs_created를 준비해 둔 것도 이 삭제를 전제한 것이다(0001_init.sql 주석).
 *
 * 지금은 자정 시드 리셋이 `DELETE FROM events`로 로그까지 CASCADE로 쓸어가지만,
 * **그 리셋은 데모 이벤트에만 해당하는 임시 상태다** — 계정이 생기면(BE-12)
 * 사용자 이벤트의 로그는 살아남고 이 정리만이 유일한 상한이 된다. 리셋에 기대지
 * 않고 독립적으로 돈다.
 */
export const LOG_RETENTION_DAYS = 30;

export async function purgeOldLogs(db: D1Database): Promise<number> {
  const res = await db
    .prepare(`DELETE FROM event_logs WHERE created_at < datetime('now', '-${LOG_RETENTION_DAYS} days')`)
    .run();
  return res.meta.changes ?? 0;
}

/**
 * 이벤트가 사라진 R2 객체를 지운다 (BE-6).
 *
 * D1은 `events` 삭제가 `documents`를 CASCADE로 지우지만 **R2 객체는 따라 지워지지
 * 않는다** — 자정 시드 리셋(`DELETE FROM events`)이 매일 자료 행을 통째로 날리므로,
 * 정리가 없으면 R2에 아무도 못 찾는 객체만 무한히 쌓인다. R2에 결제 수단이 붙어
 * 있어(2026-09-02) 이 누적이 곧 요금이다.
 *
 * 키가 `events/{id}/…` 프리픽스라 살아 있는 이벤트 id 집합과의 차집합이 곧 고아다.
 * 계정이 생겨도(BE-12) 같은 규칙이 그대로 성립한다 — "행이 없으면 파일도 없다".
 */
export async function purgeOrphanDocuments(db: D1Database, bucket: R2Bucket): Promise<number> {
  const { results } = await db.prepare('SELECT id FROM events').all<{ id: number }>();
  const alive = new Set(results.map((r) => r.id));

  let cursor: string | undefined;
  let deleted = 0;
  do {
    const page = await bucket.list({ prefix: 'events/', cursor, limit: 1000 });
    const orphans = page.objects
      .filter((o) => {
        const m = /^events\/(\d+)\//.exec(o.key);
        // 프리픽스 규칙에 안 맞는 키는 우리가 만든 것이 아니므로 건드리지 않는다.
        return m ? !alive.has(Number(m[1])) : false;
      })
      .map((o) => o.key);
    if (orphans.length > 0) {
      await bucket.delete(orphans);
      deleted += orphans.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return deleted;
}
