import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, fetchWithTimeout } from './api';

/**
 * FE-33 — `fetchWithTimeout`이 호출자의 `signal`을 더 이상 덮어쓰지 않고 자기
 * 타임아웃 signal과 합치는지 확인한다. 내부 타임아웃(8초) 자체는 실제로 기다리지
 * 않는다 — 외부 signal로 끊었을 때 그 결과가 "시간 초과"로 둔갑하지 않는지만 본다.
 */
describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('외부 signal로 취소하면 원래 AbortError를 그대로 던진다(시간 초과로 둔갑시키지 않는다)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      ),
    );
    const controller = new AbortController();
    const promise = fetchWithTimeout('/x', { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    await expect(promise).rejects.not.toBeInstanceOf(ApiClientError);
  });

  it('이미 취소된 signal을 넘기면 fetch를 부르기 전에도 거절된다', async () => {
    // 실제 fetch는 이미 aborted된 signal을 받으면 호출 즉시(이벤트를 기다리지
    // 않고) 거절한다 — 모킹도 그 동작을 흉내 낸다.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          init?.signal?.aborted
            ? Promise.reject(new DOMException('aborted', 'AbortError'))
            : new Promise(() => {}),
      ),
    );
    const controller = new AbortController();
    controller.abort();
    await expect(fetchWithTimeout('/x', { signal: controller.signal })).rejects.toBeTruthy();
  });

  it('signal 없이 호출하면 기존 호출자는 회귀 없이 그대로 동작한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
    );
    const res = await fetchWithTimeout('/x');
    expect(res.status).toBe(200);
  });

  it('AbortSignal.any가 없는 런타임에서도(수동 combinator) 외부 signal로 취소된다', async () => {
    const originalAny = AbortSignal.any;
    // @ts-expect-error — 지원 안 하는 런타임을 흉내 낸다.
    AbortSignal.any = undefined;
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => {
                reject(new DOMException('aborted', 'AbortError'));
              });
            }),
        ),
      );
      const controller = new AbortController();
      const promise = fetchWithTimeout('/x', { signal: controller.signal });
      controller.abort();
      await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
      await expect(promise).rejects.not.toBeInstanceOf(ApiClientError);
    } finally {
      AbortSignal.any = originalAny;
    }
  });
});
