import type { NextRequest } from 'next/server';
import { validateDocumentsBody } from '@/lib/agenda';
import {
  BadRequest,
  eventId,
  getDb,
  json,
  toDocumentDTO,
  withRoute,
  type DocumentRow,
  type IdCtx,
} from '@/lib/db';

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
 */
export const PUT = withRoute(async (request: NextRequest, ctx: IdCtx) => {
  const db = await getDb();
  const id = await eventId(ctx);

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
            `INSERT INTO documents (event_id, session_id, display_name, tag, status, sort_order)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(id, d.sessionId, d.displayName, d.tag, d.status, order),
      );
    } else {
      statements.push(
        db
          .prepare(
            `UPDATE documents
                SET session_id = ?, display_name = ?, tag = ?, status = ?, sort_order = ?
              WHERE id = ? AND event_id = ?`,
          )
          .bind(d.sessionId, d.displayName, d.tag, d.status, order, d.id, id),
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
    if (e instanceof Error && e.message.includes('FOREIGN KEY constraint failed')) {
      return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);
    }
    throw e;
  }

  const final = results[results.length - 1].results as unknown as DocumentRow[];
  return json({ documents: final.map(toDocumentDTO) });
});
