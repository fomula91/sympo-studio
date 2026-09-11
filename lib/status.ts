/**
 * 이벤트 상태 모델 — **발행 상태와 행사 시점을 가른다** (BE-23).
 *
 * 원래 하나의 목록이었다: `초안|검수대기|공개예정|진행중|완료|보관`. 그 안에 서로
 * 다른 세 축이 섞여 있었던 것이 "누가 언제 상태를 바꾸는가"가 끝내 정해지지 않던
 * 원인이다(FE-24가 등록한 문제).
 *
 * - `초안`·`검수대기`·`보관` — **사람**이 정한다.
 * - `공개예정`·`진행중`·`완료` — **달력**이 정한다. 이 셋의 차이는 오직 `event_date`와
 *   오늘의 관계이고, 사람이 고를 것이 없다.
 *
 * 두 축이 한 칸을 쓰면 **모순이 표현 가능해진다** — 지난 날짜인데 `진행중`인 이벤트가
 * 실제로 있었다(시드 데모, `lib/seed.ts`). 그리고 공개 게이트(`PUBLIC_STATUSES`)는
 * 애초에 시점 셋을 구분하지 않았다 — 게이트가 묻는 것은 "발행됐나" 하나뿐이다.
 *
 * 그래서 시점을 **저장하지 않고 파생**한다. 전환할 값이 없으니 자동 전환 Cron도,
 * 수동값과 자동값의 우선순위 규칙도 필요 없어진다. 목록 필터와 인덱스는 그대로
 * 산다 — 발행 상태는 여전히 저장값이고, 시점 조건은 `event_date` 범위라
 * `idx_events_status(status, event_date)`가 정확히 그 조합을 덮는다.
 *
 * 목록이 DB의 CHECK 제약이 아니라 여기 있는 이유는 [[0005-d1-schema]] §status가
 * 판정했다 — SQLite에서 CHECK 변경은 테이블 재생성이고, 상태 목록은 제품 정의라
 * 바뀔 여지가 있다(실제로 이번에 바뀌었다). **"검증은 애플리케이션 층에 둔다"가 그
 * ADR의 결론인데 실제로 둔 적이 없어** `PATCH`·`POST` 양쪽이 아무 문자열이나 저장하고
 * 있었다. 그 구멍도 여기서 함께 막는다.
 *
 * **의존이 없는 모듈로 둔다.** 서버(쓰기 검증·공개 게이트)와 클라이언트(필터 칩·배지)가
 * 함께 쓰는데, `lib/db.ts`에 두면 클라이언트가 Cloudflare 컨텍스트를 끌어오고
 * `lib/data.ts`에 두면 라우트가 시드 데이터를 번들에 싣는다.
 */

// ---------------------------------------------------------------------------
// 발행 상태 — 저장된다. 사람이 바꾼다.
// ---------------------------------------------------------------------------

export const EVENT_STATUSES = ['초안', '검수대기', '공개', '보관'] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export function isEventStatus(value: unknown): value is EventStatus {
  return typeof value === 'string' && (EVENT_STATUSES as readonly string[]).includes(value);
}

/** 검증 실패 문구를 한 곳에서 만든다 — 라우트마다 손으로 적으면 목록이 갈라진다. */
export function statusBadRequestMessage(): string {
  return `status는 ${EVENT_STATUSES.join('|')} 중 하나여야 합니다.`;
}

/**
 * 참가자에게 노출해도 되는 발행 상태 (BE-7에서 시작, BE-16에서 승격, BE-23에서 축소).
 *
 * BE-7이 공개 조회에만 적용하던 판정을 올린 이유: **참가자가 쓰는 경로가 그것 하나가
 * 아니었다.** Q&A·설문 라우트는 engage 토글만 보고 상태를 안 봐서, 운영자가 행사를
 * '보관'으로 바꿔도 열린 페이지에서 계속 D1에 기록할 수 있었다(PR #9 교차 리뷰에서
 * Codex 발견). engage 토글은 "이 행사가 참여를 받는가"이지 "이 행사가 공개 상태인가"가
 * 아니다.
 *
 * BE-23 이전에는 `{공개예정, 진행중, 완료}`였다. 셋을 `공개` 하나로 접었으므로 원소가
 * 하나지만 Set을 유지한다 — 소비처(`assertPublicEvent`, `/api/public/[slug]`)의 판정
 * 형태를 흔들지 않고, 나중에 공개로 치는 상태가 늘어도 여기만 고치면 된다.
 */
export const PUBLIC_STATUSES: ReadonlySet<string> = new Set<string>(['공개']);

// ---------------------------------------------------------------------------
// 행사 시점 — 저장하지 않는다. event_date에서 파생된다.
// ---------------------------------------------------------------------------

export const EVENT_PHASES = ['예정', '당일', '종료'] as const;

export type EventPhase = (typeof EVENT_PHASES)[number];

/**
 * KST 기준 오늘(`YYYY-MM-DD`).
 *
 * 워커는 UTC로 돌고 `event_date`는 한국 날짜다 — UTC 날짜로 비교하면 매일 09:00 KST
 * 이전 9시간 동안 하루 전 날짜로 판정해, 행사 당일 아침에 `예정`으로 보인다.
 */
export function todayKst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 행사 시점. 날짜가 없으면 `null` — "아직 날짜를 안 정한 이벤트"는 시점이 없는 것이지
 * `예정`인 것이 아니다(초안 단계에서 날짜가 비어 있는 것이 정상 흐름이다).
 *
 * `YYYY-MM-DD`는 사전순 비교가 곧 날짜순 비교라 Date로 파싱하지 않는다 — 파싱하면
 * 타임존이 다시 끼어든다.
 */
export function eventPhase(eventDate: string | null | undefined, today: string = todayKst()): EventPhase | null {
  if (!eventDate) return null;
  if (eventDate > today) return '예정';
  if (eventDate === today) return '당일';
  return '종료';
}
