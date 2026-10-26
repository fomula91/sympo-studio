import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@fe/shared/api/http';
import { savedColor, UI } from '@fe/shared/config/ui';
import { saveErrorMessage } from './save-error';

describe('저장 실패 안내', () => {
  it('행사명 400 검증 사유를 표시하고 무조건적인 재시도를 안내하지 않는다', () => {
    const message = saveErrorMessage(new ApiClientError(400, 'title은 필수입니다.'));
    expect(message).toBe('저장 실패 — title은 필수입니다.');
    expect(message).not.toContain('다시 시도');
    expect(savedColor(message)).toBe(UI.toneDangerFg);
  });

  it('아젠다 검증 실패도 세션 필드의 서버 사유를 표시한다', () => {
    const message = saveErrorMessage(new ApiClientError(400, '세션 제목은 필수입니다.'), '아젠다 저장');
    expect(message).toBe('아젠다 저장 실패 — 세션 제목은 필수입니다.');
    expect(savedColor(message)).toBe(UI.toneDangerFg);
  });

  it.each([401, 403, 409, 429, 503])('HTTP %i 응답의 사유를 버리지 않는다', (status) => {
    expect(saveErrorMessage(new ApiClientError(status, '서버가 안내한 사유'))).toContain('서버가 안내한 사유');
  });

  it.each([new TypeError('Failed to fetch'), new ApiClientError(0, 'timeout'), undefined])('응답 없는 오류는 재시도를 안내한다: %s', (error) => {
    expect(saveErrorMessage(error)).toBe('저장 실패 — 다시 시도해주세요');
    expect(saveErrorMessage(error, '아젠다 저장')).toBe('아젠다 저장 실패 — 다시 시도해주세요');
  });

  it('사유가 비어 있는 HTTP 오류는 재시도 안내로 대체한다', () => {
    expect(saveErrorMessage(new ApiClientError(500, '  '))).toBe('저장 실패 — 다시 시도해주세요');
  });
});
