import type { NextRequest } from 'next/server';
import { ApiError, BadRequest, getDb, getEnv, json, withRoute, type DocumentRow } from '@/lib/db';
import { assertCanEdit } from '@/lib/auth';
import {
  assertEventCapacity, assertUploadable, documentKey, MAX_EVENT_BYTES, MAX_FILE_BYTES,
  uploadCostMb, UPLOAD_RATE_POLICY,
} from '@/lib/r2';
import { evaluateRateLimit, rateCounterStatement, rateKeys, reserveRateLimit } from '@/lib/rate-limit';

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
 *
 * ## 셋 다 실제 천장이다 (BE-31에서 닫았다)
 *
 * 2는 아래 `UPDATE`의 술어가 커밋 시점에 평가해 동시 요청이 넘어설 수 없었고, 3은
 * **읽고 → R2에 쓰고 → 올리는** 순서라 동시 요청이 같은 값을 읽고 전부 통과했다
 * (Codex 교차 리뷰가 16개 동시 업로드로 재현 경로를 제시). 넘친 만큼 R2 연산·대역폭이
 * 샜다. 지금은 `reserveRateLimit`이 **판정과 증가를 한 문장으로** 묶어 R2에 넣기 직전에
 * 예약하므로 그 창이 없다([[0012-upload-admission]]).
 *
 * 예약을 되돌리는 기준은 하나다 — **R2 `put`이 실제로 일어났는가.** 일어나지 않았으면
 * (put이 던짐) 되돌리고, 일어난 뒤의 실패(D1 갱신 실패·`changes === 0`)는 되돌리지
 * 않는다. Class A 연산은 이미 썼고 이 정책이 지키는 자원이 바로 그것이다.
 *
 * ## 이 라우트만 `Content-Length`를 요구하는 이유 (`/code-review` 발견)
 *
 * 없으면 **상한 셋이 전부 뒤로 밀린다** — `assertUploadable`의 크기 검사가 건너뛰어지고
 * (`size !== null`일 때만 본다), 버퍼에 담기 전 사전 판정도 못 하며, 그대로
 * `arrayBuffer()`가 **본문 전체를 메모리에 올린 뒤에야** 20MB 검사에 닿는다. 즉
 * `Transfer-Encoding: chunked` 하나로 100MB를 아이솔레이트(한도 128MB)에 밀어 넣을 수
 * 있었고, 카운터는 성공할 때만 오르므로 **공격자에게 비용이 0**이었다. 헤더를 넣는
 * 쪽이 정상 경로다(`fetch`가 `File`/`Blob`/`ArrayBuffer` 본문에 자동으로 채운다).
 */
