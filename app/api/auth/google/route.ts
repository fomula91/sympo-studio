import type { NextRequest } from 'next/server';
import {
  authorizeUrl, cookieNames, googleConfig, isSecureRequest, OAUTH_TTL_SECONDS,
  pkceChallenge, randomToken, safeNextPath, serializeCookie, type GoogleConfig,
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
 *
 * 이 라우트는 `<a href>`로 브라우저를 직접 이동시키는 용도라, 설정 누락
 * (`googleConfig`)을 `ApiError`로 던지면 `withRoute`가 raw JSON을 그대로
 * 응답해 사용자 화면에 노출된다 — 콜백 라우트가 이미 쓰는 리다이렉트 패턴
 * (`/console?auth=...`)을 여기도 맞춘다. 문구는 URL에 싣지 않고 사유
 * 코드만 넘겨 콘솔 화면이 문구를 정한다.
 */
export const GET = withRoute(async (request: NextRequest) => {
  const env = await getEnv();
  let cfg: GoogleConfig;
  try {
    cfg = googleConfig(env);
  } catch {
    return new Response(null, {
      status: 302,
      headers: { Location: '/console?auth=config_error' },
    });
  }
  const secure = isSecureRequest(request);
  const names = cookieNames(secure);

  const state = randomToken(16);
  const verifier = randomToken(32);
  const redirectUri = new URL('/api/auth/callback/google', request.url).toString();

  // 문자 검사로는 `/\evil.com`을 막을 수 없다 — 판정을 URL 파서에 맡긴다(BE-12 리뷰 #1).
  const next = safeNextPath(request.nextUrl.searchParams.get('next'));

  const headers = new Headers({ Location: authorizeUrl(cfg, redirectUri, state, await pkceChallenge(verifier)) });
  headers.append(
    'Set-Cookie',
    serializeCookie(names.state, `${state}.${verifier}`, { maxAge: OAUTH_TTL_SECONDS, secure }),
  );
  headers.append('Set-Cookie', serializeCookie(names.redirect, next, { maxAge: OAUTH_TTL_SECONDS, secure }));
  return new Response(null, { status: 302, headers });
});
