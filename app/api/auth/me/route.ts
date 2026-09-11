import type { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getDb, json, withRoute } from '@/lib/db';

/**
 * GET /api/auth/me — 현재 사용자 (BE-12)
 *
 * **비로그인은 401이 아니라 `200 + null`이다.** 게스트가 정상 상태이기 때문이다
 * (ADR 0007) — 401로 주면 화면이 "오류"로 다뤄 게스트 경로가 에러 화면이 된다.
 *
 * 세션은 사용자별이라 공유 캐시에 들어가면 안 된다.
 */
export const GET = withRoute(async (request: NextRequest) => {
  const db = await getDb();
  return json({ user: await getSessionUser(db, request) }, 200, {
    'Cache-Control': 'private, no-store',
  });
});
