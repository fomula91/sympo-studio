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

/** 생성(POST) 때 필수인 텍스트 필드. 나머지(`venue`·`host`)는 비우거나 null로 둘 수 있다. */
const REQUIRED_TEXT_FIELDS: ReadonlySet<EventTextField> = new Set(['title', 'brand']);

/**
 * `PATCH /api/events/[id]`의 텍스트 필드 한 개를 검사해, 거절 사유를 돌려준다(통과면 `null`).
 *
 * - **타입** — `title`·`brand`는 NOT NULL이라 null·숫자를 통과시키면 UPDATE가 사유 없는
 *   500으로 터진다. `venue`·`host`는 null(비우기)을 받는다.
 * - **필수(BE-37)** — 생성 때 필수인 `title`·`brand`는 수정으로도 비울 수 없다. `""`·공백만
 *   있는 값이 그대로 저장되면 참가자 화면이 빈 행사명 자리에 데모 값을 보여줬다(FE-46).
 *   저장 값 자체는 trim하지 않는다 — 에디터가 PATCH 응답을 화면에 되돌려 쓰지 않아,
 *   서버만 다듬으면 로컬 값과 저장 값이 말없이 어긋난다.
 * - **글자 수(BE-34)** — 원문 길이로 잰다. `<input maxLength>`와 같은 기준이다(POST는
 *   trim 후 길이 — 앞뒤 공백만큼 차이가 나지만, 에디터 입력칸이 먼저 막으므로 두었다).
 *
 * 예외를 던지지 않고 문자열을 돌려주는 이유 — 이 파일은 클라이언트 번들도 읽으므로
 * 서버 전용 `BadRequest`를 가져올 수 없다(파일 머리 주석).
 */
export function eventTextPatchError(key: EventTextField, value: unknown): string | null {
  const required = REQUIRED_TEXT_FIELDS.has(key);
  if (value === null ? required : typeof value !== 'string') return `${key}는 문자열이어야 합니다.`;
  if (typeof value !== 'string') return null;
  if (required && value.trim() === '') return `${key}는 필수입니다.`;
  if (value.length > EVENT_TEXT_MAX[key]) return textTooLongMessage(key, EVENT_TEXT_MAX[key]);
  return null;
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
