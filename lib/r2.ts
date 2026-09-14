import { ApiError, BadRequest } from './db';
import type { RatePolicy } from './rate-limit';

// 강의자료 원본 저장·전달 (BE-6).
//
// 원칙은 ADR 0002 그대로다 — **저장·조회는 서버, 렌더링은 클라이언트.** 서버는
// 바이트를 받아 넣고 스트림으로 내보내기만 하고 PDF를 열어 보지 않는다(페이지 수
// 추출·썸네일·워터마크 전부 안 한다). 무료 티어가 인색한 자원은 저장 공간이
// 아니라 CPU 시간이라서다. 렌더링은 PDF.js 클라이언트 몫(FE-6).

/**
 * 파일 하나의 상한.
 *
 * 강의자료 PDF는 실무에서 1~4MB였다. 20MB는 넉넉한 여유이자 **요금 사고의 1차
 * 방어선**이다 — R2에 결제 수단이 붙어 있으므로(2026-09-02) 저장량이 새는 경로를
 * 코드에서 먼저 막는다. 대시보드 사용량 알람은 사후 통지라 이것과 짝이다.
 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * 이벤트 하나가 R2에 차지할 수 있는 총량 (BE-29).
 *
 * 파일당 20MB만으로는 저장량이 안 막힌다 — `MAX_DOCUMENTS`가 60이라 이벤트 하나가
 * **1.2GB**까지 갈 수 있고, 이벤트 생성은 아직 무인증이라(BE-13) 개수에 상한이 없다.
 * 무료 R2가 10GB이므로 이벤트 9개면 넘긴다.
 *
 * 300MB는 실측 기준이다 — 실무 강의자료 PDF는 1~4MB였고([[field-experience]]),
 * 60개를 다 채워도 60~240MB다. 즉 **정상 행사는 닿지 않고 남용만 닿는 선**이다.
 */
export const MAX_EVENT_BYTES = 300 * 1024 * 1024;

/**
 * 업로드 rate limit (BE-29, ADR 0006·0008).
 *
 * **한도의 단위가 다른 정책과 다르다 — 여기서는 쓰기 행 수가 아니라 MB다.**
 * 지키려는 자원이 D1 행이 아니라 R2의 저장량·Class A 연산이기 때문이다. 요청 수로
 * 세면 "1MB를 20번"과 "20MB를 20번"이 같은 비용으로 취급되는데 실제 비용은 20배
 * 차이다. `uploadCostMb()`가 요청 하나의 cost를 MB로 환산한다.
 *
 * **키는 `x-client-token` + IP 2층이다.** user_id를 못 쓴다 — 데모 이벤트는
 * `owner_id IS NULL`이라 `assertCanEdit`를 누구든 통과하고(게스트 체험이 여기 기대는
 * 의도된 설계다), 즉 **익명 업로드가 정상 경로**다.
 *
 * **창이 5분인 이유**: 업로드는 Q&A처럼 초 단위로 반복되는 행위가 아니다. 60초 창에
 * 맞추면 "연자 자료를 연달아 올린다"는 정상 경로가 걸린다 — 실무에서 연자가 늦게
 * 도착해 행사 중에 올리는 것이 이 라우트의 전제다([[field-experience]]).
 */
export const UPLOAD_RATE_POLICY: RatePolicy = {
  scope: 'upload',
  windowSeconds: 300,
  // 5분에 200MB — 4MB짜리 50개, 20MB짜리 10개. 정상 현장 시나리오의 몇 배다.
  maxPerWindow: 200,
  maxPerDay: 1000,
  ipMaxPerWindow: 400,
  ipMaxPerDay: 2000,
  messages: {
    window: '업로드가 잠시 몰렸습니다. 5분에 200MB까지 올릴 수 있습니다.',
    day: '오늘 올릴 수 있는 용량(1GB)을 모두 사용했습니다.',
    ipWindow: '현재 네트워크에서 업로드가 몰렸습니다. 잠시 후 다시 시도해 주세요.',
    ipDay: '오늘 이 네트워크에서 올릴 수 있는 용량을 모두 사용했습니다.',
  },
};

/**
 * 요청 하나의 rate limit cost를 MB로 환산한다. 올림이라 0바이트가 아닌 한 최소 1이다 —
 * 작은 파일을 무한히 던지는 것도 Class A 연산은 똑같이 먹기 때문이다.
 */
export function uploadCostMb(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / (1024 * 1024)));
}

