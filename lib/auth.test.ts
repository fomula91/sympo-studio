import { describe, expect, it } from 'vitest';
import { AccountLinkConflict, matchOAuthState, upsertUser } from './auth';

/**
 * BE-26의 두 가지를 고정한다.
 *
 * ① **이메일로는 계정을 잇지 않는다.** 되돌아가면 같은 주소를 가진 다른 Google
 *    계정이 남의 계정에 그대로 붙는다 — 조용한 계정 탈취다.
 * ② **신규 생성이 한 batch다.** 되돌아가면 중간 실패 때 oauth 링크 없는 고아
 *    `users` 행이 남고, 그 행이 다시 ①의 이메일 매칭을 부른다.
 *
 * 한계(정직하게): 가짜 D1은 **발행된 SQL 문자열과 호출 묶음만** 본다 — `seed.test.ts`가
 * 이미 적어 둔 것과 같은 한계다. 실제 롤백 동작·UNIQUE 충돌은 로컬 D1에서 확인한다.
 */
type Rows = { linked?: { user_id: number } | null; clash?: { id: number } | null };

function fakeDb(rows: Rows = {}) {
  const sql: string[] = [];
  const batches: string[][] = [];
  const norm = (q: string) => q.replace(/\s+/g, ' ').trim();

  function stmt(q: string) {
    return {
      __sql: q,
      bind: () => stmt(q),
      first: async () => {
        if (/FROM oauth_accounts/i.test(q)) return rows.linked ?? null;
        if (/FROM users/i.test(q)) return rows.clash ?? null;
        return null;
      },
      run: async () => ({}),
    };
  }

  const db = {
    prepare(q: string) {
      const n = norm(q);
      sql.push(n);
      return stmt(n) as unknown as D1PreparedStatement;
    },
    batch: async (stmts: unknown[]) => {
      batches.push((stmts as { __sql: string }[]).map((s) => s.__sql));
      return stmts.map(() => ({ results: [{ id: 777 }] }));
    },
  };
  return { db: db as unknown as D1Database, sql, batches };
}

const who = { sub: 'google-sub-1', email: 'a@example.com', name: '김', picture: null };

describe('upsertUser', () => {
  it('oauth 링크가 있으면 그 계정을 쓰고, 충돌하지 않을 때만 이메일을 갱신한다', async () => {
    const { db, sql } = fakeDb({ linked: { user_id: 42 } });

    await expect(upsertUser(db, who)).resolves.toBe(42);

    const update = sql.find((q) => /^UPDATE users\b/i.test(q));
    expect(update).toBeDefined();
    // 이메일이 빠지면 계정에 붙은 주소가 최초 가입 시점에 굳는다.
    expect(update).toMatch(/SET email = CASE/i);
    // 다만 **다른 행이 그 주소를 쓰고 있으면 옛 주소를 유지**해야 한다 — 그냥 덮어쓰면
    // `email` UNIQUE 위반으로 이미 링크된 사람의 로그인이 실패한다. 자기 행 제외(`o.id <> ?`)가
    // 빠지면 자기 주소를 자기가 막아 이메일이 영영 갱신되지 않는다.
    expect(update).toMatch(/EXISTS \(SELECT 1 FROM users o WHERE o\.email = \? AND o\.id <> \?\)/i);
  });

  it('링크가 없을 때 같은 이메일의 계정에 붙지 않고 거절한다', async () => {
    const { db, sql, batches } = fakeDb({ linked: null, clash: { id: 7 } });

    await expect(upsertUser(db, who)).rejects.toBeInstanceOf(AccountLinkConflict);

    // 붙이지도, 만들지도 않는다.
    expect(sql.some((q) => /^INSERT INTO oauth_accounts\b/i.test(q))).toBe(false);
    expect(batches).toHaveLength(0);
  });

  it('신규 계정은 users·oauth_accounts를 같은 batch에 넣는다', async () => {
    const { db, batches } = fakeDb({ linked: null, clash: null });

    await expect(upsertUser(db, who)).resolves.toBe(777);

    // 두 INSERT가 **한 트랜잭션**이어야 고아 행이 생기지 않는다.
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0][0]).toMatch(/^INSERT INTO users\b/i);
    expect(batches[0][1]).toMatch(/^INSERT INTO oauth_accounts\b/i);
  });
});

describe('matchOAuthState', () => {
  it('쿠키의 state와 쿼리의 state가 같을 때만 verifier를 준다', () => {
    expect(matchOAuthState('abc.ver', 'abc')).toEqual({ verifier: 'ver' });
    expect(matchOAuthState('abc.ver', 'xyz')).toBeNull();
  });

  it('쿠키가 없거나 형식이 깨졌으면 통과시키지 않는다', () => {
    expect(matchOAuthState(null, 'abc')).toBeNull();
    expect(matchOAuthState('abc.ver', null)).toBeNull();
    expect(matchOAuthState('abc', 'abc')).toBeNull(); // verifier 없음
    expect(matchOAuthState('.ver', '')).toBeNull();
  });
});
