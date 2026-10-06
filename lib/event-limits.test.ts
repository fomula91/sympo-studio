import { describe, expect, it } from 'vitest';
import { FIELD_DEFS } from './data';
import {
  CAPACITY_MAX_DIGITS, EVENT_TEXT_MAX, MAX_CAPACITY, eventTextPatchError, isEventTextField,
  isValidCapacity,
} from './event-limits';
import { validateImportBody } from './import';

/**
 * BE-34 — 이벤트 기본 정보의 입력 상한.
 *
 * 요점은 **한 벌**이라는 것이다. 에디터·가져오기·API가 각자 상한을 적으면 한쪽에서
 * 통과한 값이 다른 쪽에서 거절되거나 `150/120`처럼 초과 상태로 열린다.
 */
describe('event-limits', () => {
  it('에디터 입력칸의 maxLength가 서버 상한과 같다', () => {
    for (const f of FIELD_DEFS) {
      if (isEventTextField(f.k)) expect(f.maxLength).toBe(EVENT_TEXT_MAX[f.k]);
    }
    expect(FIELD_DEFS.find((f) => f.k === 'cap')?.maxLength).toBe(CAPACITY_MAX_DIGITS);
    // 입력칸 자릿수로 칠 수 있는 최댓값이 곧 서버 상한이어야 한다.
    expect(isValidCapacity(Number('9'.repeat(CAPACITY_MAX_DIGITS)))).toBe(true);
  });

  it('isEventTextField는 상한이 있는 텍스트 필드만 고른다', () => {
    expect(isEventTextField('title')).toBe(true);
    expect(isEventTextField('date')).toBe(false);
    // 프로토타입 키에 속지 않는다.
    expect(isEventTextField('toString')).toBe(false);
  });

  it('capacity는 0 이상 상한 이하의 정수만 받는다', () => {
    expect(isValidCapacity(0)).toBe(true);
    expect(isValidCapacity(MAX_CAPACITY)).toBe(true);
    expect(isValidCapacity(MAX_CAPACITY + 1)).toBe(false);
    expect(isValidCapacity(-1)).toBe(false);
    expect(isValidCapacity(1.5)).toBe(false);
    expect(isValidCapacity('10')).toBe(false);
  });

  it('가져오기 경로가 같은 상한을 쓴다 — 경계값은 통과, 한 글자 넘으면 거절', () => {
    const base = { clientRef: 'local-ref-001', brand: 'MERIDIAN', title: '행사' };
    for (const field of Object.keys(EVENT_TEXT_MAX) as (keyof typeof EVENT_TEXT_MAX)[]) {
      const max = EVENT_TEXT_MAX[field];
      expect(() =>
        validateImportBody({ events: [{ ...base, [field]: 'a'.repeat(max) }] }),
      ).not.toThrow();
      expect(() =>
        validateImportBody({ events: [{ ...base, [field]: 'a'.repeat(max + 1) }] }),
      ).toThrow(new RegExp(`${field}는 ${max}자 이하`));
    }
    expect(() =>
      validateImportBody({ events: [{ ...base, capacity: MAX_CAPACITY + 1 }] }),
    ).toThrow(/capacity/);
  });
});

/**
 * BE-37 — 생성 때 필수인 행사명·브랜드명은 수정(PATCH)으로도 비울 수 없다.
 *
 * 되돌아가면 에디터에서 행사명을 지우는 순간 `""`가 저장되고, 참가자 화면은 빈 자리에
 * 데모 값("MERIDIAN 심포지엄")을 보여준다(FE-46).
 */
describe('eventTextPatchError', () => {
  it('title·brand는 빈 문자열·공백만 있는 값을 거절한다', () => {
    expect(eventTextPatchError('title', '')).toBe('title는 필수입니다.');
    expect(eventTextPatchError('brand', '   ')).toBe('brand는 필수입니다.');
  });

  it('title·brand는 null도 거절한다 — NOT NULL 컬럼이다', () => {
    expect(eventTextPatchError('title', null)).toMatch(/문자열/);
  });

  it('venue·host는 지금처럼 비우거나 null로 둘 수 있다', () => {
    expect(eventTextPatchError('venue', '')).toBeNull();
    expect(eventTextPatchError('host', null)).toBeNull();
  });

  it('문자열이 아니면 거절한다', () => {
    expect(eventTextPatchError('venue', 3)).toMatch(/문자열/);
  });

  it('글자 수 상한은 그대로다 — 경계값 통과, 한 글자 넘으면 거절', () => {
    expect(eventTextPatchError('title', 'a'.repeat(EVENT_TEXT_MAX.title))).toBeNull();
    expect(eventTextPatchError('title', 'a'.repeat(EVENT_TEXT_MAX.title + 1))).toMatch(/120자 이하/);
  });

  it('앞뒤 공백이 있어도 내용이 있으면 통과한다 — 저장 값은 다듬지 않는다', () => {
    expect(eventTextPatchError('brand', ' MERIDIAN ')).toBeNull();
  });
});
