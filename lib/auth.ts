import { ApiError, eventNotFound } from './db';

// Google SSO + D1 세션 (BE-12, [[0007-sso-and-account-model]]).
//
// 라이브러리를 쓰지 않고 직접 구현한 이유는 ADR에 있다 — 요약하면 런타임 의존성을
// 늘리지 않고(0001이 최대 위험으로 꼽은 어댑터 마찰), 손으로 쓴 마이그레이션
// 방식과 스키마 소유권을 지키기 위해서다. 어려운 부분(신원 검증)은 Google에
// 위임하고 여기서 다루는 건 OAuth 클라이언트 흐름과 랜덤 토큰 세션뿐이다.

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const SESSION_TTL_DAYS = 30;
/** state·PKCE를 담는 단기 쿠키. 리다이렉트 왕복만 버티면 된다. */
const OAUTH_TTL_SECONDS = 600;

/**
 * 쿠키 이름을 환경별로 나눈다.
 *
 * `__Host-` 접두사는 Secure + Path=/ + Domain 없음을 브라우저가 강제하게 만드는
 * 가장 강한 보호인데, **http에서는 동작하지 않는다.** 로컬 dev가 http라 이름을
 * 그대로 쓰면 쿠키가 아예 저장되지 않아 "로컬에서만 로그인이 안 되는" 형태로
 * 드러난다(ADR 0007의 알려진 함정).
 */
export function cookieNames(isSecure: boolean) {
  const p = isSecure ? '__Host-' : '';
  return { session: `${p}sympo_session`, state: `${p}sympo_oauth`, redirect: `${p}sympo_after` };
}

export function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === 'https:';
}

