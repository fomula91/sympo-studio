// 커스텀 워커 엔트리 — OpenNext가 생성한 fetch 핸들러에 scheduled(Cron)를 얹는다.
// 패턴 출처: https://opennext.js.org/cloudflare/howtos/custom-worker
// wrangler.jsonc의 main이 이 파일을 가리키고, .open-next/*는 빌드 산출물이라
// `opennextjs-cloudflare build` 이후에만 존재한다(로컬 개발 next dev와는 무관).

import handler from '../.open-next/worker.js';
import { purgeOldLogs, purgeOrphanDocuments } from '../lib/retention';
import { resetDemoData } from '../lib/seed';

export default {
  // fetch만 골라 담지 않고 스프레드한다 — 어댑터 업그레이드로 생성 워커가
  // 자기 핸들러(queue/tail 등)를 추가해도 조용히 누락되지 않게.
  ...handler,

  // 매일 15:00 UTC = 00:00 KST (wrangler.jsonc triggers.crons)
  // 공개 데모의 하루치 입력을 비우고 시드 상태로 되돌린다(BE-3).
  // waitUntil로 흘리지 않고 await한다 — 실패가 reject로 전파돼야
  // Cron 실행 지표와 wrangler tail에 남는다(waitUntil은 실패를 삼킨다).
  // 30일 지난 이벤트 로그 정리(BE-5)를 함께 돌린다. 지금은 시드 리셋이
  // 로그까지 CASCADE로 쓸어가지만, 계정이 생기면(BE-12) 사용자 이벤트의 로그는
  // 살아남으므로 이 정리만이 유일한 상한이 된다 — 리셋에 기대지 않는다.
  // 순서는 정리가 먼저다: 리셋이 실패해도 로그 상한은 지켜진다.
  async scheduled(_event, env) {
    await purgeOldLogs(env.DB);
    await resetDemoData(env.DB);
    // 리셋이 자료 행을 CASCADE로 날린 **뒤에** 돌아야 그 객체들이 고아로 잡힌다.
    // R2 객체는 D1 CASCADE를 따라오지 않으므로 이 정리가 유일한 상한이다(BE-6).
    await purgeOrphanDocuments(env.DB, env.DOCS);
  },
} satisfies ExportedHandler<CloudflareEnv>;

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from '../.open-next/worker.js';
