import { eventIdFromKey } from './r2';

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
 * 업로드 직후 객체를 고아로 오인하지 않기 위한 유예 (BE-29).
 *
 * R2에 넣은 뒤 D1 `UPDATE`가 커밋되기까지 **그 객체는 어느 행도 참조하지 않는다.**
 * 그 찰나에 Cron이 겹치면 방금 올린 자료가 지워진다. 창은 밀리초 단위이고 Cron은
 * 하루 한 번이라 실제로 겹칠 일이 거의 없지만, **겹쳤을 때의 결과가 "참가자가 열
 * 수 없는 자료"**라 확률이 아니라 피해로 판단한다.
 */
const ORPHAN_GRACE_MS = 60 * 60 * 1000;

/**
 * 어느 자료 행도 참조하지 않는 R2 객체를 지운다 (BE-6, BE-29).
 *
 * D1은 `events` 삭제가 `documents`를 CASCADE로 지우지만 **R2 객체는 따라 지워지지
 * 않는다** — 자정 시드 리셋(`DELETE FROM events`)이 매일 자료 행을 통째로 날리므로,
 * 정리가 없으면 R2에 아무도 못 찾는 객체만 무한히 쌓인다. R2에 결제 수단이 붙어
 * 있어(2026-09-02) 이 누적이 곧 요금이다.
 *
 * **판정 기준을 "죽은 이벤트"에서 "참조되지 않는 키"로 넓혔다**(BE-29). 예전에는
 * 살아 있는 이벤트 id 집합과의 차집합만 봤는데, `documentKey`가 회차마다 nonce를
 * 붙이므로 **같은 자료를 다시 올릴 때마다 새 객체가 생긴다.** 옛 객체는 업로드
 * 라우트가 지우지만 그건 실패해도 넘어가는 경로라, 실패하면 그 객체는 **살아 있는
 * 이벤트의 프리픽스 안에 있어 영원히 회수되지 않았다.** `documents.r2_key` 집합과
 * 대조하면 죽은 이벤트의 객체도 자동으로 포함된다 — "행이 없으면 파일도 없다"는
 * 규칙은 그대로이고 대조 대상만 이벤트에서 키로 내려왔다.
 */
export async function purgeOrphanDocuments(db: D1Database, bucket: R2Bucket): Promise<number> {
  const { results } = await db
    .prepare('SELECT r2_key FROM documents WHERE r2_key IS NOT NULL')
    .all<{ r2_key: string }>();
  const referenced = new Set(results.map((r) => r.r2_key));
  const cutoff = Date.now() - ORPHAN_GRACE_MS;

  let cursor: string | undefined;
  let deleted = 0;
  do {
    const page = await bucket.list({ prefix: 'events/', cursor, limit: 1000 });
    const orphans = page.objects
      .filter((o) => {
        // 프리픽스 규칙에 안 맞는 키는 우리가 만든 것이 아니므로 건드리지 않는다.
        if (eventIdFromKey(o.key) === null) return false;
        if (referenced.has(o.key)) return false;
        return o.uploaded.getTime() < cutoff;
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
