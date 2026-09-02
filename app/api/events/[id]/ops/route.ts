import { eventId, getDb, json, withRoute, type IdCtx } from '@/lib/db';

interface KindRow { kind: string; visitors: number; hits: number }
interface TargetRow { session_id: number | null; document_id: number | null; visitors: number; hits: number }

/**
 * GET /api/events/[id]/ops — 운영 지표 집계 (BE-5)
 *
 * 리포트(FE-5)의 입력. **운영자용이라 공개 상태 게이트를 걸지 않는다**(BE-16의
 * summary와 같은 이유 — 초안 상태에서 시험 열람으로 지표를 확인하는 것이 정상
 * 흐름이다). 인가 검사가 붙기 전까지(BE-13) 누구나 조회할 수 있다.
 *
 * "몇 명"과 "몇 번"을 함께 준다. 열람률의 분모는 사람이라 DISTINCT visitor가
 * 필요하지만, 토큰 없는 방문자는 visitor가 NULL이라 인원에서 빠진다 — 그때도
 * hits는 남으므로 두 수가 크게 벌어지면 "토큰 없이 도는 클라이언트가 많다"는
 * 신호로 읽으면 된다.
 *
 * 세 쿼리를 batch로 묶어 요청당 D1 왕복 1회. 폴링 대상은 아니지만 로그가 쌓일수록
 * 스캔이 커지므로 짧은 엣지 캐시를 둔다(BE-8에서 summary에 둔 것과 같은 이유).
 */
export const GET = withRoute(async (_request: Request, ctx: IdCtx) => {
  const db = await getDb();
  const id = await eventId(ctx);

  const [eventRes, kindRes, targetRes] = await db.batch([
    db.prepare('SELECT capacity FROM events WHERE id = ?').bind(id),
    db
      .prepare(
        `SELECT kind, COUNT(DISTINCT visitor) AS visitors, COUNT(*) AS hits
         FROM event_logs WHERE event_id = ? GROUP BY kind`,
      )
      .bind(id),
    db
      .prepare(
        `SELECT session_id, document_id,
                COUNT(DISTINCT visitor) AS visitors, COUNT(*) AS hits
         FROM event_logs
         WHERE event_id = ? AND kind IN ('session_view', 'doc_view')
         GROUP BY session_id, document_id
         ORDER BY visitors DESC`,
      )
      .bind(id),
  ]);

  const event = eventRes.results[0] as { capacity: number | null } | undefined;
  if (!event) return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);

  const byKind = new Map(
    (kindRes.results as unknown as KindRow[]).map((r) => [r.kind, { visitors: r.visitors, hits: r.hits }]),
  );
  const zero = { visitors: 0, hits: 0 };
  const pageView = byKind.get('page_view') ?? zero;

  const targets = targetRes.results as unknown as TargetRow[];

  return json(
    {
      capacity: event.capacity,
      // 방문자 수의 기준은 page_view다 — 화면에 들어온 사람.
      visitors: pageView.visitors,
      pageViews: pageView.hits,
      surveyCompleted: (byKind.get('survey_complete') ?? zero).visitors,
      // 분모(capacity)는 운영자 손입력이라 방문자가 그것을 넘을 수 있다.
      // summary의 responseRate와 같은 이유로 1을 넘지 않게 자른다.
      attendanceRate: event.capacity
        ? Math.min(1, Math.round((pageView.visitors / event.capacity) * 1000) / 1000)
        : null,
      sessions: targets
        .filter((r) => r.session_id !== null)
        .map((r) => ({ sessionId: r.session_id, visitors: r.visitors, hits: r.hits })),
      documents: targets
        .filter((r) => r.document_id !== null)
        .map((r) => ({ documentId: r.document_id, visitors: r.visitors, hits: r.hits })),
    },
    200,
    { 'Cache-Control': 'public, max-age=5' },
  );
});
