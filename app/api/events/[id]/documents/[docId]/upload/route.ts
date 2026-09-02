import type { NextRequest } from 'next/server';
import { ApiError, BadRequest, getDb, getEnv, json, withRoute, type DocumentRow } from '@/lib/db';
import { assertUploadable, documentKey, MAX_FILE_BYTES } from '@/lib/r2';

type UploadCtx = { params: Promise<{ id: string; docId: string }> };

function positiveInt(v: string, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequest(`${field}는 양의 정수여야 합니다.`);
  return n;
}

/**
 * PUT /api/events/[id]/documents/[docId]/upload — 강의자료 파일 업로드 (BE-6)
 *
 * **현장에서 올린다**는 것이 이 경로의 전제다. 실무에서 연자가 늦게 도착해 자료가
 * 행사 진행 중에 올라왔고, 올리는 곳은 사무실 책상이 아니라 태블릿이었다
 * ([[field-experience]]). 그래서 자료 행은 파일보다 먼저 존재하고(BE-14가 만든다,
 * `status='pending'` = 참가자 화면의 "준비 중"), 이 라우트는 **그 행에 파일을 붙일
 * 뿐** 새 행을 만들지 않는다.
 *
 * 본문은 파일 바이트 그대로다(multipart 아님). 폼 파싱을 피한 이유는 파서가
 * 경계 문자열을 훑으며 메모리를 두 배로 쓰기 때문이고, 여기서는 받은 바이트를
 * 그대로 넘긴다. **다만 스트리밍은 아니다** — `R2Bucket.put`은 길이를 아는
 * 스트림만 받아서(`Provided readable stream must have a known length`, 로컬 실측)
 * 한 번 버퍼에 담아야 한다. 20MB 상한이 곧 메모리 상한이라 감당되는 크기다.
 *
 * 버퍼에 담되 **열어 보지는 않는다**: 페이지 수 추출도, 썸네일도, 워터마크도 없다
 * (ADR 0002 — 무료 티어가 인색한 자원은 저장 공간이 아니라 CPU 시간).
 *
 * **운영자 경로라 공개 상태 게이트(BE-16)를 걸지 않는다** — 초안 상태에서 미리
 * 자료를 올려 두는 것이 정상 흐름이다. 다만 **지금은 인가 검사가 없어 누구나 호출할
 * 수 있다**(BE-13에서 소유권 검사를 얹는다). R2에 결제 수단이 붙어 있으므로 그때까지
 * 상한 두 겹이 방어선이다: 파일당 20MB, 이벤트당 자료 60개(BE-14).
 */
export const PUT = withRoute(async (request: NextRequest, ctx: UploadCtx) => {
  const { id, docId } = await ctx.params;
  const eventId = positiveInt(id, 'id');
  const documentId = positiveInt(docId, '자료 id');

  const declared = request.headers.get('content-length');
  const declaredSize = declared ? Number(declared) : null;
  const contentType = assertUploadable(request.headers.get('content-type'), declaredSize);
  if (!request.body) throw new BadRequest('업로드할 파일이 없습니다.');

  const db = await getDb();
  const env = await getEnv();

  const doc = await db
    .prepare('SELECT id, r2_key FROM documents WHERE id = ? AND event_id = ?')
    .bind(documentId, eventId)
    .first<Pick<DocumentRow, 'id' | 'r2_key'>>();
  if (!doc) return json({ error: '자료를 찾을 수 없습니다.' }, 404);

  // Content-Length는 클라이언트가 말한 값이라 믿지 않는다 — 실제로 받은 바이트로
  // 한 번 더 검사한다. R2에 넣기 **전에** 확인하므로 넣었다 지우는 왕복이 없다.
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new BadRequest(`파일은 ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB 이하여야 합니다.`);
  }
  if (bytes.byteLength === 0) throw new BadRequest('업로드할 파일이 없습니다.');

  const key = documentKey(eventId, documentId);
  const object = await env.DOCS.put(key, bytes, { httpMetadata: { contentType } });

  try {
    await db
      .prepare(
        `UPDATE documents
            SET r2_key = ?, content_type = ?, size_bytes = ?, status = 'ready',
                uploaded_at = datetime('now')
          WHERE id = ? AND event_id = ?`,
      )
      .bind(key, contentType, object.size, documentId, eventId)
      .run();
  } catch (e) {
    // D1 갱신이 실패하면 R2에 아무도 못 찾는 객체가 남는다 — 되돌린다.
    await env.DOCS.delete(key);
    throw e;
  }

  // 교체 업로드였다면 옛 객체를 지운다. 실패해도 요청은 성공이다 — 고아 객체는
  // 자정 Cron이 정리하고, 여기서 터뜨리면 이미 성공한 업로드가 실패로 보인다.
  if (doc.r2_key && doc.r2_key !== key) {
    await env.DOCS.delete(doc.r2_key).catch(() => {});
  }

  return json({ id: documentId, status: 'ready', sizeBytes: object.size }, 201);
});

/** 업로드 취소·삭제는 자료 행 자체를 지우는 BE-14의 PUT documents가 담당한다. */
export const GET = withRoute(async () => {
  throw new ApiError('업로드는 PUT으로 요청하세요.', 405);
});
