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
/**
 * `demoExists: false`는 **데모 행이 아직 없는 DB**를 흉내 낸다 — 그때만 `resetDemoData`가
 * INSERT 분기를 탄다. 기본값(true)에서는 조회가 항상 행을 돌려줘 UPDATE 분기만 돈다.
 * BE-28이 두 분기가 같은 테마 컬럼을 다루는지 봐야 해서 둘 다 필요해졌다.
 */
function fakeDb({ demoExists = true }: { demoExists?: boolean } = {}) {
  const sql: string[] = [];
  let nextId = 100;
  const norm = (q: string) => q.replace(/\s+/g, ' ').trim();

  const make = (q: string) => ({
    bind: () => make(q),
    first: async () =>
      !demoExists && /^SELECT id FROM events\b/i.test(q) ? null : { id: nextId++ },
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
    const { db, sql } = fakeDb();
    await resetDemoData(db);

    const inserts = sql.filter((q) => /^INSERT(?: OR \w+)? INTO events\b/i.test(q));
    for (const q of inserts) {
      // 컬럼 목록에 id가 들어 있으면 어떤 형태로든 id를 지정하고 있다는 뜻이다.
      expect(q).not.toMatch(/INSERT(?: OR \w+)? INTO events\s*\([^)]*\bid\b/i);
    }
  });

  /**
   * BE-28 — **테마 6컬럼이 UPDATE 목록에 있어야 한다.**
   *
   * 데모는 `owner_id IS NULL`이라 누구든 편집할 수 있다(게스트 체험이 여기 기댄다).
   * 이 컬럼들이 빠지면 방문자가 바꾼 테마를 자정 리셋이 못 되돌려 **다음 방문자에게
   * 그대로 남는다.** 증상이 "리셋이 안 돈다"가 아니라 "데모가 남이 바꿔 놓은 모습"으로만
   * 드러나서 조용하다.
   *
   * 한계는 위 주석과 같다 — 가짜 D1은 SQL 문자열만 본다. 값이 실제로 초기값으로
   * 돌아오는지는 로컬 D1 실측으로 확인했다([[log]] 2026-09-16).
   */
  const THEME_COLUMNS = ['preset_id', 'mode', 'icon_set', 'density', 'key_visual', 'kv_pattern'];

  it('데모 UPDATE가 테마 6컬럼을 되돌린다', async () => {
    const { db, sql } = fakeDb();
    await resetDemoData(db);

    const updates = sql.filter((q) => /^UPDATE events\b/i.test(q));
    expect(updates.length).toBeGreaterThan(0);
    // 데모 행을 되돌리는 UPDATE는 owner_id를 NULL로 내리는 그것이다.
    const demoUpdate = updates.find((q) => /SET owner_id = NULL/i.test(q));
    expect(demoUpdate).toBeDefined();
    for (const col of THEME_COLUMNS) {
      expect(demoUpdate).toMatch(new RegExp(`\\b${col} = \\?`, 'i'));
    }
  });

  it('INSERT와 UPDATE가 같은 테마 컬럼을 다룬다 — 한쪽만 바뀌면 다시 어긋난다', async () => {
    // 데모 행이 없는 DB라야 INSERT 분기가 돈다.
    const { db, sql } = fakeDb({ demoExists: false });
    await resetDemoData(db);

    const insert = sql.find((q) => /^INSERT(?: OR \w+)? INTO events\b/i.test(q));
    const demoUpdate = sql.find((q) => /^UPDATE events\b/i.test(q) && /SET owner_id = NULL/i.test(q));
    expect(insert).toBeDefined();
    expect(demoUpdate).toBeDefined();
    // 이 버그의 뿌리가 "INSERT는 스키마 DEFAULT에 기대고 UPDATE는 명시해야 한다"는
    // 보이지 않는 비대칭이었다. 양쪽이 같은 컬럼을 들고 있어야 그 비대칭이 안 생긴다.
    for (const col of THEME_COLUMNS) {
      expect(insert).toMatch(new RegExp(`\\b${col}\\b`, 'i'));
      expect(demoUpdate).toMatch(new RegExp(`\\b${col} = \\?`, 'i'));
    }
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
