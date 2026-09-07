import type { NextRequest } from 'next/server';
import {
  authorizeUrl, cookieNames, googleConfig, isSecureRequest, OAUTH_TTL_SECONDS,
  pkceChallenge, randomToken, serializeCookie,
} from '@/lib/auth';
import { getEnv, withRoute } from '@/lib/db';

/**
 * GET /api/auth/google — 로그인 시작 (BE-12)
 *
 * state와 PKCE verifier를 만들어 **단기 쿠키에 넣고** Google로 보낸다. 서버에
 * 저장하지 않는 이유: 이 값들은 왕복 한 번만 살면 되고, D1에 넣으면 로그인
 * 시도마다 쓰기가 생겨 무료 티어를 갉는다.
 *
 * `?next=`로 돌아올 곳을 받되 **같은 출처의 경로만** 허용한다 — 외부 URL을
 * 그대로 두면 로그인 링크가 오픈 리다이렉터가 된다.
 */
export const GET = withRoute(async (request: NextRequest) => {
  const env = await getEnv();
  const cfg = googleConfig(env);
  const secure = isSecureRequest(request);
  const names = cookieNames(secure);

  const state = randomToken(16);
  const verifier = randomToken(32);
  const redirectUri = new URL('/api/auth/callback/google', request.url).toString();

  const raw = request.nextUrl.searchParams.get('next');
  const next = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/console';

  const headers = new Headers({ Location: authorizeUrl(cfg, redirectUri, state, await pkceChallenge(verifier)) });
  headers.append(
    'Set-Cookie',
    serializeCookie(names.state, `${state}.${verifier}`, { maxAge: OAUTH_TTL_SECONDS, secure }),
  );
  headers.append('Set-Cookie', serializeCookie(names.redirect, next, { maxAge: OAUTH_TTL_SECONDS, secure }));
  return new Response(null, { status: 302, headers });
});
