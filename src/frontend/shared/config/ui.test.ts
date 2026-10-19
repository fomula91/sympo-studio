import { describe, expect, it } from 'vitest';
import { UI, savedColor } from './ui';

// savedColor는 타입 있는 상태값이 아니라 메시지 문구의 패턴으로 색을 가른다
// (문서 주석 참조) — 새 saved 문구를 추가할 때 이 세 패턴 중 하나를 따르는지
// 여기서 바로 드러나게 한다.
describe('savedColor', () => {
  it.each([
    '저장 실패 — 다시 시도해주세요',
    '아젠다 저장 실패 — 다시 시도해주세요',
    '공개하지 못했습니다 — 다시 시도해주세요',
    '전환하지 못했습니다 — 다시 시도해주세요',
    '저장 용량 초과 — 이 편집은 저장되지 않았습니다. 이미지를 지우거나 줄여주세요',
    '2건 삭제 실패 — 사유',
    '1건 반영 실패 — 사유',
  ])('실패 문구 "%s"는 danger 색', (message) => {
    expect(savedColor(message)).toBe(UI.toneDangerFg);
  });

  it.each(['변경 저장 중…', '공개하는 중…', '비공개로 전환하는 중…', '삭제하는 중…', '일괄 반영 중…'])(
    '진행 중 문구 "%s"는 muted 색',
    (message) => {
      expect(savedColor(message)).toBe(UI.muted);
    },
  );

  it.each(['방금 저장됨', '공개됨', '비공개로 전환됨', '삭제됨', '되돌렸습니다'])(
    '성공 문구 "%s"는 green 색',
    (message) => {
      expect(savedColor(message)).toBe(UI.green);
    },
  );
});