/**
 * 이 이벤트에 `incoming` 바이트를 더 넣을 수 있는지 본다 (BE-29).
 *
 * `existingBytes`는 **교체 대상 자료를 뺀** 나머지 합이다 — 같은 자료를 다시 올리면
 * 옛 객체가 지워지므로 그 몫은 이번 파일이 되돌려 받는다. 빼지 않으면 큰 자료를
 * 한 번 올린 순간 그 자료를 고칠 수 없게 된다.
 */
export function assertEventCapacity(existingBytes: number, incoming: number): void {
  if (existingBytes + incoming > MAX_EVENT_BYTES) {
    const limitMb = Math.floor(MAX_EVENT_BYTES / 1024 / 1024);
    const usedMb = Math.floor(existingBytes / 1024 / 1024);
    throw new BadRequest(
      `이벤트 하나에 올릴 수 있는 총 용량(${limitMb}MB)을 넘습니다. 현재 ${usedMb}MB를 사용 중입니다.`,
    );
  }
}

/** 서명 URL 유효 시간. 참가자가 목록을 받아 바로 열기에 충분하고, 링크가 새도 곧 죽는다. */
export const SIGNED_URL_TTL_SECONDS = 600;

const ALLOWED_TYPES = ['application/pdf'];

/** R2 객체 키. 이벤트별 프리픽스라 Cron이 "없는 이벤트의 객체"를 프리픽스로 찾아 지운다. */
export function documentKey(eventId: number, documentId: number): string {
  // 같은 자료를 다시 올리면 키가 바뀐다 — 캐시·서명 URL이 옛 파일을 물지 않게.
  const nonce = crypto.randomUUID().slice(0, 8);
  return `events/${eventId}/${documentId}-${nonce}.pdf`;
}

export function eventPrefix(eventId: number): string {
  return `events/${eventId}/`;
}

/** 키에서 이벤트 id를 되읽는다. Cron의 고아 객체 정리가 쓴다. */
export function eventIdFromKey(key: string): number | null {
  const m = /^events\/(\d+)\//.exec(key);
  return m ? Number(m[1]) : null;
}

export function assertUploadable(contentType: string | null, size: number | null): string {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.includes(type)) {
    throw new BadRequest(`PDF만 올릴 수 있습니다(받은 형식: ${type || '없음'}).`);
  }
  if (size !== null && size > MAX_FILE_BYTES) {
    throw new BadRequest(`파일은 ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB 이하여야 합니다.`);
  }
  return type;
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 서명 URL을 만든다.
 *
 * R2의 S3 presigned URL을 쓰지 않은 이유: 그쪽은 S3 액세스 키를 따로 발급해
 * 비밀값을 하나 더 관리해야 하고 서명 라이브러리가 붙는다. 여기서는 **바인딩으로
 * 이미 접근할 수 있으므로** 필요한 건 "이 링크가 우리가 발급한 것이고 아직
 * 안 죽었다"는 증명뿐이라, HMAC 하나로 끝난다.
 *
 * 만료를 서명에 포함하는 것이 요점 — exp만 쿼리에 있으면 클라이언트가 늘려 쓴다.
 */
export async function signDocumentUrl(secret: string, key: string, ttl = SIGNED_URL_TTL_SECONDS) {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const sig = await hmac(secret, `${key}|${exp}`);
  return `/api/files/${key}?exp=${exp}&sig=${sig}`;
}

/** 서명·만료를 검증한다. 실패는 전부 404다 — 키의 존재 여부를 알려주지 않는다. */
export async function verifyDocumentUrl(
  secret: string,
  key: string,
  exp: string | null,
  sig: string | null,
): Promise<void> {
  const notFound = new ApiError('파일을 찾을 수 없습니다.', 404);
  if (!exp || !sig) throw notFound;
  const expNum = Number(exp);
  if (!Number.isInteger(expNum) || expNum * 1000 < Date.now()) throw notFound;
  const expected = await hmac(secret, `${key}|${expNum}`);
  // 길이가 같아야 아래 비교가 의미 있다(HMAC 출력은 항상 64자라 실질적으로 항상 참).
  if (expected.length !== sig.length) throw notFound;
  // 타이밍 공격 방어 — 첫 불일치에서 끊지 않고 전체를 XOR로 누적한다.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) throw notFound;
}

/** 워커 환경에서 서명 비밀값을 꺼낸다. 없으면 서명 URL 기능 전체가 죽으므로 조용히 넘기지 않는다. */
export function getUrlSecret(env: { DOC_URL_SECRET?: string }): string {
  const secret = env.DOC_URL_SECRET;
  if (!secret) {
    throw new Error(
      'DOC_URL_SECRET이 없습니다. `wrangler secret put DOC_URL_SECRET`(원격)과 .dev.vars(로컬)를 확인하세요.',
    );
  }
  return secret;
}
