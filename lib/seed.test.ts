import { describe, expect, it } from 'vitest';
import { resetDemoData } from './seed';

/**
 * 자정 Cron의 데모 리셋이 **사용자 계정의 이벤트를 건드리지 않는지**, 그리고
 * **고정 id를 재삽입하지 않는지** 고정한다. 둘 다 되돌아가면 증상이 조용하다.
 *
 * ① `owner_id IS NULL` — ADR 0007이 "별도 과제로 미루면 안 되는 결함"으로 지목했다.
 *    빠지면 매일 자정 사용자 이벤트가 CASCADE로 아젠다·자료·질문·설문까지 사라진다.
 *    증상은 "매일 아침 데이터가 없어져 있다"로만 드러난다.
 *
 * ② 고정 id 재삽입 금지 — BE-12 코드리뷰가 찾았다. ①을 넣는 순간 `VALUES (1, ...)`는
 *    **사용자가 id 1을 차지한 DB에서 반드시 터지고**(`UNIQUE constraint failed`),
 *    batch가 원자적이라 리셋 전체가 롤백되며, worker가 이어서 부르는 R2 고아 정리까지
 *    영영 멈춘다. 증상이 "리셋이 안 된다"가 아니라 "R2가 계속 찬다"로 나타난다.
 *
 * 한계(정직하게): 가짜 D1은 **발행된 SQL 문자열만** 본다. `WHERE owner_id IS NULL OR
 * owner_id = 0` 같은 그럴듯하지만 틀린 술어는 여기서 못 잡는다. 의미 검증은 실제 D1에
 * 소유 이벤트를 넣고 리셋을 돌려 확인하는 수동 절차로 보완한다.
 */
function fakeDb({ demoExists = true } = {}) {
  const sql: string[] = [];
  let nextId = 100;
  const norm = (q: string) => q.replace(/\s+/g, ' ').trim();

  const make = (q: string) => ({
    bind: () => make(q),
    // demoExists=false면 slug 조회가 빈손으로 돌아와 **INSERT 경로**가 돈다.
    // 새 DB(또는 데모가 지워진 뒤)의 첫 리셋이 그 경로다.
    first: async () =>
      !demoExists && /^SELECT id FROM events WHERE slug/i.test(q) ? null : { id: nextId++ },
  });

  const db = {
    prepare(q: string) {
      sql.push(norm(q));
      return make(norm(q)) as unknown as D1PreparedStatement;
    },
    // RETURNING id를 쓰는 세션 삽입 배치를 흉내 낸다.
    batch: async (stmts: unknown[]) => stmts.map(() => ({ results: [{ id: nextId++ }] })),
  };
  return { db: db as unknown as D1Database, sql };
}

describe('resetDemoData', () => {
  it('events 삭제를 전부 owner_id IS NULL로 한정한다', async () => {
    const { db, sql } = fakeDb();
    await resetDemoData(db);

    const deletes = sql.filter((q) => /^DELETE FROM events\b/i.test(q));
    expect(deletes.length).toBeGreaterThan(0);
    for (const q of deletes) expect(q).toMatch(/WHERE .*owner_id IS NULL/i);
  });

  it('events에 고정 id를 재삽입하지 않는다', async () => {
    // 데모가 없는 상태에서 돌려야 INSERT 경로가 실제로 발행된다 — 기본값(있음)으로는
    // 삽입문이 아예 안 나와 이 단언이 빈손으로 통과했다.
    const { db, sql } = fakeDb({ demoExists: false });
    await resetDemoData(db);

    const inserts = sql.filter((q) => /^INSERT(?: OR \w+)? INTO events\b/i.test(q));
    expect(inserts.length).toBeGreaterThan(0);
    for (const q of inserts) {
      // 컬럼 목록에 id가 들어 있으면 어떤 형태로든 id를 지정하고 있다는 뜻이다.
      expect(q).not.toMatch(/INSERT(?: OR \w+)? INTO events\s*\([^)]*\bid\b/i);
    }
  });

  /**
   * BE-28 — 리셋이 테마를 되돌리는지.
   *
   * 데모는 `owner_id IS NULL`이라 **누구나 편집할 수 있는 게스트 체험 경로**다.
   * 방문자가 테마를 바꾸는 것은 정상 동작이고, 자정에 되돌리지 못하면 그 상태가
   * 다음 방문자에게 그대로 남는다 — 데모가 매일 같은 상태로 시작한다는 전제가 깨진다.
   *
   * 가짜 D1이 SQL 문자열만 본다는 한계(파일 상단)는 여기서도 같다. 값이 맞는지는
   * `DEMO_THEME` 상수 하나를 INSERT·UPDATE가 함께 쓰는 것으로 보장하고, 여기서는
   * **두 경로가 같은 컬럼 목록을 건드리는지**를 고정한다 — 갈라진 것이 결함이었다.
   */
  const THEME_COLUMNS = ['preset_id', 'mode', 'icon_set', 'density', 'key_visual', 'kv_pattern'];

  it('데모 이벤트를 되돌리는 UPDATE가 테마 6컬럼을 전부 포함한다', async () => {
    const { db, sql } = fakeDb();
    await resetDemoData(db);

    const update = sql.find((q) => /^UPDATE events\b/i.test(q));
    expect(update).toBeDefined();
    for (const col of THEME_COLUMNS) {
      expect(update).toMatch(new RegExp(`\\b${col} = \\?`, 'i'));
    }
  });

  it('데모 이벤트 INSERT도 같은 테마 컬럼을 명시한다', async () => {
    // INSERT가 스키마 기본값에 기대고 UPDATE만 값을 쓰면 두 경로가 다시 갈라진다.
    const { db, sql } = fakeDb({ demoExists: false });
    await resetDemoData(db);

    const insert = sql.find((q) => /^INSERT(?: OR \w+)? INTO events\b/i.test(q));
    expect(insert).toBeDefined();
    for (const col of THEME_COLUMNS) expect(insert).toMatch(new RegExp(`\\b${col}\\b`, 'i'));
  });

  it('sessions에도 고정 id를 재삽입하지 않는다', async () => {
    const { db, sql } = fakeDb();
    await resetDemoData(db);

    const inserts = sql.filter((q) => /^INSERT(?: OR \w+)? INTO sessions\b/i.test(q));
    expect(inserts.length).toBeGreaterThan(0);
    for (const q of inserts) {
      expect(q).not.toMatch(/INSERT(?: OR \w+)? INTO sessions\s*\([^)]*\bid\b/i);
    }
  });
});
