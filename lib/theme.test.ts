import { describe, expect, it } from 'vitest';
import { contrastAllPass, contrastRows, derive, PRESETS } from './theme';
import type { Mode } from './types';

const MODES: Mode[] = ['light', 'dark'];

describe('contrastAllPass', () => {
  for (const preset of PRESETS) {
    for (const mode of MODES) {
      it(`${preset.id} / ${mode}은 WCAG 기준을 통과한다`, () => {
        expect(contrastAllPass(preset, mode)).toBe(true);
      });
    }
  }

  it('sRGB 감이 밖 채도는 클램핑된 실제 렌더 색 기준으로 판정한다', () => {
    // c=0.8은 sRGB로 표현 불가능한 채도(프리셋 최대 0.125의 6배 이상). culori wcagContrast는
    // 감이 클램핑을 하지 않아 이 채도를 그대로 넣으면 "브랜드 위 텍스트" 계산에 음수 RGB 채널이
    // 섞여 실제보다 낮은 4.48:1(기준 4.5:1 미달)이 나온다 — 화면에는 절대 이렇게 렌더되지 않는데도.
    // 게이트가 toGamut('rgb')로 클램핑한 색을 쓰면 실제 렌더와 같은 5.76:1로 정상 통과한다.
    const oob = { id: 'test-oob', label: '감이 밖 채도', h: 180, c: 0.8 };
    expect(contrastAllPass(oob, 'light')).toBe(true);

    const rows = contrastRows(derive(oob, 'light'), 'light');
    const onBrandRow = rows.find((r) => r.label === '브랜드 위 텍스트');
    expect(onBrandRow?.pass).toBe(true);
  });

  it('FE-8 추출 가능 최대 채도(~0.32) 범위에서도 히어로 행이 실제 렌더 기준으로 통과한다', () => {
    // FE-8(이미지에서 브랜드 컬러 추출)이 실제 사진에서 뽑아낼 수 있는 채도의 상한이 ~0.32다.
    // "히어로 텍스트 / 키 비주얼" 행은 프리셋 채도를 감쇠 없이 그대로 쓰므로 감이 밖으로 나가기
    // 가장 쉬운 자리 — 이 범위에서 클램핑 전후 판정이 뒤집히지 않는지 회귀 확인.
    for (const h of [165, 180, 200]) {
      for (const c of [0.28, 0.3, 0.32]) {
        expect(contrastAllPass({ id: 'gamut-ceiling', label: '추출 상한', h, c }, 'light')).toBe(true);
      }
    }
  });
});
