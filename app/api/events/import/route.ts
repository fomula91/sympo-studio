import type { NextRequest } from 'next/server';
import { autoSlug } from '@/lib/data';
import { BadRequest, getDb, json, withRoute } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { DEMO_SLUG } from '@/lib/seed';
import { EVENT_WRITE_RATE_POLICY, MAX_EVENTS_PER_USER } from '@/lib/events';
import { validateImportBody, type ImportEvent } from '@/lib/import';
import {
  evaluateRateLimit, rateCounterStatement, rateUsageStatements, userRateKeys,
} from '@/lib/rate-limit';

interface ImportResult {
  clientRef: string;
  status: 'created' | 'exists' | 'failed';
  id?: number;
  slug?: string;
  /** slug가 충돌해 접미사가 붙었다. 화면이 "주소가 바뀌었다"를 알릴 수 있게 실어 보낸다. */
  slugChanged?: boolean;
  /** 서버에 없는 프리셋이라 테마 색을 비웠다(게스트가 로컬에서 만든 추출 프리셋). */
  presetDropped?: boolean;
  error?: string;
}

/** slug 후보를 메모리에서 푼다 — 이벤트마다 DB를 왕복하지 않기 위해서다. */
function resolveSlug(base: string, taken: Set<string>): string {
  const clean = base || 'event';
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? clean : `${clean}-${n}`;
    // 데모의 공개 주소는 예약어다(ensureUniqueSlug와 같은 규칙) — 배정되면
    // 신뢰된 URL이 넘어가고 자정 리셋이 slug 충돌로 멈춘다.
    if (candidate === DEMO_SLUG || taken.has(candidate)) continue;
    taken.add(candidate);
    return candidate;
  }
  throw new Error(`slug 후보를 100회 시도했으나 모두 충돌했습니다: ${clean}`);
}

/**
 * POST /api/events/import — 게스트 워크스페이스 가져오기 (BE-15)
 *
 * 로그인 직후 로컬 워크스페이스의 이벤트를 계정으로 옮긴다
 * ([[0007-sso-and-account-model]] §1-1). **로그인은 잃는 행동이 되어서는 안 된다**는
 * 것이 이 엔드포인트의 존재 이유다 — 그래서 이 경로가 데이터를 깨면 목적과 정반대가 된다.
 *
 * ## 원자성의 단위는 이벤트 하나 (②)
 *
 * 이벤트 + 테마 + 아젠다를 **이벤트마다 batch 한 번**으로 넣는다. 전체를 한
 * 트랜잭션으로 묶지 않는 이유: A가 성공하고 B가 실패했을 때 A까지 되돌리면
 * "9개 성공했는데 10번째 때문에 처음부터"가 되어 더 나쁘다. 대신 **건별 결과 배열**을
 * 돌려주고, 화면은 실패분만 다시 보낸다.
 *
 * ## 멱등성 (①)
 *
 * `(owner_id, client_ref)`가 유일하다(0013). 이미 있으면 새로 만들지 않고
 * `status: 'exists'`로 기존 행을 돌려준다 — **끊긴 네트워크에서 다시 누르는 것은
 * 정상 경로**다. `owner_id`가 키에 함께 들어가므로 **남의 `client_ref`를 알아도
 * 남의 이벤트에 닿지 못한다.**
 *
 * ## 왕복 (④)
 *
 * 이벤트마다 조회를 돌리면 가져오기 하나가 수십 회가 된다. 멱등성 조회·slug 충돌
 * 조회·프리셋 존재 확인을 **각각 한 번씩 미리 묶고**, 그 뒤로는 이벤트당 batch 1회다
 * (총 3 + N). slug는 메모리에서 푼다.
 *
 * 상한은 셋이다: 한 번에 20개(`MAX_IMPORT_EVENTS`), 이벤트당 아젠다 60개
 * (BE-14의 `MAX_SESSIONS`), 계정당 총 20개(BE-13 ⑦). rate limit의 cost는
 * **이벤트 수**다 — 가져오기 한 번이 생성 N번과 같은 무게라서다. 계정당 총량은
 * 삽입문의 술어로 한 번 더 판정해 **동시 요청도 넘어서지 못한다**(실측: 동시 15+15가
 * 정확히 20에서 멈춘다).
 *
 * ## 알고 있는 한계 — 동시 가져오기의 slug 경합
 *
 * `taken` 집합은 요청 시작 시점의 스냅샷이다. **같은 사용자가 가져오기를 동시에 두 번
 * 보내면** 두 번째는 첫 번째가 방금 차지한 slug를 모른 채 같은 후보를 배정하고, `slug`
 * UNIQUE에 걸려 그 이벤트가 `failed`가 된다(Codex 교차 리뷰). **중복이 만들어지지는
 * 않고**, `client_ref` 멱등성 덕에 **그대로 다시 보내면 성공한다** — 그때는 스냅샷이
 * 새로 잡히기 때문이다. 한 브라우저에서 로그인 한 번에 한 번 도는 경로라 동시 실행
 * 자체가 드물어, 자동 재시도를 넣는 대신 이 성질을 적어 둔다.
 */
