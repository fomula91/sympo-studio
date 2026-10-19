

/** GET /api/auth/me가 돌려주는 로그인 사용자. 비로그인이면 null(에러 아님). */
export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}
