import { requestFailureMessage } from '@fe/shared/api/failure-message';

// HTTP 응답의 사유는 입력 수정·재로그인 등에 필요하다. 응답 없는 네트워크 오류는
// 브라우저의 영문 예외 대신 기존 재시도 안내를 유지한다. '실패'는 상태 색 판정에도 쓰인다.
export function saveErrorMessage(error: unknown, target: '저장' | '아젠다 저장' = '저장'): string {
  return requestFailureMessage(error, `${target} 실패`);
}
