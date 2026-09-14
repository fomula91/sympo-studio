import { describe, expect, it } from 'vitest';
import { evaluateRateLimit, rateCounterStatement, RateLimited, type RateKeys, type RatePolicy } from './rate-limit';

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
