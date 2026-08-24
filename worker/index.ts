// 커스텀 워커 엔트리 — OpenNext가 생성한 fetch 핸들러에 scheduled(Cron)를 얹는다.
// 패턴 출처: https://opennext.js.org/cloudflare/howtos/custom-worker
// wrangler.jsonc의 main이 이 파일을 가리키고, .open-next/*는 빌드 산출물이라
// `opennextjs-cloudflare build` 이후에만 존재한다(로컬 개발 next dev와는 무관).

import handler from '../.open-next/worker.js';
import { resetDemoData } from '../lib/seed';

export default {
  fetch: handler.fetch,

  // 매일 15:00 UTC = 00:00 KST (wrangler.jsonc triggers.crons)
  // 공개 데모의 하루치 입력을 비우고 시드 상태로 되돌린다(BE-3).
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(resetDemoData(env.DB));
  },
} satisfies ExportedHandler<CloudflareEnv>;

export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from '../.open-next/worker.js';
