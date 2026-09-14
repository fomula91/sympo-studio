import type { NextRequest } from 'next/server';
import { eventId, getDb, json, withRoute, type IdCtx } from '@/lib/db';
import { sessionTokenHash, sessionUserIdSql } from '@/lib/auth';
import { opsStatements, toOpsDTO } from '@/lib/ops';

/**
 * GET /api/events/[id]/ops — 운영 지표 집계 (BE-5, BE-24)
 *
 * **운영자 전용이다.** 예전에는 이 라우트에 **인증 호출이 0건**이었고, `owner_id`가
 * 채워지기 시작한 뒤에도 그대로라 **남의 이벤트 방문자·열람 지표가 id만 알면 열렸다.**
 * 소유권 모델을 도입해 놓고 읽기가 뚫려 있으면 그 모델이 성립하지 않는다.
 *
 * 남의 것이면 403이 아니라 **404**다 — 존재를 흘리지 않는다(BE-7·BE-13의 규칙).
 * 소유자가 없는 데모 이벤트는 그대로 열려 있다(게스트 체험 경로).
 *
 * **공개 상태 게이트는 걸지 않는다**(BE-16의 summary와 같은 이유) — 초안 상태에서
 * 시험 열람으로 지표를 확인하는 것이 정상 흐름이다.
 *
 * **참가자 공개 리포트는 이 경로를 쓰지 않는다** — `/api/public/[slug]/report`로
 * 갈랐다(BE-24). 하나만 잠그면 참가자 리포트가 죽고, 열어 두면 남의 지표가 샌다.
 * 집계 계산은 `lib/ops.ts`에 한 벌만 둔다.
 *
 * 판정을 조회와 같은 문에 넣어 왕복을 늘리지 않는다(BE-13 ⑥). 폴링 대상은 아니지만
 * 로그가 쌓일수록 스캔이 커지므로 짧은 엣지 캐시를 둔다.
 */
export const GET = withRoute(async (request: NextRequest, ctx: IdCtx) => {
  const db = await getDb();
  const id = await eventId(ctx);
  const tokenHash = (await sessionTokenHash(request)) ?? '';

  const [eventRes, kindRes, targetRes] = await db.batch([
    db
      .prepare(
        `SELECT capacity, (owner_id IS NULL OR owner_id = ${sessionUserIdSql(2)}) AS can_read
           FROM events WHERE id = ?1`,
      )
      .bind(id, tokenHash),
    ...opsStatements(db, { id }),
  ]);

  const event = eventRes.results[0] as { capacity: number | null; can_read: number } | undefined;
  if (!event || !event.can_read) return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);

  return json(toOpsDTO(event.capacity, kindRes.results, targetRes.results), 200, {
    // 소유자별로 달라지는 응답이라 **공유 캐시에 올리지 않는다** — `public`이면
    // 중간 캐시가 한 사람의 응답을 다른 사람에게 줄 수 있다(참가자용 공개 리포트
    // 쪽은 누구에게나 같은 응답이라 `public`을 쓴다).
    'Cache-Control': 'private, max-age=5',
  });
});