export const POST = withRoute(async (request: NextRequest) => {
  const db = await getDb();
  const owner = await requireUser(db, request);

  const raw = (await request.json().catch(() => {
    throw new BadRequest('요청 본문이 JSON이 아닙니다.');
  })) as unknown;
  const events = validateImportBody(raw);

  const now = Date.now();
  const keys = await userRateKeys(request, owner.id, now);

  // 멱등성 조회·소유 개수·rate 카운터를 한 batch로. 슬러그·프리셋 조회도 함께 묶는다.
  const refs = events.map((e) => e.clientRef);
  const bases = events.map((e) => e.slug ?? autoSlug(e.title, e.venue ?? '', e.date ?? ''));
  const presetIds = [...new Set(events.map((e) => e.theme.presetId).filter(Boolean))] as string[];

  const [rateRes, countRes, existingRes, slugRes, presetRes] = await db.batch([
    rateCounterStatement(db, keys, EVENT_WRITE_RATE_POLICY, 0, now),
    db.prepare('SELECT COUNT(*) AS n FROM events WHERE owner_id = ?').bind(owner.id),
    db
      .prepare(
        `SELECT id, slug, client_ref FROM events
          WHERE owner_id = ? AND client_ref IN (${refs.map(() => '?').join(', ')})`,
      )
      .bind(owner.id, ...refs),
    db
      .prepare(
        // 후보 slug만 훑는다 — 테이블 전체를 읽으면 이벤트가 늘수록 비싸진다.
        `SELECT slug FROM events WHERE ${bases.map(() => 'slug LIKE ?').join(' OR ')}`,
      )
      .bind(...bases.map((b) => `${b}%`)),
    presetIds.length > 0
      ? db
          .prepare(
            `SELECT id FROM brand_presets
              WHERE id IN (${presetIds.map(() => '?').join(', ')})
                AND (owner_id IS NULL OR owner_id = ?)`,
          )
          .bind(...presetIds, owner.id)
      : db.prepare('SELECT NULL AS id WHERE 0'),
  ]);

  evaluateRateLimit(rateRes.results as never, keys, EVENT_WRITE_RATE_POLICY, 0, events.length, now);

  const existing = new Map(
    (existingRes.results as { id: number; slug: string; client_ref: string }[]).map((r) => [
      r.client_ref,
      r,
    ]),
  );
  const taken = new Set((slugRes.results as { slug: string }[]).map((r) => r.slug));
  const usablePresets = new Set((presetRes.results as { id: string }[]).map((r) => r.id));

  const owned = Number((countRes.results[0] as { n?: number } | undefined)?.n ?? 0);
  const toCreate = events.filter((e) => !existing.has(e.clientRef)).length;
  if (owned + toCreate > MAX_EVENTS_PER_USER) {
    throw new BadRequest(
      `계정당 이벤트는 ${MAX_EVENTS_PER_USER}개까지입니다(현재 ${owned}개, 가져오려는 것 ${toCreate}개).`,
    );
  }

  const results: ImportResult[] = [];
  let created = 0;

  for (const [i, ev] of events.entries()) {
    const hit = existing.get(ev.clientRef);
    if (hit) {
      results.push({ clientRef: ev.clientRef, status: 'exists', id: hit.id, slug: hit.slug });
      continue;
    }
    try {
      const base = bases[i];
      const slug = resolveSlug(base, taken);
      const presetId =
        ev.theme.presetId && usablePresets.has(ev.theme.presetId) ? ev.theme.presetId : null;
      const presetDropped = !!ev.theme.presetId && presetId === null;

      const id = await insertEvent(db, owner.id, ev, slug, presetId);
      created += 1;
      results.push({
        clientRef: ev.clientRef,
        status: 'created',
        id,
        slug,
        ...(slug !== base ? { slugChanged: true } : {}),
        ...(presetDropped ? { presetDropped: true } : {}),
      });
    } catch (e) {
      // **한 건의 실패가 나머지를 막지 않는다**(②).
      //
      // 사유는 **다듬어서** 싣는다 — `e.message`를 그대로 보내면
      // `D1_ERROR: UNIQUE constraint failed: events.slug` 같은 내부가 화면에 뜬다
      // (FE는 `error`를 그대로 보여준다, [[API-Guide-FE]]). 원문은 로그에만 남긴다.
      console.error('[import] event failed', ev.clientRef, e);
      results.push({
        clientRef: ev.clientRef,
        status: 'failed',
        error: '저장하지 못했습니다. 이 항목만 다시 시도해 주세요.',
      });
    }
  }

  // 카운터는 **실제로 만든 수만큼** 올린다 — 이미 있던 것(멱등 재시도)과 실패분까지
  // 세면 재시도가 한도를 태운다(ADR 0008).
  //
  // **여기서 터져도 결과는 돌려준다** (`/code-review` 발견). 이벤트는 이미 만들어졌는데
  // 카운터 갱신 실패로 500을 주면 **성공한 가져오기가 실패로 보이고** `results`를 잃어
  // 화면이 무엇이 올라갔는지 알 수 없게 된다. 한도를 한 번 덜 세는 쪽이 훨씬 싸다.
  if (created > 0) {
    try {
      await db.batch(rateUsageStatements(db, keys, EVENT_WRITE_RATE_POLICY, 0, created, now));
    } catch (e) {
      console.error('[import] rate counter bump failed', e);
    }
  }

  return json({ results }, 201);
});

