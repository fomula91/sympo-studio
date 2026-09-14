import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_EVENTS, validateImportBody } from './import';

/**
 * BE-15 — 가져오기 입력 검증.
 *
 * 이 엔드포인트의 존재 이유는 **"로그인은 잃는 행동이 되어서는 안 된다"**이다
 * ([[0007-sso-and-account-model]] §1-1). 그래서 입력이 느슨해 데이터가 깨지면
 * 목적과 정반대가 된다 — 여기 단언들이 그 경계다.
 */
const ev = (extra: Record<string, unknown> = {}) => ({
  clientRef: 'local-ref-001',
  brand: 'MERIDIAN',
  title: '가져온 행사',
  ...extra,
});

describe('validateImportBody', () => {
  it('정상 본문을 통과시키고 테마·아젠다를 채운다', () => {
    const [out] = validateImportBody({
      events: [ev({ theme: { presetId: 'aurora', mode: 'dark' }, sessions: [{ title: '세션' }] })],
    });
    expect(out.theme.presetId).toBe('aurora');
    expect(out.theme.mode).toBe('dark');
    expect(out.sessions).toHaveLength(1);
  });

  it('같은 요청 안의 clientRef 중복을 막는다', () => {
    // DB의 UNIQUE에 맡기면 두 번째 항목이 "이미 있음"으로 조용히 넘어가
    // 사용자는 둘 다 올라갔다고 믿는다.
    expect(() => validateImportBody({ events: [ev(), ev()] })).toThrow(/중복/);
  });

  it('clientRef 형식을 강제한다 — 멱등성 키라 짧으면 남과 부딪힌다', () => {
    expect(() => validateImportBody({ events: [ev({ clientRef: 'abc' })] })).toThrow(/clientRef/);
    expect(() => validateImportBody({ events: [ev({ clientRef: 'a b c d e f' })] })).toThrow(
      /clientRef/,
    );
  });

  it('로컬 세션 id는 버린다 — 서버의 id가 아니다', () => {
    const [out] = validateImportBody({
      events: [ev({ sessions: [{ id: 1234, title: '세션' }] })],
    });
    expect(out.sessions[0].id).toBeNull();
  });

  it('한 번에 가져올 수 있는 이벤트 수를 막는다', () => {
    const many = Array.from({ length: MAX_IMPORT_EVENTS + 1 }, (_, i) =>
      ev({ clientRef: `local-ref-${String(i).padStart(3, '0')}` }),
    );
    expect(() => validateImportBody({ events: many })).toThrow(/20개까지/);
  });

  it('빈 목록과 배열 아님을 거절한다', () => {
    expect(() => validateImportBody({ events: [] })).toThrow(/없습니다/);
    expect(() => validateImportBody({ events: {} })).toThrow(/배열/);
  });

  it('상태·날짜·정원 검증은 생성 경로와 같은 규칙이다', () => {
    expect(() => validateImportBody({ events: [ev({ status: '없는상태' })] })).toThrow();
    expect(() => validateImportBody({ events: [ev({ date: '2026/12/01' })] })).toThrow(/date/);
    expect(() => validateImportBody({ events: [ev({ capacity: -1 })] })).toThrow(/capacity/);
  });
});
