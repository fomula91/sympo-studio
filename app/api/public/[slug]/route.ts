import type { NextRequest } from 'next/server';
import {
  BadRequest,
  getDb,
  json,
  toEventDTO,
  toSessionDTO,
  withRoute,
  type EventRow,
  type SessionRow,
} from '@/lib/db';

/**
 * 참가자에게 보여도 되는 상태. 나머지(초안·검수대기·보관)는 404로 돌려주되,
 * "비공개입니다" 같은 별도 응답을 만들지 않는다 — 존재 여부 자체를 흘리지
 * 않는 것이 요점이다(없는 slug와 구분 불가).
 */
const PUBLIC_STATUSES = new Set(['공개예정', '진행중', '완료']);

type SlugCtx = { params: Promise<{ slug: string }> };

/** documents 테이블에서 참가자 화면이 쓰는 컬럼만. r2_key는 경계를 넘지 않는다(서명 URL은 BE-6). */
interface PublicDocumentRow {
  id: number;
  session_id: number | null;
  display_name: string;
  tag: string | null;
  status: string;
  page_count: number | null;
  size_bytes: number | null;
}

function toDocumentDTO(row: PublicDocumentRow) {
  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.display_name,
    tag: row.tag,
    status: row.status, // 'pending'이면 참가자 화면이 "준비 중"으로 그린다(FE-6)
    pages: row.page_count,
    sizeBytes: row.size_bytes,
  };
}

/**
 * GET /api/public/[slug] — 참가자 마이크로사이트용 공개 조회 (BE-7)
 *
 * slug 하나로 화면 렌더에 필요한 전부(이벤트+아젠다+자료+테마+engage)를 단일
 * 응답으로 돌려준다. 응답에 이벤트 id가 실려 있어 Q&A·설문은 slug→id 재해석
 * 없이 BE-3/4 엔드포인트에 바로 붙는다.
 *
 * rate limit 정책(과제가 기록을 요구): 읽기 전용이라 BE-3의 쓰기 제한은 두지
 * 않는다. D1 테이블 판정 방식의 읽기 제한은 판정 자체가 요청마다 D1 읽기를
 * 소모해 역효과다 — 대신 짧은 Cache-Control로 반복 요청을 엣지·브라우저가
 * 흡수하게 한다(10초: 행사 중 아젠다 수정·engage 토글이 10초 안에 전파되면
 * 충분하다). D1을 안 거치는 읽기 통제는 BE-8에서 Q&A 폴링과 함께 판단한다.
 */
export const GET = withRoute(async (_request: NextRequest, ctx: SlugCtx) => {
  const { slug } = await ctx.params;
  if (!slug || slug.length > 200) throw new BadRequest('slug가 올바르지 않습니다.');

  const db = await getDb();

  const event = await db
    .prepare('SELECT * FROM events WHERE slug = ?')
    .bind(slug)
    .first<EventRow>();

  if (!event || !PUBLIC_STATUSES.has(event.status)) {
    return json({ error: '페이지를 찾을 수 없습니다.' }, 404);
  }

  const [sessions, documents] = await Promise.all([
    db
      .prepare('SELECT * FROM sessions WHERE event_id = ? ORDER BY sort_order, id')
      .bind(event.id)
      .all<SessionRow>(),
    db
      .prepare(
        `SELECT id, session_id, display_name, tag, status, page_count, size_bytes
         FROM documents WHERE event_id = ? ORDER BY sort_order, id`,
      )
      .bind(event.id)
      .all<PublicDocumentRow>(),
  ]);

  return Response.json(
    {
      ...toEventDTO(event),
      sessions: sessions.results.map(toSessionDTO),
      documents: documents.results.map(toDocumentDTO),
    },
    { headers: { 'Cache-Control': 'public, max-age=10' } },
  );
});
