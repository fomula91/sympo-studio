import { describe, expect, it } from 'vitest';
import { EVENT_STATUSES, eventPhase, isEventStatus, PUBLIC_STATUSES, todayKst } from './status';

describe('isEventStatus', () => {
  it('발행 상태 4종을 통과시킨다', () => {
    for (const s of EVENT_STATUSES) expect(isEventStatus(s)).toBe(true);
  });

  it('시점은 발행 상태가 아니다 — BE-23 이전 값이 되살아나지 않게 막는다', () => {
    for (const s of ['공개예정', '진행중', '완료']) expect(isEventStatus(s)).toBe(false);
  });

  it('문자열이 아닌 값과 목록 밖 문자열을 막는다', () => {
    for (const v of [null, undefined, 1, {}, '', '아무말']) expect(isEventStatus(v)).toBe(false);
  });
});

describe('PUBLIC_STATUSES', () => {
  it('공개만 참가자에게 열린다', () => {
    expect(PUBLIC_STATUSES.has('공개')).toBe(true);
    for (const s of ['초안', '검수대기', '보관']) expect(PUBLIC_STATUSES.has(s)).toBe(false);
  });
});

describe('eventPhase', () => {
  const today = '2026-09-11';

  it('오늘보다 뒤면 예정, 같으면 당일, 앞이면 종료', () => {
    expect(eventPhase('2026-09-12', today)).toBe('예정');
    expect(eventPhase('2026-09-11', today)).toBe('당일');
    expect(eventPhase('2026-09-10', today)).toBe('종료');
  });

  it('날짜 미정이면 null — 예정이 아니다(초안 단계의 정상 상태다)', () => {
    expect(eventPhase(null, today)).toBeNull();
    expect(eventPhase(undefined, today)).toBeNull();
    expect(eventPhase('', today)).toBeNull();
  });

  it('해·달 경계를 사전순 비교로 정확히 가른다', () => {
    expect(eventPhase('2027-01-01', '2026-12-31')).toBe('예정');
    expect(eventPhase('2026-12-31', '2027-01-01')).toBe('종료');
    expect(eventPhase('2026-10-01', '2026-09-30')).toBe('예정');
  });
});

describe('todayKst', () => {
  it('UTC 자정 직후에도 한국 날짜를 준다 — UTC로 비교하면 당일 아침이 예정으로 보인다', () => {
    // 2026-09-11 00:30 UTC = 2026-09-11 09:30 KST
    expect(todayKst(new Date('2026-09-11T00:30:00Z'))).toBe('2026-09-11');
    // 2026-09-10 15:30 UTC = 2026-09-11 00:30 KST — 한국은 이미 다음 날이다
    expect(todayKst(new Date('2026-09-10T15:30:00Z'))).toBe('2026-09-11');
    // 2026-09-10 14:30 UTC = 2026-09-10 23:30 KST — 아직 같은 날
    expect(todayKst(new Date('2026-09-10T14:30:00Z'))).toBe('2026-09-10');
  });
});
