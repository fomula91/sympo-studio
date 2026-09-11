import type { NextRequest } from 'next/server';
import {
  cookieNames, createSession, exchangeCode, googleConfig, isSecureRequest,
  readCookie, safeNextPath, serializeCookie, SESSION_TTL_DAYS, upsertUser,
} from '@/lib/auth';
import { ApiError, getDb, getEnv, withRoute } from '@/lib/db';

/**
 * GET /api/auth/callback/google — 로그인 완료 (BE-12)
 *
 * state를 쿠키의 값과 대조한다 — 쿼리의 state만 보면 아무 의미가 없다. 대조가
 * 끝나면 단기 쿠키를 즉시 만료시켜 재사용을 막는다.
 *
 * 실패는 사유를 화면에 흘리지 않고 `/console?auth=failed`로 돌려보낸다 —
 * 로그인 경로의 오류 문구는 공격자에게도 정보다.
 */
export const GET = withRoute(async (request: NextRequest) => {
  const secure = isSecureRequest(request);
  const names = cookieNames(secure);
  const expire = (n: string) => serializeCookie(n, '', { maxAge: 0, secure });

  // 쿠키에서 읽은 값도 **다시** 검증한다 — 쿠키를 쓸 수 있는 경로가 하나라도
  // 생기면(서브도메인 탈취 등) 여기가 #1을 그대로 다시 연다(BE-12 리뷰 #2).
  const back = safeNextPath(readCookie(request, names.redirect));
  const fail = (reason: string) => {
    const headers = new Headers({ Location: `/console?auth=${reason}` });
    headers.append('Set-Cookie', expire(names.state));
    headers.append('Set-Cookie', expire(names.redirect));
    return new Response(null, { status: 302, headers });
  };

  const sp = request.nextUrl.searchParams;
  // 사용자가 Google 화면에서 취소한 경우다 — 결함이 아니다.
  if (sp.get('error')) return fail('cancelled');

  const code = sp.get('code');
  const state = sp.get('state');
  const stored = readCookie(request, names.state);
  if (!code || !state || !stored) return fail('failed');

  const [expectedState, verifier] = stored.split('.');
  if (!expectedState || !verifier || expectedState !== state) return fail('failed');

  const db = await getDb();
  let token: string;
  try {
    const cfg = googleConfig(await getEnv());
    const redirectUri = new URL('/api/auth/callback/google', request.url).toString();
    const who = await exchangeCode(cfg, code, redirectUri, verifier);
    token = await createSession(db, await upsertUser(db, who));
  } catch (e) {
    if (e instanceof ApiError) return fail('failed');
    throw e;
  }

  const headers = new Headers({ Location: back });
  headers.append(
    'Set-Cookie',
    serializeCookie(names.session, token, { maxAge: SESSION_TTL_DAYS * 86400, secure }),
  );
  headers.append('Set-Cookie', expire(names.state));
  headers.append('Set-Cookie', expire(names.redirect));
  return new Response(null, { status: 302, headers });
});
