import { ApiClientError, fetchWithTimeout, readError } from '@fe/shared/api/http';
import type { AuthUser } from "../model/types";

/**
 * GET /api/auth/me — 현재 로그인 사용자(FE-15). 비로그인은 200 + `user: null`이라
 * 예외를 던지지 않는다(ADR 0007) — 게스트가 정상 상태다.
 */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const res = await fetchWithTimeout('/api/auth/me', { cache: 'no-store' });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  const data = (await res.json()) as { user: AuthUser | null };
  return data.user;
}

/** POST /api/auth/logout — 세션을 지운다(FE-15). */
export async function logoutStudioUser(): Promise<void> {
  const res = await fetchWithTimeout('/api/auth/logout', { method: 'POST' });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
}

/**
 * DELETE /api/account — 계정과 그 소유 데이터(이벤트·아젠다·자료·질문·설문·로그·R2 파일)·
 * 프리셋·Google 연결·세션을 영구히 지운다(FE-48, BE-41). 성공하면 세션 쿠키도 서버가
 * 만료시키므로 별도로 로그아웃 API를 부를 필요가 없다.
 *
 * **`fetchWithTimeout`을 안 쓴다** — 서버가 D1 일괄 삭제 뒤 R2 객체까지 동기로 지우고
 * 응답한다(`lib/account.ts`). `uploadStudioDocument`와 같은 이유로, 자료가 많은 계정은
 * 8초를 넘길 수 있다 — 타임아웃으로 끊으면 서버는 이미 다 지웠는데 클라이언트만 실패로
 * 보고 게스트로 못 돌아가는 상태가 된다(`/code-review` 발견).
 */
export async function deleteStudioAccount(): Promise<{ deleted: boolean; events: number }> {
  const res = await fetch('/api/account', { method: 'DELETE' });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  return (await res.json()) as { deleted: boolean; events: number };
}
