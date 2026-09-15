import { describe, expect, it } from 'vitest';
import { opsStatements, toOpsDTO } from './ops';

/**
 * 집계 계산이 **한 벌뿐**이라는 것을 고정한다 (BE-24).
 *
 * 운영자 경로(`/api/events/[id]/ops`)와 참가자 공개 경로(`/api/public/[slug]/report`)가
 * 갈라지면서 같은 계산을 두 곳에서 쓰게 됐다. 각자 복사했다면 한쪽만 고쳐지는 날이
 * 온다 — `attendanceRate`의 상한 1은 BE-19가 한 번 놓쳤다가 리뷰에서 잡힌 값이다.
 */
describe('toOpsDTO', () => {
  const kinds = [{ kind: 'page_view', visitors: 150, hits: 400 }];

  it('참석률은 1을 넘지 않는다 — 분모(capacity)가 손입력이라 넘을 수 있다', () => {
    expect(toOpsDTO(100, kinds, []).attendanceRate).toBe(1);
  });

  it('capacity가 없으면 참석률은 null이다 (0으로 나누지 않는다)', () => {
    expect(toOpsDTO(null, kinds, []).attendanceRate).toBeNull();
  });

  it('"몇 명"과 "몇 번"을 따로 준다', () => {
    const dto = toOpsDTO(1000, kinds, []);
    expect(dto.visitors).toBe(150);
    expect(dto.pageViews).toBe(400);
  });

  it('세션·자료 집계를 대상별로 가른다', () => {
    const targets = [
      { session_id: 3, document_id: null, visitors: 2, hits: 5 },
      { session_id: null, document_id: 9, visitors: 1, hits: 4 },
    ];
    const dto = toOpsDTO(null, [], targets);
    expect(dto.sessions).toEqual([{ sessionId: 3, visitors: 2, hits: 5 }]);
    expect(dto.documents).toEqual([{ documentId: 9, visitors: 1, hits: 4 }]);
  });
});

describe('opsStatements', () => {
  function sqlFor(target: { id: number } | { slug: string }) {
    const out: string[] = [];
    const db = {
      prepare: (q: string) => (out.push(q.replace(/\s+/g, ' ').trim()), { bind: () => ({}) }),
    } as unknown as D1Database;
    opsStatements(db, target);
    return out;
  }

  it('id로 지목하면 그대로 바인딩한다', () => {
    for (const q of sqlFor({ id: 1 })) expect(q).toMatch(/event_id = \?/);
  });

  it('slug로 지목하면 서브쿼리로 푼다 — id를 먼저 조회하면 왕복이 둘이 된다', () => {
    for (const q of sqlFor({ slug: 'x' })) {
      expect(q).toMatch(/event_id = \(SELECT id FROM events WHERE slug = \?\)/);
    }
  });
});