export const PUT = withRoute(async (request: NextRequest, ctx: UploadCtx) => {
  const { id, docId } = await ctx.params;
  const eventId = positiveInt(id, 'id');
  const documentId = positiveInt(docId, '자료 id');

  // 요청 하나가 읽기·판정·증가에서 **같은 창**을 보도록 시작 시각을 고정한다.
  // 본문 읽기가 창 경계를 넘으면 판정이 새 창을 0으로 읽어 그냥 통과한다
  // (`/code-review` 발견 — 느린 전송만으로 재현된다).
  const now = Date.now();

  const declared = request.headers.get('content-length');
  const declaredSize = declared === null ? null : Number(declared);
  if (declaredSize === null || !Number.isInteger(declaredSize) || declaredSize < 0) {
    throw new BadRequest('Content-Length 헤더가 필요합니다(청크 전송은 받지 않습니다).');
  }
  const contentType = assertUploadable(request.headers.get('content-type'), declaredSize);
  if (!request.body) throw new BadRequest('업로드할 파일이 없습니다.');

  const db = await getDb();
  const env = await getEnv();
  const keys = await rateKeys(request, now);

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
    rateCounterStatement(db, keys, UPLOAD_RATE_POLICY, eventId, now),
  ]);

  const doc = docRes.results[0] as Pick<DocumentRow, 'id' | 'r2_key'> | undefined;
  if (!doc) return json({ error: '자료를 찾을 수 없습니다.' }, 404);
  const otherBytes = Number((usageRes.results[0] as { total?: number } | undefined)?.total ?? 0);

  // **바이트를 버퍼에 담기 전에** 신고 크기로 한 번 걸러낸다 — 이미 한도를 넘긴
  // 상대에게 20MB를 더 받아 메모리에 올릴 이유가 없다. 신고 크기는 못 믿으므로
  // 실제 크기로 아래에서 다시 판정한다(여기서 통과시키는 쪽으로만 관대하다).
  assertEventCapacity(otherBytes, declaredSize);
  evaluateRateLimit(
    rateRes.results as never, keys, UPLOAD_RATE_POLICY, eventId, uploadCostMb(declaredSize), now,
  );

  // Content-Length는 클라이언트가 말한 값이라 믿지 않는다 — 실제로 받은 바이트로
  // 한 번 더 검사한다. R2에 넣기 **전에** 확인하므로 넣었다 지우는 왕복이 없다.
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new BadRequest(`파일은 ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB 이하여야 합니다.`);
  }
  if (bytes.byteLength === 0) throw new BadRequest('업로드할 파일이 없습니다.');

  assertEventCapacity(otherBytes, bytes.byteLength);
  const cost = uploadCostMb(bytes.byteLength);

  // **R2에 넣기 직전에 실제 크기로 예약한다**(BE-31). 위 사전 판정은 신고 크기로 하는
  // 읽기라, 20MB를 버퍼에 담기 전에 걸러내는 최적화일 뿐 천장이 아니다. 천장은 여기다 —
  // 판정과 증가가 한 문장이라 동시 요청이 같은 값을 읽고 전부 통과하는 창이 없다.
  // 부작용 바로 앞이라 예약을 붙잡고 있는 시간도 짧다(본문 버퍼링은 이미 끝났다).
  const reservation = await reserveRateLimit(db, keys, UPLOAD_RATE_POLICY, eventId, cost, now);

  const key = documentKey(eventId, documentId);
  const object = await env.DOCS.put(key, bytes, { httpMetadata: { contentType } }).catch(
    async (e: unknown) => {
      // put이 던졌으면 R2 연산이 일어나지 않았다 — 예약을 되돌린다. 되돌리기 실패로
      // 업로드 실패 사유를 덮지 않는다(카운터가 조금 보수적으로 남을 뿐이다).
      await reservation.release().catch(() => {});
      throw e;
    },
  );

  let updated: D1Result;
  try {
    // 카운터는 위 예약에서 이미 올랐다 — 여기서 또 올리면 이중 계상이다(BE-31).
    //
    // **총량 판정을 UPDATE의 WHERE에 한 번 더 넣는다.** 위의 `assertEventCapacity`는
    // 읽고-나서-쓰는 구조라, 같은 이벤트의 **다른 자료**에 동시에 올리면 둘 다 같은
    // `otherBytes`를 보고 통과해 상한을 넘긴다(`/code-review` 발견). D1은 쓰기를
    // 직렬화하므로 이 술어가 커밋 시점의 값으로 평가돼 **상한이 실제 천장이 된다.**
    updated = await db
      .prepare(
        `UPDATE documents
            SET r2_key = ?, content_type = ?, size_bytes = ?, status = 'ready',
                uploaded_at = datetime('now')
          WHERE id = ? AND event_id = ?
            AND (SELECT COALESCE(SUM(size_bytes), 0) FROM documents other
                  WHERE other.event_id = ? AND other.id <> ?) + ? <= ?`,
      )
      .bind(
        key, contentType, object.size, documentId, eventId,
        eventId, documentId, object.size, MAX_EVENT_BYTES,
      )
      .run();
  } catch (e) {
    // D1 갱신이 실패하면 R2에 아무도 못 찾는 객체가 남는다 — 되돌린다.
    await env.DOCS.delete(key);
    throw e;
  }

  // 술어에 걸렸다(또는 그 사이 자료가 지워졌다). 올린 객체를 되돌리고 사유를 알린다 —
  // 여기까지 온 요청은 사전 판정을 지났으므로 원인은 사실상 동시 업로드다.
  if ((updated.meta.changes ?? 0) === 0) {
    await env.DOCS.delete(key).catch(() => {});
    const current = await db
      .prepare('SELECT COALESCE(SUM(size_bytes), 0) AS total FROM documents WHERE event_id = ?')
      .bind(eventId)
      .first<{ total: number }>();
    assertEventCapacity(Number(current?.total ?? 0), object.size);
    // 총량이 문제가 아니었다면 자료 행이 사라진 것이다.
    return json({ error: '자료를 찾을 수 없습니다.' }, 404);
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
