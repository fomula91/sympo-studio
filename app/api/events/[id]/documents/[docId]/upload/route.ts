import type { NextRequest } from 'next/server';
import { ApiError, BadRequest, getDb, getEnv, json, withRoute, type DocumentRow } from '@/lib/db';
import { assertCanEdit } from '@/lib/auth';
import {
  assertEventCapacity, assertUploadable, documentKey, MAX_FILE_BYTES, uploadCostMb,
  UPLOAD_RATE_POLICY,
} from '@/lib/r2';
import { evaluateRateLimit, rateCounterStatement, rateKeys, rateUsageStatements } from '@/lib/rate-limit';

type UploadCtx = { params: Promise<{ id: string; docId: string }> };

function positiveInt(v: string, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequest(`${field}는 양의 정수여야 합니다.`);
  return n;
}

/**
 * PUT /api/events/[id]/documents/[docId]/upload — 강의자료 파일 업로드 (BE-6, BE-29)
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
 * 자료를 올려 두는 것이 정상 흐름이다.
 *
 * ## 상한 세 겹 (BE-29)
 *
 * 데모 이벤트는 `owner_id IS NULL`이라 `assertCanEdit`를 **누구든 통과한다**(게스트
 * 체험이 여기 기대는 의도된 설계다). 즉 익명 업로드가 정상 경로이고, 소유권 검사는
 * 여기서 방어선이 되지 못한다. R2에 결제 수단이 붙어 있으므로 상한이 곧 방어선이다.
 *
 * 1. **파일당 20MB** (`MAX_FILE_BYTES`) — 한 번에 올릴 수 있는 양
 * 2. **이벤트당 300MB** (`MAX_EVENT_BYTES`) — 자료 60개 × 20MB = 1.2GB가 되는 것을 막는다
 * 3. **MB 단위 rate limit** (`UPLOAD_RATE_POLICY`) — 같은 자료에 반복해 덮어쓰는 것을 막는다.
 *    `documentKey`가 회차마다 nonce를 붙이므로 **덮어쓰기는 제자리 갱신이 아니라 새 객체
 *    생성**이고, 옛 객체 삭제는 실패해도 넘어가는(best-effort) 경로다. 1·2만으로는
 *    이 반복이 안 막힌다.
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
  const keys = await rateKeys(request);

  // 이벤트를 바꾸는 쓰기 경로는 전부 소유권을 지난다 — 상위 라우트만 막으면
  // 여기로 우회된다(Codex 교차 리뷰 #2에서 재현).
  await assertCanEdit(db, request, eventId);

  // 자료 조회·이벤트 사용량·rate 카운터를 한 batch로 — 요청당 D1 왕복 1회다.
  // 사용량 합에서 **이 자료는 뺀다**: 교체 업로드면 옛 객체가 지워져 그 몫이 돌아온다.
  const [docRes, usageRes, rateRes] = await db.batch([
    db
      .prepare('SELECT id, r2_key FROM documents WHERE id = ? AND event_id = ?')
      .bind(documentId, eventId),
    db
      .prepare(
        `SELECT COALESCE(SUM(size_bytes), 0) AS total FROM documents
          WHERE event_id = ? AND id <> ?`,
      )
      .bind(eventId, documentId),
    rateCounterStatement(db, keys, UPLOAD_RATE_POLICY, eventId),
  ]);

  const doc = docRes.results[0] as Pick<DocumentRow, 'id' | 'r2_key'> | undefined;
  if (!doc) return json({ error: '자료를 찾을 수 없습니다.' }, 404);
  const otherBytes = Number((usageRes.results[0] as { total?: number } | undefined)?.total ?? 0);

  // **바이트를 버퍼에 담기 전에** 신고 크기로 한 번 걸러낸다 — 이미 한도를 넘긴
  // 상대에게 20MB를 더 받아 메모리에 올릴 이유가 없다. 신고 크기는 못 믿으므로
  // 실제 크기로 아래에서 다시 판정한다(여기서 통과시키는 쪽으로만 관대하다).
  if (declaredSize !== null && Number.isFinite(declaredSize)) {
    assertEventCapacity(otherBytes, declaredSize);
    evaluateRateLimit(
      rateRes.results as never, keys, UPLOAD_RATE_POLICY, eventId, uploadCostMb(declaredSize),
    );
  }

  // Content-Length는 클라이언트가 말한 값이라 믿지 않는다 — 실제로 받은 바이트로
  // 한 번 더 검사한다. R2에 넣기 **전에** 확인하므로 넣었다 지우는 왕복이 없다.
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new BadRequest(`파일은 ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB 이하여야 합니다.`);
  }
  if (bytes.byteLength === 0) throw new BadRequest('업로드할 파일이 없습니다.');

  assertEventCapacity(otherBytes, bytes.byteLength);
  const cost = uploadCostMb(bytes.byteLength);
  evaluateRateLimit(rateRes.results as never, keys, UPLOAD_RATE_POLICY, eventId, cost);

  const key = documentKey(eventId, documentId);
  const object = await env.DOCS.put(key, bytes, { httpMetadata: { contentType } });

  try {
    // 카운터는 쓰기가 성공한 뒤 같은 트랜잭션에서 올린다(ADR 0008) — 요청마다 올리면
    // 무효 요청이 D1 쓰기 티어를 태운다.
    await db.batch([
      db
        .prepare(
          `UPDATE documents
              SET r2_key = ?, content_type = ?, size_bytes = ?, status = 'ready',
                  uploaded_at = datetime('now')
            WHERE id = ? AND event_id = ?`,
        )
        .bind(key, contentType, object.size, documentId, eventId),
      ...rateUsageStatements(db, keys, UPLOAD_RATE_POLICY, eventId, cost),
    ]);
  } catch (e) {
    // D1 갱신이 실패하면 R2에 아무도 못 찾는 객체가 남는다 — 되돌린다.
    await env.DOCS.delete(key);
    throw e;
  }

  // 교체 업로드였다면 옛 객체를 지운다. 실패해도 요청은 성공이다 — 남은 객체는
  // 자정 Cron이 정리하고(BE-29에서 살아 있는 이벤트 안까지 보도록 넓혔다),
  // 여기서 터뜨리면 이미 성공한 업로드가 실패로 보인다.
  if (doc.r2_key && doc.r2_key !== key) {
    await env.DOCS.delete(doc.r2_key).catch(() => {});
  }

  return json({ id: documentId, status: 'ready', sizeBytes: object.size }, 201);
});

/** 업로드 취소·삭제는 자료 행 자체를 지우는 BE-14의 PUT documents가 담당한다. */
export const GET = withRoute(async () => {
  throw new ApiError('업로드는 PUT으로 요청하세요.', 405);
});
