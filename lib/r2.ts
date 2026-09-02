import { ApiError, BadRequest } from './db';

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
