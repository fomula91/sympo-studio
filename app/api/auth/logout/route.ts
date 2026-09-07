import type { NextRequest } from 'next/server';
import { cookieNames, deleteSession, isSecureRequest, serializeCookie } from '@/lib/auth';
import { getDb, json, withRoute } from '@/lib/db';

/**
 * POST /api/auth/logout — 로그아웃 (BE-12)
 *
 * 쿠키만 지우지 않고 **D1의 세션 행도 지운다** — 쿠키를 어딘가에 복사해 둔
 * 사람이 그대로 다시 쓸 수 있으면 로그아웃이 아니다.
 */
export const POST = withRoute(async (request: NextRequest) => {
  const db = await getDb();
  await deleteSession(db, request);
  const secure = isSecureRequest(request);
  return json({ ok: true }, 200, {
    'Set-Cookie': serializeCookie(cookieNames(secure).session, '', { maxAge: 0, secure }),
  });
});
