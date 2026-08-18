import type { CSSProperties } from 'react';
import { MONO, UI } from '@/lib/ui';

// 라운드 사각형 컨테이너 안에 라운드 사각형 두 개가 어긋나게 겹친 마크.
// 에디터 프리뷰와 참가자 뷰어가 같은 컴포넌트라 어긋날 수 없다는 것을 형태로 표현한다.
export function LogoMark({ size = 44 }: { size?: number }) {
  const r = size / 44;
  const containerRadius = 12 * r;
  const sq = 16 * r;
  const sqRadius = 4.5 * r;
  const outline = 2.5 * r;
  const rear = 11 * r;
  const front = 18 * r;

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        borderRadius: containerRadius,
        background: UI.brand,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: rear,
          top: rear,
          width: sq,
          height: sq,
          borderRadius: sqRadius,
          border: `${outline}px solid #fff`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: front,
          top: front,
          width: sq,
          height: sq,
          borderRadius: sqRadius,
          background: '#fff',
        }}
      />
    </div>
  );
}

export function LogoLockup({ size = 44 }: { size?: number }) {
  const wordStyle: CSSProperties = {
    fontSize: size * 0.34,
    fontWeight: 750,
    letterSpacing: '-0.045em',
    color: UI.ink,
    lineHeight: 1.1,
  };
  const subStyle: CSSProperties = {
    fontFamily: MONO,
    fontSize: size * 0.19,
    letterSpacing: '0.34em',
    color: UI.brand,
    marginTop: size * 0.06,
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
