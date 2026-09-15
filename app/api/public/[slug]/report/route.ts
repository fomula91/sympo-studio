import { assertPublicEvent, getDb, json, withRoute } from '@/lib/db';
import { opsStatements, toOpsDTO } from '@/lib/ops';

type SlugCtx = { params: Promise<{ slug: string }> };

/**
 * GET /api/public/[slug]/report — 공개 행사의 실측 집계 (BE-24)
 *
 * **BE-24가 `/api/events/[id]/ops`를 소유자 전용으로 잠그면서 갈라 낸 경로다.**
 * 그 전까지 참가자 공개 리포트(`/[slug]/report`)와 운영자 리포트가 같은 무인증
 * 경로를 나눠 썼다 — 하나만 잠그면 참가자 리포트가 죽고, 열어 두면 남의 운영
 * 지표가 id만 알면 열린다. 두 화면의 **관객이 다르므로 경로를 나누는 것이 맞다.**
 *
 * 경계는 소유권이 아니라 **공개 상태**다(참가자 경로의 규칙, BE-16). 초안·보관은
 * 없는 slug와 **똑같은 404**로 돌려준다 — 존재 여부를 흘리지 않는다.
 *
 * "리포트가 샘플이 아니라 실측"이라는 것이 이 제품의 논지라, 이 경로를 로그인
 * 뒤로 숨기면 그 논지를 보여줄 화면이 사라진다(ADR 0007의 "관객이 둘"과 같은 판단).
 * 열려 있어도 되는 이유: 여기 담기는 것은 **집계 수치뿐**이고, 애초에 공개된 행사의
 * 것이다 — 개별 방문자·질문 본문·설문 응답은 실리지 않는다.
 *
 * slug 해석과 집계를 한 batch로 묶어 요청당 D1 왕복 1회.
 */
export const GET = withRoute(async (_request: Request, ctx: SlugCtx) => {
  const db = await getDb();
  const { slug } = await ctx.params;

  // 집계도 slug로 지목한다 — id를 먼저 조회하면 왕복이 둘이 된다.
  const [eventRes, kindRes, targetRes] = await db.batch([
    db.prepare('SELECT id, status, capacity FROM events WHERE slug = ?').bind(slug),
    ...opsStatements(db, { slug }),
  ]);

  const event = eventRes.results[0] as
    | { id: number; status: string; capacity: number | null }
    | undefined;
  // 비공개 상태는 없는 slug와 같은 404다(BE-16).
  assertPublicEvent(event);

  return json(toOpsDTO(event!.capacity, kindRes.results, targetRes.results), 200, {
    // 누구에게나 같은 응답이라 공유 캐시에 올려도 된다(운영자 쪽은 private).
    'Cache-Control': 'public, max-age=5',
  });
});
