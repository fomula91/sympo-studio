import type { CSSProperties } from 'react';
import { MONO, UI } from '@/lib/ui';

// public/logo-mark.png — 3개 가로 바(아젠다 블록) 마크. 모서리는 이미지 자체에
// 이미 둥글게+투명 처리돼 있다(scratchpad/process-logo.js 참조).
export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-mark.png"
      alt="SYMPO STUDIO"
      width={size}
      height={size}
      style={{ width: size, height: size, flex: `0 0 ${size}px`, display: 'block' }}
    />
  );
}

// ink/sub는 배경에 맞춰 넘긴다 — 다크 배경(인트로 페이지 등)에서 라이트 셸 색을 그대로 쓰면 안 보인다.
export function LogoLockup({ size = 44, ink = UI.ink, sub = UI.brand }: { size?: number; ink?: string; sub?: string }) {
  const wordStyle: CSSProperties = {
    fontSize: size * 0.46,
    fontWeight: 750,
    letterSpacing: '-0.04em',
    color: ink,
    lineHeight: 1.1,
  };
  const subStyle: CSSProperties = {
    fontFamily: MONO,
    fontSize: size * 0.24,
    letterSpacing: '0.3em',
    color: sub,
    marginTop: size * 0.07,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size / 3 }}>
      <LogoMark size={size} />
      <div>
        <div style={wordStyle}>SYMPO</div>
        <div style={subStyle}>STUDIO</div>
      </div>
    </div>
  );
}
