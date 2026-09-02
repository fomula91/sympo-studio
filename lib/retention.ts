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
