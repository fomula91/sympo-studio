'use client';

// 인트로 페이지 전용 — 왼쪽 기능 목록을 클릭하면 오른쪽 스크린샷이 바뀌는 탭형 쇼케이스.
import { useState } from 'react';

interface FeatureItem {
  key: string;
  label: string;
  desc: string;
  src: string;
}

export default function FeatureShowcase({ items }: { items: FeatureItem[] }) {
  const [active, setActive] = useState(0);
  const current = items[active];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 320px) 1fr',
        gap: 32,
        alignItems: 'start',
      }}
      className="feature-showcase"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((it, i) => {
          const isActive = i === active;
          return (
            <button
              key={it.key}
              onClick={() => setActive(i)}
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
              <div style={{ fontSize: 14, color: 'var(--intro-body)', lineHeight: 1.55 }}>{it.desc}</div>
            </button>
          );
        })}
      </div>
      <div
        style={{
          borderRadius: 20,
          overflow: 'hidden',
          border: '1px solid var(--intro-border)',
          background: 'var(--intro-card)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.src} alt={current.label} style={{ width: '100%', display: 'block' }} />
      </div>
    </div>
  );
}