/**
 * 이벤트 하나 + 아젠다를 batch 한 번에 넣는다.
 *
 * 세션의 `event_id`를 첫 문의 `RETURNING`으로 받을 수 없어(batch는 바인딩이 먼저
 * 끝난다) **방금 넣은 행을 `(owner_id, client_ref)`로 다시 집는다** — 그 쌍이
 * 유일하므로 서브쿼리가 그 행 하나만 가리킨다. BE-26이 `users`에서 쓴 것과 같은 수법이다.
 */
async function insertEvent(
  db: D1Database,
  ownerId: number,
  ev: ImportEvent,
  slug: string,
  presetId: string | null,
): Promise<number | undefined> {
  const eventRef = `(SELECT id FROM events WHERE owner_id = ? AND client_ref = ?)`;
  const [inserted] = await db.batch<{ id: number }>([
    db
      .prepare(
        // 사전 검사(총량)는 요청 하나 안에서만 맞다 — 동시에 들어온 다른 가져오기가
        // 같은 수를 읽고 둘 다 통과할 수 있다(Codex 교차 리뷰). 삽입문 자체에 술어를
        // 달아 **커밋 시점**에 판정한다. 걸리면 이 이벤트만 `failed`가 된다.
        `INSERT INTO events
           (slug, brand, title, venue, event_date, host, capacity, status, owner_id, client_ref,
            preset_id, mode, icon_set, density, key_visual, kv_pattern)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, COALESCE(?, 'light'), COALESCE(?, 'geo'), COALESCE(?, '기본'), ?,
                COALESCE(?, 'stripe')
          WHERE (SELECT COUNT(*) FROM events WHERE owner_id = ?) < ?
         RETURNING id`,
      )
      .bind(
        slug, ev.brand, ev.title, ev.venue, ev.date, ev.host, ev.capacity, ev.status,
        ownerId, ev.clientRef,
        presetId, ev.theme.mode, ev.theme.iconSet, ev.theme.density, ev.theme.keyVisual,
        ev.theme.kvPattern,
        ownerId, MAX_EVENTS_PER_USER,
      ),
    ...ev.sessions.map((s, order) =>
      db
        .prepare(
          `INSERT INTO sessions (event_id, sort_order, start_time, title, speaker, kind)
           VALUES (${eventRef}, ?, ?, ?, ?, ?)`,
        )
        .bind(ownerId, ev.clientRef, order, s.time, s.title, s.speaker, s.kind),
    ),
  ]);
  const id = inserted.results[0]?.id;
  // 술어에 걸렸다 = 그 사이 계정 총량이 찼다. 세션 삽입은 서브쿼리가 NULL을 집어
  // FK로 함께 실패하므로 반쪽 이벤트가 남지 않는다(batch가 통째로 롤백된다).
  if (id === undefined) throw new Error(`계정당 이벤트 ${MAX_EVENTS_PER_USER}개 상한`);
  return id;
}
