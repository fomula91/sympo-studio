import { describe, expect, it } from 'vitest';
import { assertEventCapacity, MAX_EVENT_BYTES, UPLOAD_RATE_POLICY, uploadCostMb } from './r2';
import { evaluateRateLimit, RateLimited, type RateKeys } from './rate-limit';

/**
 * BE-29의 상한을 고정한다. 되돌아가면 증상이 **요금 고지서**로만 드러난다 —
 * 화면은 멀쩡하고 테스트도 안 깨진다. 그래서 수치 자체를 여기 박아 둔다.
 */
describe('uploadCostMb', () => {
  it('MB 단위로 올림한다 — 1바이트도 1MB로 센다', () => {
    expect(uploadCostMb(1)).toBe(1);
    expect(uploadCostMb(1024 * 1024)).toBe(1);
    expect(uploadCostMb(1024 * 1024 + 1)).toBe(2);
    expect(uploadCostMb(20 * 1024 * 1024)).toBe(20);
  });

  it('0바이트도 최소 1이다', () => {
    // 작은 파일을 무한히 던지는 것도 Class A 연산은 똑같이 먹는다 — cost가 0이면
    // 그 경로가 rate limit을 통째로 우회한다.
    expect(uploadCostMb(0)).toBe(1);
  });
});

describe('assertEventCapacity', () => {
  const MB = 1024 * 1024;

  it('이벤트 총량이 상한을 넘으면 사유와 함께 거절한다', () => {
    expect(() => assertEventCapacity(MAX_EVENT_BYTES - MB, 2 * MB)).toThrow(/총 용량/);
  });

  it('상한과 정확히 같으면 통과한다', () => {
    expect(() => assertEventCapacity(MAX_EVENT_BYTES - MB, MB)).not.toThrow();
  });

  it('자료 60개를 4MB씩 채우는 정상 행사는 막히지 않는다', () => {
    // 실무 강의자료는 1~4MB였다 — 이 선에 정상 운영이 닿으면 상한을 잘못 잡은 것이다.
    expect(() => assertEventCapacity(59 * 4 * MB, 4 * MB)).not.toThrow();
  });
});

describe('UPLOAD_RATE_POLICY', () => {
  const keys: RateKeys = { ipHash: 'ip0000', tokenHash: 'tok000' };
  const rows = (count: number) => [
    { key_hash: 'tok000', scope: 'upload:e1', window_key: windowKey(), count },
  ];
  // rate-limit.ts의 windowKeys()와 같은 규칙 — **정책의 창 길이로 내림**한다.
  // 예전 테스트는 여기에 분 단위를 박아 둬서, 창이 5분인데 1분마다 리셋되던
  // 결함을 잡기는커녕 고정하고 있었다(`/code-review` 발견).
  function windowKey() {
    const span = UPLOAD_RATE_POLICY.windowSeconds * 1000;
    const kst = Date.now() + 9 * 60 * 60 * 1000;
    return `m:${new Date(Math.floor(kst / span) * span).toISOString().slice(0, 16)}`;
  }

  it('현장에서 자료를 연달아 올리는 정상 경로는 막지 않는다', () => {
    // 4MB짜리를 10개 올린 상태(40MB)에서 11번째가 걸리면 안 된다.
    expect(() =>
      evaluateRateLimit(rows(40), keys, UPLOAD_RATE_POLICY, 1, uploadCostMb(4 * 1024 * 1024)),
    ).not.toThrow();
  });

  it('같은 창에서 한도를 넘기면 사유가 담긴 429를 던진다', () => {
    // 20MB짜리를 반복해 덮어쓰는 경우 — 200MB를 채운 뒤 한 번 더.
    expect(() =>
      evaluateRateLimit(rows(200), keys, UPLOAD_RATE_POLICY, 1, uploadCostMb(20 * 1024 * 1024)),
    ).toThrow(RateLimited);
    expect(() =>
      evaluateRateLimit(rows(200), keys, UPLOAD_RATE_POLICY, 1, 1),
    ).toThrow(/200MB/);
  });
});
