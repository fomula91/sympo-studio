/**
 * 운영 지표 집계 (BE-5) — 라우트 두 곳이 같은 계산을 쓴다 (BE-24).
 *
 * 예전에는 `GET /api/events/[id]/ops` 하나였고 **인증 호출이 0건**이라, 참가자
 * 공개 리포트(`/[slug]/report`)와 운영자 리포트가 같은 무인증 경로를 나눠 썼다.
 * BE-24가 운영자 경로에 소유권을 걸면서 **둘을 갈라야 했다** — 하나만 잠그면
 * 참가자 리포트가 죽고, 열어 두면 남의 운영 지표가 id만 알면 열린다.
 *
 * 그래서 **판정(누가 볼 수 있나)은 라우트가, 계산은 여기가** 맡는다. 두 라우트가
 * 각자 집계를 복사했다면 한쪽만 고쳐지는 날이 온다 — 실제로 `attendanceRate`의
 * 상한 1은 BE-19가 한 번 놓쳤다가 리뷰에서 잡힌 값이다.
 */

interface KindRow {
  kind: string;
  visitors: number;
  hits: number;
}

interface TargetRow {
  session_id: number | null;
  document_id: number | null;
  visitors: number;
  hits: number;
}

/**
 * 집계 두 건의 statement. 라우트가 이벤트 조회와 같은 batch에 실어
 * **요청당 D1 왕복 1회**로 묶는다.
 *
 * 대상을 id로도 slug로도 지목할 수 있다. slug일 때는 서브쿼리로 푸는데, id를 먼저
 * 조회하면 왕복이 둘이 되기 때문이다(BE-19 ③이 공개 조회에서 쓴 것과 같은 수법).
 * **집계 SQL 자체는 한 벌뿐**이라 두 라우트가 같은 수치를 낸다.
 */
export function opsStatements(
  db: D1Database,
  target: { id: number } | { slug: string },
): D1PreparedStatement[] {
  const ref = 'id' in target ? '?' : '(SELECT id FROM events WHERE slug = ?)';
  const bind = 'id' in target ? target.id : target.slug;
  return [
    db
      .prepare(
        `SELECT kind, COUNT(DISTINCT visitor) AS visitors, COUNT(*) AS hits
         FROM event_logs WHERE event_id = ${ref} GROUP BY kind`,
      )
      .bind(bind),
    db
      .prepare(
        `SELECT session_id, document_id,
                COUNT(DISTINCT visitor) AS visitors, COUNT(*) AS hits
         FROM event_logs
         WHERE event_id = ${ref} AND kind IN ('session_view', 'doc_view')
         GROUP BY session_id, document_id
         ORDER BY visitors DESC`,
      )
      .bind(bind),
  ];
}

/**
 * 집계 결과 → 응답 본문.
 *
 * "몇 명"과 "몇 번"을 함께 준다. 열람률의 분모는 사람이라 DISTINCT visitor가
 * 필요하지만, 토큰 없는 방문자는 visitor가 NULL이라 인원에서 빠진다 — 그때도
 * hits는 남으므로 두 수가 크게 벌어지면 "토큰 없이 도는 클라이언트가 많다"는
 * 신호로 읽으면 된다.
 */
export function toOpsDTO(capacity: number | null, kindRows: unknown, targetRows: unknown) {
  const byKind = new Map(
    (kindRows as KindRow[]).map((r) => [r.kind, { visitors: r.visitors, hits: r.hits }]),
  );
  const zero = { visitors: 0, hits: 0 };
  const pageView = byKind.get('page_view') ?? zero;
  const targets = targetRows as TargetRow[];

  return {
    capacity,
    // 방문자 수의 기준은 page_view다 — 화면에 들어온 사람.
    visitors: pageView.visitors,
    pageViews: pageView.hits,
    surveyCompleted: (byKind.get('survey_complete') ?? zero).visitors,
    // 분모(capacity)는 운영자 손입력이라 방문자가 그것을 넘을 수 있다.
    // summary의 responseRate와 같은 이유로 1을 넘지 않게 자른다.
    attendanceRate: capacity
      ? Math.min(1, Math.round((pageView.visitors / capacity) * 1000) / 1000)
      : null,
    sessions: targets
      .filter((r) => r.session_id !== null)
      .map((r) => ({ sessionId: r.session_id, visitors: r.visitors, hits: r.hits })),
    documents: targets
      .filter((r) => r.document_id !== null)
      .map((r) => ({ documentId: r.document_id, visitors: r.visitors, hits: r.hits })),
  };
}
