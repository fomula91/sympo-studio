/**
 * 이벤트 공개 주소(slug)의 형식·예약어 규칙 — 서버와 에디터가 함께 보는 정본 (BE-39).
 *
 * 예전에는 형식 검사가 가져오기(`lib/import.ts`)에만 있었고, `POST /api/events`는 넘겨받은
 * slug를 그대로 썼다. 운영자가 주소를 직접 고칠 수 있게 되면서(PATCH, ADR 0014) 세
 * 경로가 같은 규칙을 보도록 여기로 모았다.
 *
 * 클라이언트 번들(FE-47의 입력칸)도 이 파일을 읽으므로 **서버 전용 모듈을 import하지
 * 않는다** — 상수와 순수 함수만 둔다. 데모 주소(`DEMO_SLUG`)는 `lib/seed.ts`에 있어
 * 서버 쪽에서 따로 막는다.
 */

/** 소문자·숫자·하이픈, 80자 이내. 첫 글자는 하이픈이 아니다. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

/**
 * 최상위 정적 경로 이름. 이 이름을 slug로 쓰면 참가자 페이지(`app/[slug]`)가 정적
 * 라우트에 가려 **영영 열리지 않는다** — `/console`은 콘솔 화면이 받는다.
 * `app/`에 최상위 경로를 더하면 여기에도 더한다 — `lib/slug.test.ts`가 빠진 것을 잡는다.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'api', 'asset', 'console', 'events', 'intro', 'report',
]);

/** slug의 형식·예약어를 검사해 거절 사유를 돌려준다(통과면 `null`). 중복은 DB가 본다. */
export function slugFormatError(slug: string): string | null {
  if (!SLUG_PATTERN.test(slug)) {
    return 'slug는 소문자·숫자·하이픈으로 80자 이내여야 합니다(첫 글자는 하이픈 불가).';
  }
  if (RESERVED_SLUGS.has(slug)) return `'${slug}'는 예약된 경로라 주소로 쓸 수 없습니다.`;
  return null;
}

/**
 * 초안이 아니라 주소를 못 바꿀 때의 사유(BE-39, ADR 0014). 초안으로 되돌리면 바꿀 수
 * 있다는 것까지 알려준다 — 다만 그때 이미 공유한 링크는 열리지 않게 된다.
 */
export function slugLockedMessage(status: string): string {
  return (
    `공개 주소는 초안 상태에서만 바꿀 수 있습니다(지금: ${status}). ` +
    '초안으로 되돌리면 바꿀 수 있지만, 이미 공유한 링크는 열리지 않게 됩니다.'
  );
}
