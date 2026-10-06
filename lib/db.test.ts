import { describe, expect, it } from 'vitest';
import { EVENT_LIST_COLUMNS, toEventListDTO, type EventListRow, type EventRow } from './db';

/**
 * BE-36 — 목록 응답은 키 비주얼 원문을 싣지 않고, 유무와 세션·자료 개수를 싣는다.
 *
 * 요점은 둘이다. ① 목록 쿼리가 `SELECT *`가 아니라 열을 손으로 고르므로, `EventRow`에
 * 열이 늘었는데 여기에 안 더하면 그 값이 목록에서만 조용히 `undefined`가 된다.
 * ② 원문(base64, 최대 약 1.5MB)이 응답에 다시 섞이면 콘솔 진입 비용이 이미지 수에
 * 비례해 커진다.
 */
const row: EventRow = {
  id: 1, slug: 's', brand: 'B', title: 'T', venue: null, event_date: '2026-10-06', host: null,
  capacity: 10, status: '공개', preset_id: null, mode: 'light', icon_set: 'line',
  density: 'normal', key_visual: 'data:image/png;base64,AAAA', kv_pattern: 'none',
  engage_qa: 1, engage_survey: 0, engage_chat: 0, engage_cert: 0,
  created_at: '2026-10-06 00:00:00', updated_at: '2026-10-06 00:00:00',
};

describe('EVENT_LIST_COLUMNS', () => {
  it('key_visual 원문 말고는 EventRow의 열을 전부 읽는다', () => {
    const selected = EVENT_LIST_COLUMNS.split(', ').map((c) => c.trim());
    for (const col of Object.keys(row)) {
      if (col === 'key_visual') continue;
      expect(selected).toContain(col);
    }
    // 원문은 유무 판정식 안에서만 등장한다 — 열로 그대로 읽히면 안 된다.
    expect(selected).not.toContain('key_visual');
  });
});

describe('toEventListDTO', () => {
  const { key_visual: _omit, ...rest } = row;
  void _omit;
  const listRow: EventListRow = { ...rest, has_key_visual: 1, session_count: 3, document_count: 2 };

  it('키 비주얼 원문 대신 유무를, 배열 대신 개수를 싣는다', () => {
    const dto = toEventListDTO(listRow);
    expect(dto.theme).not.toHaveProperty('keyVisual');
    expect(dto.theme.hasKeyVisual).toBe(true);
    expect(dto.sessionCount).toBe(3);
    expect(dto.documentCount).toBe(2);
  });

  it('키 비주얼이 없으면 hasKeyVisual은 false다', () => {
    expect(toEventListDTO({ ...listRow, has_key_visual: 0 }).theme.hasKeyVisual).toBe(false);
  });
});