export function serializeCookie(
  name: string,
  value: string,
  opts: { maxAge: number; secure: boolean },
): string {
  const parts = [
    // **값을 반드시 인코딩한다.** 그대로 이어붙이면 두 가지가 터진다(BE-12 리뷰):
    // ① `/a; Domain=evil.example` 같은 값이 쿠키 **속성 주입**이 된다 — `__Host-`
    //    환경에선 브라우저가 쿠키를 통째로 버리고, 접두사 없는 로컬 http에선 실제로 먹는다.
    // ② 비ASCII 값(한글 경로 등)이 들어오면 `Headers.append`가 ByteString 변환에
    //    실패해 **로그인 진입점이 500**이 된다.
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    // Strict면 Google에서 돌아오는 top-level 내비게이션에 쿠키가 안 실려
    // 콜백이 state를 못 읽는다. Lax는 top-level GET에 실린다.
    'SameSite=Lax',
    `Max-Age=${opts.maxAge}`,
  ];
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      const raw = part.slice(i + 1).trim();
      // serializeCookie가 인코딩해 넣으므로 짝을 맞춘다. 잘못된 %  시퀀스는
      // decodeURIComponent가 던지므로 원문을 그대로 돌려준다(값이 없는 것보다 낫다).
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

/**
 * 로그인 후 돌아갈 경로를 **같은 출처의 경로로 강제**한다 (BE-12 리뷰 #1).
 *
 * 문자 검사(`startsWith('/') && !startsWith('//')`)로는 막을 수 없다 — 브라우저는
 * `Location`을 WHATWG URL 파서로 해석하고, special scheme에서 **`\`는 `/`와 동치**다.
 * 그래서 `/\evil.com`이 그 검사를 통과한 뒤 `https://evil.com/`으로 해석된다
 * (실측 확인). 같은 파서에 태워 **출처가 바뀌면 거절**하는 것이 유일하게 맞는 판정이다.
 *
 * 통과한 값은 파서가 정규화한 `pathname + search + hash`만 쓴다 — 비ASCII가
 * 퍼센트 인코딩돼 돌아오므로 쿠키·헤더에 실을 수 있는 형태가 함께 보장된다.
 */
const NEXT_BASE = 'https://sympo.invalid';

export function safeNextPath(raw: string | null | undefined, fallback = '/console'): string {
  if (!raw) return fallback;
  let url: URL;
  try {
    url = new URL(raw, NEXT_BASE);
  } catch {
    return fallback;
  }
  // 절대 URL·프로토콜 상대(`//host`)·백슬래시 변형은 전부 origin이 바뀐다.
  // `javascript:` 같은 스킴은 origin이 'null'이라 여기서 함께 걸린다.
  if (url.origin !== NEXT_BASE) return fallback;
  const path = `${url.pathname}${url.search}${url.hash}`;
  return path.startsWith('/') ? path : fallback;
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** PKCE: verifier를 SHA-256해 base64url로 보낸다(S256). */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

export function googleConfig(env: {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}): GoogleConfig {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = env;
  if (!clientId || !clientSecret) {
    // 조용히 넘기면 "로그인 버튼이 아무것도 안 하는" 상태가 된다.
    throw new ApiError(
      'Google 로그인이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.',
      503,
    );
  }
  return { clientId, clientSecret };
}

export function authorizeUrl(cfg: GoogleConfig, redirectUri: string, state: string, challenge: string) {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    // 계정 선택을 매번 띄운다 — 공용 태블릿(현장 운영)에서 이전 사용자의
    // 계정으로 조용히 로그인되는 것을 막는다.
    prompt: 'select_account',
  });
  return `${AUTHORIZE_URL}?${q}`;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

/**
 * code를 토큰으로 바꾸고 신원을 꺼낸다.
 *
 * **id_token의 서명을 로컬 검증하지 않는다.** 토큰 엔드포인트에서 HTTPS로 직접
 * 받았기 때문이며, Google이 문서에서 명시적으로 허용하는 경로다. JWKS 조회·캐싱이
 * 사라져 Workers CPU와 바인딩이 늘지 않는다(ADR 0007). 대신 iss·aud·exp는 본다.
 */
export async function exchangeCode(
  cfg: GoogleConfig,
  code: string,
  redirectUri: string,
  verifier: string,
): Promise<GoogleIdentity> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new ApiError('Google 로그인에 실패했습니다.', 502);

  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new ApiError('Google 응답에 id_token이 없습니다.', 502);

  const claims = decodeJwtPayload(data.id_token);
  const iss = claims.iss;
  if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') {
    throw new ApiError('Google 토큰의 발급자가 올바르지 않습니다.', 502);
  }
  if (claims.aud !== cfg.clientId) throw new ApiError('Google 토큰의 대상이 다릅니다.', 502);
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) {
    throw new ApiError('Google 토큰이 만료됐습니다.', 502);
  }
  if (typeof claims.sub !== 'string' || typeof claims.email !== 'string') {
    throw new ApiError('Google 토큰에 필요한 정보가 없습니다.', 502);
  }
  return {
    sub: claims.sub,
    email: claims.email,
    name: typeof claims.name === 'string' ? claims.name : null,
    picture: typeof claims.picture === 'string' ? claims.picture : null,
  };
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new ApiError('Google 토큰 형식이 올바르지 않습니다.', 502);
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
  // atob은 바이트를 주므로 UTF-8 이름(한글 등)을 되살리려면 디코딩이 한 번 더 필요하다.
  const bytes = Uint8Array.from(json, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

export { OAUTH_TTL_SECONDS };

// ── 세션 ────────────────────────────────────────────────────────────────────

export interface SessionUser {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

/** 원문 토큰을 돌려주고(쿠키로 나감) DB에는 해시만 남긴다. */
export async function createSession(db: D1Database, userId: number): Promise<string> {
  const token = randomToken();
  await db
    .prepare(
      `INSERT INTO auth_sessions (id, user_id, expires_at)
       VALUES (?, ?, datetime('now', '+${SESSION_TTL_DAYS} days'))`,
    )
    .bind(await sha256hex(token), userId)
    .run();
  return token;
}

/**
 * 쿠키의 세션 토큰으로 사용자를 찾는다. 없거나 만료면 **null이지 예외가 아니다** —
 * 비로그인은 오류 상태가 아니라 정상 상태다(게스트 경로가 살아 있어야 한다).
 */
export async function getSessionUser(
  db: D1Database,
  request: Request,
): Promise<SessionUser | null> {
  const name = cookieNames(isSecureRequest(request)).session;
  const token = readCookie(request, name);
  if (!token) return null;

  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.avatar_url
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > datetime('now')`,
    )
    .bind(await sha256hex(token))
    .first<{ id: number; email: string; name: string | null; avatar_url: string | null }>();

  return row ? { id: row.id, email: row.email, name: row.name, avatarUrl: row.avatar_url } : null;
}

export async function deleteSession(db: D1Database, request: Request): Promise<void> {
  const name = cookieNames(isSecureRequest(request)).session;
  const token = readCookie(request, name);
  if (!token) return;
  await db.prepare('DELETE FROM auth_sessions WHERE id = ?').bind(await sha256hex(token)).run();
}

/** Google이 돌아온 신원으로 사용자를 찾거나 만든다. 같은 이메일이면 같은 계정이다. */
export async function upsertUser(db: D1Database, who: GoogleIdentity): Promise<number> {
  const linked = await db
    .prepare('SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_account_id = ?')
    .bind('google', who.sub)
    .first<{ user_id: number }>();
  if (linked) {
    // 이름·아바타는 Google 쪽에서 바뀔 수 있으니 로그인마다 맞춰 둔다.
    await db
      .prepare("UPDATE users SET name = ?, avatar_url = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(who.name, who.picture, linked.user_id)
      .run();
    return linked.user_id;
  }

  // 같은 이메일의 계정이 이미 있으면 거기에 제공자를 잇는다 — 나중에 GitHub 등을
  // 붙일 때 같은 사람이 계정 두 개로 갈리지 않게.
  const existing = await db
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(who.email)
    .first<{ id: number }>();

  const userId =
    existing?.id ??
    (
      await db
        .prepare('INSERT INTO users (email, name, avatar_url) VALUES (?, ?, ?) RETURNING id')
        .bind(who.email, who.name, who.picture)
        .first<{ id: number }>()
    )?.id;
  if (!userId) throw new ApiError('계정을 만들지 못했습니다.', 500);

  await db
    .prepare('INSERT INTO oauth_accounts (user_id, provider, provider_account_id) VALUES (?, ?, ?)')
    .bind(userId, 'google', who.sub)
    .run();
  return userId;
}

/** 만료 세션 정리. 자정 Cron이 부른다 — 방치하면 단조 증가한다. */
export async function purgeExpiredSessions(db: D1Database): Promise<number> {
  const res = await db
    .prepare("DELETE FROM auth_sessions WHERE expires_at <= datetime('now')")
    .run();
  return res.meta.changes ?? 0;
}

// ── 인가 ────────────────────────────────────────────────────────────────────

/**
 * 이 이벤트를 고치거나 지울 수 있는가 (BE-12 리뷰 #5, Codex 교차 리뷰 #2).
 *
 * BE-13이 인가 경계 전체를 맡지만 **소유권을 가드보다 먼저 배포하면 안 된다.** 이전에는
 * 모든 이벤트가 매일 밤 리셋에 지워져서 무보호의 대가가 최대 하루치였는데, `owner_id`가
 * 채워지는 순간 로그인 사용자의 이벤트는 영속한다 — 그 상태로 가드가 없으면 id를 아는
 * 누구나 **영구 삭제**할 수 있다.
 *
 * **상위 라우트만 막으면 뚫린다.** 처음엔 `PATCH`/`DELETE /api/events/[id]`에만 걸었는데,
 * Codex 교차 리뷰가 자식 라우트로 우회되는 것을 재현했다 — `DELETE /api/events/42`는
 * 404인데 `PUT /api/events/42/sessions`에 `{"sessions":[]}`를 보내면 **200으로 통과해
 * 피해자의 아젠다가 전부 지워졌다**(세션에 딸린 설문 응답까지). "영구 삭제는 막았지만
 * 영구 파괴는 안 막은" 상태였다. 그래서 이벤트를 바꾸는 **모든** 쓰기 경로가 이걸 지난다.
 *
 * **소유자가 없는 이벤트(데모)는 지금처럼 열어 둔다** — 게스트 체험과 데모 경로가
 * 이것에 기대고 있고, 그것까지 잠그는 것은 BE-13의 범위다.
 *
 * 남의 것이면 403이 아니라 **404**다 — "있지만 네 것이 아니다"를 알려주면 존재가 샌다
 * (BE-7이 채택한 규칙과 같다).
 */
export async function assertCanEdit(
  db: D1Database,
  request: Request,
  eventId: number,
): Promise<void> {
  const row = await db
    .prepare('SELECT owner_id FROM events WHERE id = ?')
    .bind(eventId)
    .first<{ owner_id: number | null }>();
  if (!row) throw eventNotFound();
  if (row.owner_id === null) return;

  const user = await getSessionUser(db, request);
  if (!user || user.id !== row.owner_id) throw eventNotFound();
}
