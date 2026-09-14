import { describe, expect, it } from 'vitest';
import { validatePresetBody } from './presets';

/**
 * BE-25 — **`origin`은 입력이 아니다.**
 *
 * 예전에는 본문에서 받아 `builtin|extracted` 중 하나인지만 봤다. 그러면 **아무나
 * 자기 프리셋을 `builtin`으로 선언**할 수 있고, 내장 5종과 구분이 사라진다.
 * 내장은 마이그레이션(0006)으로만 생기고 이 경로가 만드는 것은 항상 추출본이라,
 * 검사하는 대신 입력에서 없앴다(BE-27과 같은 판단).
 */
const base = { id: 'brand', label: '브랜드', hue: 200, chroma: 0.1 };

describe('validatePresetBody', () => {
  it('origin을 결과에 싣지 않는다 — builtin을 자칭할 통로가 없다', () => {
    expect(validatePresetBody({ ...base, origin: 'builtin' })).not.toHaveProperty('origin');
  });

  it('origin이 아무 값이어도 거절하지 않는다 — 읽지 않으니 거절할 값이 없다', () => {
    expect(() => validatePresetBody({ ...base, origin: '아무거나' })).not.toThrow();
  });

  it('나머지 검증은 그대로다', () => {
    expect(() => validatePresetBody({ ...base, id: 'BAD ID' })).toThrow(/id/);
    expect(() => validatePresetBody({ ...base, hue: 400 })).toThrow(/hue/);
    expect(() => validatePresetBody({ ...base, chroma: 0.9 })).toThrow(/chroma/);
    expect(() => validatePresetBody({ ...base, label: '' })).toThrow(/label/);
  });

  it('정상 본문은 통과한다', () => {
    expect(validatePresetBody(base)).toEqual({ ...base, sourceKey: null });
  });
});
