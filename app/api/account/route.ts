import type { NextRequest } from 'next/server';
import { deleteAccount } from '@/lib/account';
import { cookieNames, isSecureRequest, requireUser, serializeCookie } from '@/lib/auth';
import { getDb, getEnv, json, withRoute } from '@/lib/db';

/**
 * DELETE /api/account — 로그인한 본인 계정과 소유 데이터를 영구 삭제한다 (BE-41)
 *
 * 지워지는 범위와 R2 처리는 `lib/account.ts`의 `deleteAccount` 주석 참조. 비로그인은 401
 * (`requireUser`) — 지울 대상이 "나"뿐이라 숨길 존재가 없다.
 *
 * 세션 행은 CASCADE로 함께 지워지므로 쿠키만 만료시킨다(로그아웃과 같은 헤더).
 * 쿠키가 `SameSite=Lax`라 다른 사이트가 이 요청을 대신 보내게 해도(CSRF) 세션이 실리지
 * 않는다. 되돌릴 수 없는 동작의 확인 단계는 화면(FE-48)의 몫이다.
 */
export const DELETE = withRoute(async (request: NextRequest) => {
  const db = await getDb();
  const user = await requireUser(db, request);
  const env = await getEnv();

  const result = await deleteAccount(db, env.DOCS, user.id);
  if (!result) return json({ error: '계정을 찾을 수 없습니다.' }, 404);

  const secure = isSecureRequest(request);
  return json({ deleted: true, events: result.events }, 200, {
    'Set-Cookie': serializeCookie(cookieNames(secure).session, '', { maxAge: 0, secure }),
  });
});
