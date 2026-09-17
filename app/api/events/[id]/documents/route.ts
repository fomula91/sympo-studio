import type { NextRequest } from 'next/server';
import { validateDocumentsBody } from '@/lib/agenda';
import {
  eventNotFound,
  isMissingEventFk,
  BadRequest,
  eventId,
  getDb,
  json,
  toDocumentDTO,
  withRoute,
  type DocumentRow,
  type IdCtx,
} from '@/lib/db';
import { assertCanEdit } from '@/lib/auth';

/**
 * PUT /api/events/[id]/documents — 자료 목록(메타) 저장 (BE-14)
 *
 * 아젠다(sessions)와 같은 diff 규칙이다 — 목록 전체를 받아 id 기준으로
 * 추가·수정·삭제·순서를 맞춘다. 자세한 근거는 sessions 라우트 주석 참조.
 *
 * **파일 자체는 다루지 않는다.** r2_key·content_type·size_bytes·page_count·
 * uploaded_at은 업로드 경로(BE-6)가 채우는 컬럼이라 여기서 건드리지 않는다.
 * 이 라우트가 파일 메타까지 덮어쓰면 "업로드는 됐는데 크기가 0" 같은 상태를
 * 운영자 저장 한 번으로 만들 수 있다.
 *
 * status='pending'이 이 테이블의 요점이다 — 연자가 늦어 자료가 행사 중에
 * 올라오므로, 자료 행은 파일보다 먼저 생기고 그동안 참가자 화면은 빈 목록이
 * 아니라 "준비 중"을 보여준다(0001_init.sql 주석).
 *
 * **그래서 status는 입력이 아니라 `r2_key`에서 파생한다** (BE-27). 예전에는 본문의
 * 값을 그대로 썼고 검사는 신규 생성에만 있어서, **`r2_key`가 NULL인 자료를 메타
 * 저장 한 번으로 `ready`로 올릴 수 있었다** — 참가자 화면에 열 수 없는 자료가
 * "준비됨"으로 뜬다. FE 쪽은 `unavailable = pending || !url` 게이트로 막았지만
 * 그건 증상을 가린 것이지 원인이 아니다. 서버가 일관성을 보장하지 않으면 다른
 * 소비자(운영자 화면·리포트)가 같은 함정을 각자 다시 밟는다.
 */
export const PUT = withRoute(async (request: NextRequest, ctx: IdCtx) => {
  const db = await getDb();
  const id = await eventId(ctx);
  // 이벤트를 바꾸는 쓰기 경로는 전부 소유권을 지난다 — 상위 라우트만 막으면
  // 여기로 우회된다(Codex 교차 리뷰 #2에서 재현).
  await assertCanEdit(db, request, id);

  const raw = (await request.json().catch(() => {
    throw new BadRequest('요청 본문이 JSON이 아닙니다.');
  })) as unknown;
  const items = validateDocumentsBody(raw);

  const [eventRes, existingRes, sessionRes] = await db.batch([
    db.prepare('SELECT id FROM events WHERE id = ?').bind(id),
    db.prepare('SELECT id FROM documents WHERE event_id = ?').bind(id),
    db.prepare('SELECT id FROM sessions WHERE event_id = ?').bind(id),
  ]);
  if (!eventRes.results[0]) return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);

  const existing = new Set((existingRes.results as { id: number }[]).map((r) => r.id));
  const validSessions = new Set((sessionRes.results as { id: number }[]).map((r) => r.id));

  const foreign = items.filter((d) => d.id !== null && !existing.has(d.id)).map((d) => d.id);
  if (foreign.length > 0) {
    throw new BadRequest(`이 이벤트의 자료가 아닙니다: ${foreign.join(', ')}`);
  }

  // 자료를 남의 세션에 붙이면 참가자 화면에서 다른 행사의 세션 아래에 뜬다.
  // FK는 sessions(id)만 보고 event_id는 보지 않으므로 여기서 막아야 한다.
  const badSession = items
    .filter((d) => d.sessionId !== null && !validSessions.has(d.sessionId))
    .map((d) => d.sessionId);
  if (badSession.length > 0) {
    throw new BadRequest(`이 이벤트의 세션이 아닙니다: ${badSession.join(', ')}`);
  }

  const keep = new Set(items.filter((d) => d.id !== null).map((d) => d.id as number));
  const removed = [...existing].filter((x) => !keep.has(x));

  const statements = [];

  if (removed.length > 0) {
    const ph = removed.map(() => '?').join(', ');
    // R2 객체는 여기서 지우지 않는다 — 삭제 경로는 BE-6이 소유한다. 지금은
    // r2_key가 항상 NULL이라 고아 객체가 생기지 않지만, BE-6이 업로드를 붙이는
    // 순간 이 자리가 정리 대상이 된다.
    statements.push(
      db.prepare(`DELETE FROM documents WHERE event_id = ? AND id IN (${ph})`).bind(id, ...removed),
    );
  }

  items.forEach((d, order) => {
    if (d.id === null) {
      statements.push(
        db
          .prepare(
            // 새 자료는 파일이 없다 — 업로드(BE-6)가 붙기 전까지 항상 'pending'이다.
            `INSERT INTO documents (event_id, session_id, display_name, tag, status, sort_order)
             VALUES (?, ?, ?, ?, 'pending', ?)`,
          )
          .bind(id, d.sessionId, d.displayName, d.tag, order),
      );
    } else {
      statements.push(
        db
          .prepare(
            // 파일이 붙어 있으면 'ready', 아니면 'pending'. 같은 문에서 파생시키므로
            // 이 라우트를 지난 뒤 두 값이 어긋난 행은 만들어질 수 없다.
            `UPDATE documents
                SET session_id = ?, display_name = ?, tag = ?, sort_order = ?,
                    status = CASE WHEN r2_key IS NULL THEN 'pending' ELSE 'ready' END
              WHERE id = ? AND event_id = ?`,
          )
          .bind(d.sessionId, d.displayName, d.tag, order, d.id, id),
      );
    }
  });

  statements.push(
    db.prepare('SELECT * FROM documents WHERE event_id = ? ORDER BY sort_order, id').bind(id),
  );

  let results;
  try {
    results = await db.batch(statements);
  } catch (e) {
    // 자정 리셋과의 경합은 결함이 아니라 '이벤트가 없어졌다'다(근거는 헬퍼 주석).
    if (isMissingEventFk(e)) throw eventNotFound();
    throw e;
  }

  const final = results[results.length - 1].results as unknown as DocumentRow[];
  return json({ documents: final.map(toDocumentDTO) });
});
