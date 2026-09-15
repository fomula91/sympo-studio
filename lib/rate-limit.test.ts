import { describe, expect, it } from 'vitest';
import {
  evaluateRateLimit, rateCounterStatement, RateLimited, reserveRateLimit,
  type RateKeys, type RatePolicy,
} from './rate-limit';

/**
 * **창 길이가 정책의 값이어야 한다**는 것을 고정한다.
 *
 * `windowKeys()`는 원래 분 단위 스탬프를 버킷 이름으로 썼고 `windowSeconds`는 카운터
 * TTL에만 쓰였다. 정책이 전부 60초인 동안은 우연히 맞았지만, BE-29가 처음으로 300초를
 * 쓰면서 **문구는 "5분에 200MB"인데 실제로는 1분마다 리셋**되는 5배 느슨한 상태가
 * 됐다(`/code-review` 발견). 되돌아가면 같은 방식으로 조용히 어긋난다.
 */
const policy = (windowSeconds: number): RatePolicy => ({
  scope: 'upload',
  windowSeconds,
  maxPerWindow: 10,
  maxPerDay: 100,
  ipMaxPerWindow: 20,
  ipMaxPerDay: 200,
  messages: { window: 'w', day: 'd', ipWindow: 'iw', ipDay: 'id' },
});

const keys: RateKeys = { ipHash: 'ip', tokenHash: 'tok' };

/** 발행된 SQL의 바인딩에서 창 이름을 꺼낸다 — windowKeys()는 모듈 내부 함수다. */
function windowNameAt(p: RatePolicy, now: number): string {
  let bound: unknown[] = [];
  const db = {
    prepare: () => ({ bind: (...args: unknown[]) => ((bound = args), {}) }),
  } as unknown as D1Database;
  rateCounterStatement(db, keys, p, 1, now);
  // bind 순서: tokenHash, ipHash, tokenScope, ipScope, dayKey, windowKey
  return String(bound[5]);
}

describe('창 버킷', () => {
  const base = Date.UTC(2026, 8, 14, 3, 2, 30); // KST 12:02:30

  it('60초 정책은 분 경계로 갈린다 (기존 동작 불변)', () => {
    const p = policy(60);
    expect(windowNameAt(p, base)).toBe('m:2026-09-14T12:02');
    expect(windowNameAt(p, base + 60_000)).toBe('m:2026-09-14T12:03');
  });

  it('300초 정책은 5분 경계로만 갈린다', () => {
    const p = policy(300);
    // 12:02:30과 1분 뒤(12:03:30)는 **같은 창**이어야 한다 — 예전에는 갈렸다.
    expect(windowNameAt(p, base)).toBe('m:2026-09-14T12:00');
    expect(windowNameAt(p, base + 60_000)).toBe('m:2026-09-14T12:00');
    // 5분 경계를 넘으면 그때 갈린다.
    expect(windowNameAt(p, base + 5 * 60_000)).toBe('m:2026-09-14T12:05');
  });
});

describe('evaluateRateLimit', () => {
  it('넘긴 시각 기준으로 판정한다 — 읽기·판정·증가가 같은 창을 보게', () => {
    const p = policy(300);
    const rows = [
      { key_hash: 'tok', scope: 'upload:e1', window_key: 'm:2026-09-14T12:00', count: 10 },
    ];
    const base = Date.UTC(2026, 8, 14, 3, 2, 30);
    // 같은 창이면 한도에 걸린다.
    expect(() => evaluateRateLimit(rows, keys, p, 1, 1, base)).toThrow(RateLimited);
    // 창이 바뀌면 통과한다 — 이 경계를 라우트가 요청 시작 시각으로 고정해야 한다.
    expect(() => evaluateRateLimit(rows, keys, p, 1, 1, base + 5 * 60_000)).not.toThrow();
  });
});

/**
 * BE-31 — 예약(admission).
 *
 * 여기서 고정하는 것은 **SQL 의미가 아니라 호출 규약**이다(가짜 D1은 SQL을 실행하지
 * 않는다). SQL 쪽(게이트가 거짓이면 어떤 버킷도 안 오른다 / 참이면 전부 정확히 cost만큼
 * 오른다)은 로컬 D1 실측으로 확인했고 근거는 [[0011-upload-admission]]에 있다.
 */
