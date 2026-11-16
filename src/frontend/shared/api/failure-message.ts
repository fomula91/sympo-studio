import { ApiClientError } from './http';

// 응답이 있으면 서버 사유를 유지하고, 연결 실패는 브라우저 예외 대신 재시도를 안내한다.
export function requestFailureMessage(error: unknown, prefix: string): string {
  const reason = error instanceof ApiClientError && error.status > 0 ? error.message.trim() : '';
  return `${prefix} — ${reason || '다시 시도해주세요'}`;
}
