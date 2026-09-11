import { describe, expect, it } from 'vitest';
import { resetDemoData } from './seed';

/**
 * 자정 Cron의 데모 리셋이 **사용자 계정의 이벤트를 건드리지 않는지** 고정한다.
 *
 * ADR 0007이 "별도 과제로 미루면 안 되는 종류의 결함"으로 지목한 지점이다 —
 * `events.owner_id`가 생긴 뒤로 `DELETE FROM events`가 무조건 실행되면 매일 자정
 * 사용자의 이벤트가 CASCADE로 아젠다·자료·질문·설문 응답까지 함께 사라진다.
 * 되돌아가도 테스트가 없으면 증상이 "매일 아침 데이터가 없어져 있다"로만 드러난다.
 */
function fakeDb() {
  const sql: string[] = [];
  const stmt = { bind: () => stmt };
  const db = {
    prepare(q: string) {
      sql.push(q.replace(/\s+/g, ' ').trim());
      return stmt as unknown as D1PreparedStatement;
    },
    batch: async () => [],
  };
  return { db: db as unknown as D1Database, sql };
}

describe('resetDemoData', () => {
  it('events 삭제를 owner_id IS NULL로 한정한다', async () => {
    const { db, sql } = fakeDb();
    await resetDemoData(db);

    const deletes = sql.filter((q) => /^DELETE FROM events\b/i.test(q));
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toMatch(/WHERE owner_id IS NULL/i);
  });

  it('한정 없는 DELETE FROM events를 절대 내지 않는다', async () => {
    const { db, sql } = fakeDb();
    await resetDemoData(db);

    // WHERE 없는 전체 삭제가 하나라도 있으면 실패한다.
    expect(sql.some((q) => /^DELETE FROM events\s*;?$/i.test(q))).toBe(false);
  });
});