function fakeDb(granted: { key_hash: string; scope: string; window_key: string }[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const batched: { sql: string; params: unknown[] }[][] = [];
  const stmt = (sql: string) => ({
    bind: (...params: unknown[]) => {
      const rec = { sql, params };
      return {
        ...rec,
        all: async () => {
          calls.push(rec);
          return { results: granted };
        },
      };
    },
  });
  const db = {
    prepare: stmt,
    batch: async (sts: { sql: string; params: unknown[] }[]) => {
      batched.push(sts);
      return sts.map(() => ({ meta: { changes: 1 } }));
    },
  } as unknown as D1Database;
  return { db, calls, batched };
}

const admissionPolicy = policy(300);

describe('reserveRateLimit (BE-31)', () => {
  const now = Date.UTC(2026, 8, 14, 3, 2, 30);
  const bucketsOf = (p: RatePolicy, k: RateKeys) => {
    // 토큰이 있으면 4개(토큰 창·일, IP 창·일), 없으면 IP 2개.
    return k.tokenHash ? 4 : 2;
  };

  it('네 버킷을 한 문장으로 예약한다 — 버킷마다 따로 보내지 않는다', async () => {
    const all = [
      { key_hash: 'tok', scope: 'upload:e1', window_key: 'm:2026-09-14T12:00' },
      { key_hash: 'tok', scope: 'upload:e1', window_key: 'd:2026-09-14' },
      { key_hash: 'ip', scope: 'upload', window_key: 'm:2026-09-14T12:00' },
      { key_hash: 'ip', scope: 'upload', window_key: 'd:2026-09-14' },
    ];
    const { db, calls, batched } = fakeDb(all);
    await reserveRateLimit(db, keys, admissionPolicy, 1, 3, now);
    // 예약은 요청당 D1 왕복 1회다.
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('ON CONFLICT');
    expect(calls[0].sql).toContain('RETURNING');
    // 통과했으면 보상(release)을 부르지 않는다.
    expect(batched).toHaveLength(0);
    expect(bucketsOf(admissionPolicy, keys)).toBe(4);
  });

  it('한도를 cost와 함께 게이트에 싣는다 — 한도가 바뀌면 이 바인딩이 따라간다', async () => {
    const { db, calls } = fakeDb([
      { key_hash: 'tok', scope: 'upload:e1', window_key: 'm:2026-09-14T12:00' },
      { key_hash: 'tok', scope: 'upload:e1', window_key: 'd:2026-09-14' },
      { key_hash: 'ip', scope: 'upload', window_key: 'm:2026-09-14T12:00' },
      { key_hash: 'ip', scope: 'upload', window_key: 'd:2026-09-14' },
    ]);
    await reserveRateLimit(db, keys, admissionPolicy, 1, 7, now);
    const p = calls[0].params;
    // 첫 바인딩은 SELECT가 싣는 cost다.
    expect(p[0]).toBe(7);
    // 게이트 바인딩 끝에 (cost, limit) 쌍이 정책 한도 그대로 들어간다.
    expect(p).toContain(admissionPolicy.maxPerWindow);
    expect(p).toContain(admissionPolicy.maxPerDay);
    expect(p).toContain(admissionPolicy.ipMaxPerWindow);
    expect(p).toContain(admissionPolicy.ipMaxPerDay);
  });

  it('게이트가 막으면(0행) 거절한다 — 되돌릴 것도 없다', async () => {
    const { db, batched } = fakeDb([]);
    await expect(reserveRateLimit(db, keys, admissionPolicy, 1, 3, now)).rejects.toThrow(RateLimited);
    // 오른 버킷이 없으므로 보상 batch가 나가면 안 된다 — 거절 경로의 쓰기 비용이 0이어야 한다.
    expect(batched).toHaveLength(0);
  });

  it('일부만 올랐으면 **오른 것만** 되돌리고 거절한다 (엔진 동작이 달라져도 어긋나지 않게)', async () => {
    const partial = [{ key_hash: 'tok', scope: 'upload:e1', window_key: 'm:2026-09-14T12:00' }];
    const { db, batched } = fakeDb(partial);
    await expect(reserveRateLimit(db, keys, admissionPolicy, 1, 3, now)).rejects.toThrow(RateLimited);
    expect(batched).toHaveLength(1);
    expect(batched[0]).toHaveLength(1);
    expect(batched[0][0].sql).toContain('MAX(0, count - ?)');
    // 되돌리는 양은 예약한 cost 그대로다.
    expect(batched[0][0].params[0]).toBe(3);
  });

  it('토큰이 없으면 IP 단독 2버킷으로 강등한다 — evaluateRateLimit과 같은 판정', async () => {
    const ipOnly: RateKeys = { ipHash: 'ip', tokenHash: null };
    const { db, calls } = fakeDb([
      { key_hash: 'ip', scope: 'upload', window_key: 'm:2026-09-14T12:00' },
      { key_hash: 'ip', scope: 'upload', window_key: 'd:2026-09-14' },
    ]);
    await reserveRateLimit(db, ipOnly, admissionPolicy, 1, 1, now);
    // UNION ALL이 하나뿐 = 행 2개.
    expect(calls[0].sql.match(/UNION ALL/g) ?? []).toHaveLength(1);
    // 한도는 브라우저 버킷과 같게 쓴다(토큰 생략이 우회가 되면 안 된다).
    expect(calls[0].params).toContain(admissionPolicy.maxPerWindow);
    expect(calls[0].params).not.toContain(admissionPolicy.ipMaxPerWindow);
    expect(bucketsOf(admissionPolicy, ipOnly)).toBe(2);
  });

  it('release는 예약한 버킷 전부를 되돌린다', async () => {
    const all = [
      { key_hash: 'tok', scope: 'upload:e1', window_key: 'm:2026-09-14T12:00' },
      { key_hash: 'tok', scope: 'upload:e1', window_key: 'd:2026-09-14' },
      { key_hash: 'ip', scope: 'upload', window_key: 'm:2026-09-14T12:00' },
      { key_hash: 'ip', scope: 'upload', window_key: 'd:2026-09-14' },
    ];
    const { db, batched } = fakeDb(all);
    const reservation = await reserveRateLimit(db, keys, admissionPolicy, 1, 5, now);
    await reservation.release();
    expect(batched).toHaveLength(1);
    expect(batched[0]).toHaveLength(4);
    expect(batched[0].every((s) => s.params[0] === 5)).toBe(true);
  });
});
