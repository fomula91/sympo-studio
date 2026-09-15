'use client';

// 인트로 페이지 전용 — 기능 목록을 선택하면 스크린샷이 바뀌는 쇼케이스.
// 데스크톱(>=1024px)은 왼쪽 세로 목록 + 오른쪽 화면, 태블릿·모바일은
// 위쪽 가로 탭 + 아래 전체 폭 화면으로 바뀐다(디자인 리뷰 — 좁은 화면에서
// 목록이 320px를 차지해 화면이 지나치게 작아지는 문제).
import { useState } from 'react';

interface FeatureItem {
  key: string;
  label: string;
  desc: string;
  src: string;
}

export default function FeatureShowcase({ items }: { items: FeatureItem[] }) {
  const [active, setActive] = useState(0);

  return (
    <div className="feature-showcase" style={{ gap: 32, alignItems: 'start' }}>
      <div className="feature-tabs">
        {items.map((it, i) => {
          const isActive = i === active;
          return (
            <button
              key={it.key}
              onClick={() => setActive(i)}
              aria-pressed={isActive}
              aria-controls="feature-showcase-panel"
              className="feature-tab"
              style={{
                textAlign: 'left',
                border: 'none',
                borderLeft: `2px solid ${isActive ? 'var(--intro-accent)' : 'transparent'}`,
                background: isActive ? 'var(--intro-card)' : 'transparent',
                borderRadius: 10,
                padding: '14px 16px',
                cursor: 'pointer',
                color: 'var(--intro-title)',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: isActive ? 'var(--intro-accent)' : 'var(--intro-title)' }}>
                {it.label}
              </div>
              <div className="feature-tab-desc" style={{ fontSize: 14, color: 'var(--intro-body)', lineHeight: 1.55 }}>
                {it.desc}
              </div>
            </button>
          );
        })}
      </div>
      <div
        id="feature-showcase-panel"
        style={{
          borderRadius: 20,
          overflow: 'hidden',
          border: '1px solid var(--intro-border)',
          background: 'var(--intro-card)',
        }}
      >
        {items.map((it, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={it.key}
            src={it.src}
            alt={it.label}
            width={1440}
            height={900}
            style={{ width: '100%', height: 'auto', display: i === active ? 'block' : 'none' }}
          />
        ))}
      </div>
    </div>
  );
}
