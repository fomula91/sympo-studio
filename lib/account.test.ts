import { describe, expect, it, vi } from 'vitest';
import { deleteAccount } from './account';

/**
 * BE-41 — 계정 삭제.
 *
 * 요점은 셋이다. ① 자료 행·이벤트·사용자를 **한 배치**(한 트랜잭션)로 지운다 — 갈라지면
 * 중간 실패 때 사용자 없는 이벤트나 자료 없는 R2 키 목록이 남는다. ② R2는 **배치가 끝난
 * 뒤에** 지운다 — 먼저 지우면 D1 실패 시 행은 남고 파일만 사라진다. ③ 사용자가 이미
 * 없으면 R2를 건드리지 않고 `null`.
 *
 * 한계(정직하게): 가짜 D1은 발행된 SQL과 호출 순서만 본다 — 실제 CASCADE 범위는 로컬
 * D1 실측으로 확인했다(Closed-Tasks BE-41).
 */
function fakeDb(results: { docs: unknown[]; events: unknown[]; user: unknown[] }) {
  const batches: string[][] = [];
  const db = {
    prepare: (q: string) => ({ bind: () => ({ __sql: q.replace(/\s+/g, ' ').trim() }) }),
    batch: async (stmts: { __sql: string }[]) => {
      batches.push(stmts.map((s) => s.__sql));
      return [{ results: results.docs }, { results: results.events }, { results: results.user }];
    },
  };
  return { db: db as unknown as D1Database, batches };
}

describe('deleteAccount', () => {
  it('자료·이벤트·사용자를 한 배치로 지우고, 그 뒤에 R2 키를 지운다', async () => {
    const order: string[] = [];
    const { db, batches } = fakeDb({
      docs: [{ r2_key: 'events/3/1-a.pdf' }, { r2_key: null }],
      events: [{ id: 3 }, { id: 4 }],
      user: [{ id: 7 }],
    });
    const origBatch = db.batch.bind(db);
    (db as unknown as { batch: typeof db.batch }).batch = (async (s: D1PreparedStatement[]) => {
      order.push('d1');
      return origBatch(s);
    }) as typeof db.batch;
    const del = vi.fn(async () => {
      order.push('r2');
    });

    const out = await deleteAccount(db, { delete: del } as unknown as R2Bucket, 7);

    expect(out).toEqual({ events: 2 });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);
    expect(batches[0][0]).toMatch(/^DELETE FROM documents .* RETURNING r2_key$/);
    expect(batches[0][2]).toMatch(/^DELETE FROM users WHERE id = \?/);
    expect(del).toHaveBeenCalledWith(['events/3/1-a.pdf']);
    expect(order).toEqual(['d1', 'r2']);
  });

  it('사용자가 이미 없으면 R2를 건드리지 않고 null이다', async () => {
    const { db } = fakeDb({ docs: [], events: [], user: [] });
    const del = vi.fn();
    expect(await deleteAccount(db, { delete: del } as unknown as R2Bucket, 7)).toBeNull();
    expect(del).not.toHaveBeenCalled();
  });
});
