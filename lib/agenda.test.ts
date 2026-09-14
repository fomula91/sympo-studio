import { describe, expect, it } from 'vitest';
import { validateDocumentsBody } from './agenda';

/**
 * BE-27 — **`status`는 입력이 아니다.**
 *
 * 예전에는 본문의 값을 받아 **신규 생성만** 검사했다(`id === null && status === 'ready'` → 400).
 * 기존 항목 수정 경로에는 검사가 없어서 `r2_key`가 NULL인 자료를 메타 저장 한 번으로
 * `ready`로 올릴 수 있었고, 그러면 **참가자 화면에 열 수 없는 자료가 "준비됨"으로 뜬다.**
 *
 * 검사를 한 군데 더 넣는 대신 값의 출처를 없앴다 — 라우트가 `r2_key` 유무에서 파생시킨다.
 * 되돌아가면(여기서 `status`를 다시 읽기 시작하면) 같은 불일치가 곧장 되살아난다.
 */
describe('validateDocumentsBody', () => {
  const doc = (extra: Record<string, unknown>) => ({
    documents: [{ displayName: '자료', sessionId: null, tag: null, ...extra }],
  });

  it('본문의 status를 결과에 싣지 않는다', () => {
    const [item] = validateDocumentsBody(doc({ id: 3, status: 'ready' }));
    expect(item).not.toHaveProperty('status');
  });

  it('신규 자료에 ready가 와도 거절하지 않는다 — 읽지 않으니 거절할 값이 없다', () => {
    // 예전에는 여기서 400이었다. 지금은 라우트가 'pending'으로 만들고 끝난다.
    expect(() => validateDocumentsBody(doc({ id: null, status: 'ready' }))).not.toThrow();
  });

  it('status가 아예 없어도 통과한다', () => {
    expect(() => validateDocumentsBody(doc({ id: null }))).not.toThrow();
  });

  it('나머지 필드 검증은 그대로다', () => {
    expect(() => validateDocumentsBody({ documents: [{ id: null, sessionId: null }] })).toThrow(
      /displayName/,
    );
  });
});
