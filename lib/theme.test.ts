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

  it('채도가 지나치게 높은 조합은 저장을 막아야 한다', () => {
    // c=0.8은 기존 프리셋(0.028~0.125)보다 훨씬 높은 채도 — "브랜드 위 텍스트"가
    // 4.48:1로 기준(4.5:1)에 살짝 못 미친다. 근사식(L³)이었다면 이 미세한 미달을
    // 못 잡아냈을 수 있다 — 실제 sRGB 변환이라야 걸러진다.
    const failing = { id: 'test-fail', label: '테스트용 실패 케이스', h: 180, c: 0.8 };
    expect(contrastAllPass(failing, 'light')).toBe(false);

    const rows = contrastRows(derive(failing, 'light'), 'light');
    const onBrandRow = rows.find((r) => r.label === '브랜드 위 텍스트');
    expect(onBrandRow?.pass).toBe(false);
  });
});
