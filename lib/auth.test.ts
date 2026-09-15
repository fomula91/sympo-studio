import { describe, expect, it } from 'vitest';
import { assertCanRead, matchOAuthState, requireUser, sessionUserIdSql, upsertUser } from './auth';

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
  it('oauth 링크가 있으면 그 계정을 쓰고 이메일을 조건 없이 갱신한다', async () => {
    const { db, sql } = fakeDb({ linked: { user_id: 42 } });

    await expect(upsertUser(db, who)).resolves.toBe(42);

    const update = sql.find((q) => /^UPDATE users\b/i.test(q));
    expect(update).toBeDefined();
    // 이메일이 빠지면 계정에 붙은 주소가 최초 가입 시점에 굳는다.
    expect(update).toMatch(/SET email = \?/i);
    // **조건 없이 쓴다.** BE-26의 `CASE` 가드는 UNIQUE를 피하려던 것이라 0014와 함께
    // 수명이 끝났고, 남겨 두면 같은 주소를 쓰는 계정이 둘 생기는 순간 한쪽 이메일이
    // 영원히 갱신되지 않는다(`/code-review` 발견).
    expect(update).not.toMatch(/CASE/i);
  });

  it('같은 이메일의 계정이 있어도 붙지 않고 별개 계정을 만든다', async () => {
    // BE-26은 여기서 거절할 수밖에 없었다(email이 UNIQUE라 두 번째 행을 못 만들었다).
    // 0014가 제약을 떼면서 모델이 제자리를 찾았다 — 이메일은 표시용이고 계정을
    // 가리키는 것은 oauth_accounts뿐이다. **붙는 것만 아니면 된다.**
    const { db, sql, batches } = fakeDb({ linked: null, clash: { id: 7 } });

    await expect(upsertUser(db, who)).resolves.toBe(777);

    // 기존 계정을 건드리지 않는다 — UPDATE도, 그 계정으로의 링크도 없다.
    expect(sql.some((q) => /^UPDATE users\b/i.test(q))).toBe(false);
    expect(batches).toHaveLength(1);
    expect(batches[0][0]).toMatch(/^INSERT INTO users\b/i);
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

  it('링크의 user_id를 이메일이 아니라 last_insert_rowid()로 집는다', async () => {
    // 이메일 서브쿼리는 0014로 `email`이 UNIQUE를 잃으면서 깨졌다 — 같은 주소의
    // **다른 계정**을 가리킬 수 있다. 되돌아가면 로그인이 조용히 남의 계정에 붙는다.
    const { db, batches } = fakeDb({ linked: null, clash: null });
    await upsertUser(db, who);

    expect(batches[0][1]).toContain('last_insert_rowid()');
    expect(batches[0][1]).not.toMatch(/SELECT id FROM users WHERE email/i);
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

/**
 * BE-13 · BE-24 — 읽기 경계.
 *
 * `owner_id`가 채워지기 시작한 뒤(BE-12)에도 이벤트 상세·운영 지표에는 **인증 호출이
 * 0건**이었다. 소유권 모델을 도입해 놓고 읽기가 뚫려 있으면 그 모델이 성립하지 않는다.
 */
function sessionDb(user: { id: number; email: string } | null) {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () =>
          user ? { id: user.id, email: user.email, name: null, avatar_url: null } : null,
      }),
    }),
  } as unknown as D1Database;
}

const withCookie = (token?: string) =>
  new Request('http://x/', token ? { headers: { cookie: `sympo_session=${token}` } } : undefined);

describe('assertCanRead', () => {
  it('소유자가 없는 이벤트(데모)는 누구나 본다', async () => {
    // 게스트 체험 경로가 여기에 기댄다 — 잠그면 데모가 사라진다.
    await expect(assertCanRead(sessionDb(null), withCookie(), null)).resolves.toBeUndefined();
  });

  it('소유자 본인은 본다', async () => {
    const db = sessionDb({ id: 7, email: 'a@example.com' });
    await expect(assertCanRead(db, withCookie('t'), 7)).resolves.toBeUndefined();
  });

  it('남의 것이면 403이 아니라 404다 — 존재를 흘리지 않는다', async () => {
    const db = sessionDb({ id: 7, email: 'a@example.com' });
    await expect(assertCanRead(db, withCookie('t'), 9)).rejects.toMatchObject({ status: 404 });
  });

  it('비로그인은 소유자가 있는 이벤트를 못 본다', async () => {
    await expect(assertCanRead(sessionDb(null), withCookie(), 7)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('requireUser', () => {
  it('비로그인은 401이다 — 생성 경로만 404가 아닌 이유는 숨길 존재가 없어서다', async () => {
    await expect(requireUser(sessionDb(null), withCookie())).rejects.toMatchObject({ status: 401 });
  });

  it('로그인했으면 사용자를 돌려준다', async () => {
    const db = sessionDb({ id: 7, email: 'a@example.com' });
    await expect(requireUser(db, withCookie('t'))).resolves.toMatchObject({ id: 7 });
  });
});

describe('sessionUserIdSql', () => {
  it('만료를 본다 — 빠지면 죽은 세션으로 남의 것이 열린다', () => {
    expect(sessionUserIdSql(2)).toMatch(/expires_at > datetime\('now'\)/);
  });

  it('자리번호를 호출부가 정한다 — 하드코딩하면 바인딩 순서가 어긋난다', () => {
    expect(sessionUserIdSql(2)).toContain('?2');
    expect(sessionUserIdSql(5)).toContain('?5');
  });
});
