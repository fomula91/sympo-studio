import type { NextRequest } from 'next/server';
import {
  BadRequest,
  eventId,
  getDb,
  json,
  toDocumentDTO,
  toEventDTO,
  toSessionDTO,
  withRoute,
  type DocumentRow,
  type EventRow,
  type IdCtx,
  type SessionRow,
} from '@/lib/db';

/**
 * GET /api/events/[id] — 이벤트 단건 + 아젠다 + 자료
 *
 * 세션을 함께 돌려주는 것이 요점이다. 지금 콘솔은 어떤 카드를 열어도 같은
 * 아젠다를 편집하는데(FE-1), 그 결함을 고치려면 이벤트마다 자기 세션 목록을
 * 받아올 수 있어야 한다.
 *
 * 자료도 같은 응답에 싣는다(BE-14) — 에디터가 아젠다와 자료를 같은 화면에서
 * 편집하므로, 나눠 두면 화면 하나를 그리는 데 요청이 둘이 된다. PUT 쪽은
 * 반대로 나뉘어 있다: 아젠다 저장이 자료까지 통째로 덮어쓰면 한쪽 화면의
 * 저장이 다른 쪽의 편집을 지운다.
 *
 * 세 쿼리를 batch로 묶어 왕복 1회. Promise.all은 왕복이 3회다.
 */
export const GET = withRoute(async (_request: NextRequest, ctx: IdCtx) => {
  const db = await getDb();
  const id = await eventId(ctx);

  const [eventRes, sessionRes, documentRes] = await db.batch([
    db.prepare('SELECT * FROM events WHERE id = ?').bind(id),
    db.prepare('SELECT * FROM sessions WHERE event_id = ? ORDER BY sort_order, id').bind(id),
    db.prepare('SELECT * FROM documents WHERE event_id = ? ORDER BY sort_order, id').bind(id),
  ]);

  const event = eventRes.results[0] as EventRow | undefined;
  if (!event) return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);

  return json({
    ...toEventDTO(event),
    sessions: (sessionRes.results as unknown as SessionRow[]).map(toSessionDTO),
    documents: (documentRes.results as unknown as DocumentRow[]).map(toDocumentDTO),
  });
});

/** PATCH가 받는 필드 → 컬럼 매핑. 여기 없는 키는 조용히 무시된다. */
const PATCHABLE: Record<string, string> = {
  title: 'title',
  brand: 'brand',
  venue: 'venue',
  date: 'event_date',
  host: 'host',
  capacity: 'capacity',
  status: 'status',
  presetId: 'preset_id',
  mode: 'mode',
  iconSet: 'icon_set',
  density: 'density',
  keyVisual: 'key_visual',
  kvPattern: 'kv_pattern',
};

/** engage는 중첩 객체로 오므로 따로 편다. SQLite에 boolean이 없어 0/1로 저장. */
const ENGAGE: Record<string, string> = {
  qa: 'engage_qa',
  survey: 'engage_survey',
  chat: 'engage_chat',
  cert: 'engage_cert',
};

/**
 * PATCH /api/events/[id] — 부분 수정
 *
 * slug는 여기서 바꾸지 않는다. 공개된 뒤 주소가 바뀌면 이미 공유된 링크가
 * 깨지고, 회차별 고유 주소라는 전제도 흔들린다.
 */
export const PATCH = withRoute(async (request: NextRequest, ctx: IdCtx) => {
  const db = await getDb();
  const id = await eventId(ctx);
  const body = (await request.json().catch(() => {
    throw new BadRequest('요청 본문이 JSON이 아닙니다.');
  })) as Record<string, unknown> | null;
  if (body === null || typeof body !== 'object') {
    throw new BadRequest('요청 본문은 JSON 객체여야 합니다.');
  }

  const sets: string[] = [];
  const binds: unknown[] = [];

  for (const [key, column] of Object.entries(PATCHABLE)) {
    if (!(key in body)) continue;
    const value = body[key];
    if (key === 'date' && typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequest('date는 YYYY-MM-DD 형식이어야 합니다.');
    }
    if (key === 'capacity' && value !== null && typeof value !== 'number') {
      throw new BadRequest('capacity는 숫자여야 합니다.');
    }
    sets.push(`${column} = ?`);
    binds.push(value ?? null);
  }

  const engage = body.engage;
  if (engage && typeof engage === 'object') {
    for (const [key, column] of Object.entries(ENGAGE)) {
      const value = (engage as Record<string, unknown>)[key];
      if (value === undefined) continue;
      sets.push(`${column} = ?`);
      binds.push(value ? 1 : 0);
    }
  }

  if (!sets.length) throw new BadRequest('수정할 필드가 없습니다.');

  sets.push("updated_at = datetime('now')");
  binds.push(id);

  const row = await db
    .prepare(`UPDATE events SET ${sets.join(', ')} WHERE id = ? RETURNING *`)
    .bind(...binds)
    .first<EventRow>();

  if (!row) return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);
  return json(toEventDTO(row));
});

/**
 * DELETE /api/events/[id]
 *
 * 세션·자료·질문·설문응답·로그는 FK의 ON DELETE CASCADE로 함께 지워진다.
 */
export const DELETE = withRoute(async (_request: NextRequest, ctx: IdCtx) => {
  const db = await getDb();
  const id = await eventId(ctx);

  const row = await db
    .prepare('DELETE FROM events WHERE id = ? RETURNING id')
    .bind(id)
    .first<{ id: number }>();

  if (!row) return json({ error: '이벤트를 찾을 수 없습니다.' }, 404);
  return json({ deleted: row.id });
});
