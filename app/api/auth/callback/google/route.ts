import type { NextRequest } from 'next/server';
import {
  cookieNames, createSession, exchangeCode, googleConfig, isSecureRequest,
  matchOAuthState, readCookie, safeNextPath, serializeCookie, SESSION_TTL_DAYS, upsertUser,
} from '@/lib/auth';
import { getDb, getEnv, withRoute } from '@/lib/db';

/**
 * GET /api/auth/callback/google — 로그인 완료 (BE-12, BE-26 ③④)
 *
 * state를 쿠키의 값과 대조한다 — 쿼리의 state만 보면 아무 의미가 없다. 대조가
 * 끝나면 단기 쿠키를 즉시 만료시켜 재사용을 막는다.
 *
 * **대조를 가장 먼저 한다.** 예전에는 `?error=`를 먼저 보고 `fail('cancelled')`로
 * 접었는데, `fail()`이 state·redirect 쿠키를 만료시키기 때문에 공격자가 피해자
 * 브라우저를 `/api/auth/callback/google?error=x`로 보내기만 하면(이미지 태그 한 줄로
 * 충분하다) **진행 중이던 정상 로그인의 state 쿠키가 지워져** 그 로그인이 "state
 * 쿠키 없음"으로 실패했다. 남의 콜백인지 먼저 가려낸 뒤에 쿠키를 건드린다(BE-26 ④).
 *
 * 실패는 사유를 화면에 흘리지 않고 `/console?auth=failed`로 돌려보낸다 —
 * 로그인 경로의 오류 문구는 공격자에게도 정보다.
 *
 * **`email_conflict` 사유는 없어졌다** (BE-30). BE-26이 같은 이메일의 계정을 거절하면서
 * 만든 사유인데, 0014가 `users.email`의 UNIQUE를 떼면서 **거절할 일 자체가 사라졌다** —
 * 이제 별개 계정이 만들어진다.
 */
export const GET = withRoute(async (request: NextRequest) => {
  const secure = isSecureRequest(request);
  const names = cookieNames(secure);
  const expire = (n: string) => serializeCookie(n, '', { maxAge: 0, secure });

  // 쿠키에서 읽은 값도 **다시** 검증한다 — 쿠키를 쓸 수 있는 경로가 하나라도
  // 생기면(서브도메인 탈취 등) 여기가 #1을 그대로 다시 연다(BE-12 리뷰 #2).
  const back = safeNextPath(readCookie(request, names.redirect));

  /** 이 브라우저가 시작한 로그인이 확실할 때만 쓴다 — 단기 쿠키를 만료시킨다. */
  const fail = (reason: string) => {
    // `back`은 이미 safeNextPath로 검증됐다 — 실패해도 원래 돌아갈 곳을 잃지 않도록
    // 함께 실어 보낸다(/console 화면의 "다시 시도"가 이걸 next=로 다시 쓴다).
    const headers = new Headers({ Location: `/console?auth=${reason}&next=${encodeURIComponent(back)}` });
    headers.append('Set-Cookie', expire(names.state));
    headers.append('Set-Cookie', expire(names.redirect));
    return new Response(null, { status: 302, headers });
  };

  /** 우리 로그인이 아니다(또는 위조다) — **쿠키를 건드리지 않고** 돌려보낸다. */
  const ignore = () =>
    new Response(null, { status: 302, headers: { Location: '/console?auth=failed' } });

  const sp = request.nextUrl.searchParams;
  const matched = matchOAuthState(readCookie(request, names.state), sp.get('state'));
  if (!matched) return ignore();

  // 여기서부터는 이 콜백이 이 브라우저가 시작한 로그인의 것이다 — 쿠키를 정리해도 된다.
  // 사용자가 Google 화면에서 취소한 경우가 여기다. OAuth 2.0은 오류 응답에도 state를
  // 실어 보내므로 위 대조를 지난다(결함이 아니다).
  if (sp.get('error')) return fail('cancelled');

  const code = sp.get('code');
  if (!code) return fail('failed');

  const db = await getDb();
  let token: string;
  try {
    const cfg = googleConfig(await getEnv());
    const redirectUri = new URL('/api/auth/callback/google', request.url).toString();
    const who = await exchangeCode(cfg, code, redirectUri, matched.verifier);
    token = await createSession(db, await upsertUser(db, who));
  } catch (e) {
    // **ApiError가 아닌 예외도 여기서 접는다** (BE-26 ③). 예전엔 그대로 새어나가
    // 로그인 화면 대신 500 스택 페이지가 떴다 — 로그인 실패는 앱이 감당해야 하는
    // 정상 경로지 사용자에게 스택을 보여줄 자리가 아니다. 대신 원인을 잃지 않게
    // 로그는 남긴다(Workers 로그에만 남고 응답에는 실리지 않는다).
    console.error('[auth] google callback', e);
    return fail('failed');
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
