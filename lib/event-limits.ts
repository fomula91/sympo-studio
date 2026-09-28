/**
 * 이벤트 기본 정보의 입력 상한 — 서버와 에디터가 함께 보는 정본 (BE-34).
 *
 * 예전에는 이 값이 두 곳에 **손으로** 적혀 있었다 — 가져오기 검증(`lib/import.ts`)과
 * 에디터 입력칸(`lib/data.ts`의 `FIELD_DEFS.maxLength`). 정작 `POST`·`PATCH
 * /api/events`는 길이를 보지 않아, API를 직접 부르면 한도를 넘는 값이 그대로 D1에
 * 들어가고 slug·헤더·참가자 화면으로 번졌다. 그렇게 저장된 값은 에디터에서
 * `150/120`처럼 초과 상태로 열린다.
 *
 * 클라이언트 번들(`lib/data.ts`)도 이 파일을 읽으므로 **서버 전용 모듈을 import하지
 * 않는다** — 상수와 순수 함수만 둔다. `BadRequest`는 호출하는 쪽에서 던진다.
 */

/** 텍스트 필드별 최대 글자 수(UTF-16 단위 — `<input maxLength>`와 같은 기준). */
export const EVENT_TEXT_MAX = {
  title: 120,
  brand: 80,
  venue: 120,
  host: 80,
} as const;

export type EventTextField = keyof typeof EVENT_TEXT_MAX;

export function isEventTextField(key: string): key is EventTextField {
  return Object.hasOwn(EVENT_TEXT_MAX, key);
}

/**
 * 예상 참여 인원의 상한. 에디터 입력칸이 숫자 6자리까지라 그 최댓값에 맞춘다.
 * 응답률·참석률의 분모라 음수·소수도 받지 않는다(BE-19 ②).
 */
export const MAX_CAPACITY = 999_999;

/** 에디터 입력칸의 `maxLength` — `MAX_CAPACITY`의 자릿수. */
export const CAPACITY_MAX_DIGITS = String(MAX_CAPACITY).length;

export function isValidCapacity(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_CAPACITY;
}

export const capacityBadRequestMessage = (field = 'capacity') =>
  `${field}는 0 이상 ${MAX_CAPACITY} 이하의 정수여야 합니다(응답률·참석률의 분모).`;

export const textTooLongMessage = (field: string, max: number) =>
  `${field}는 ${max}자 이하여야 합니다.`;
