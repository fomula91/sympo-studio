'use client';

import { METRICS, OPS } from '@/lib/data';
import type { StudioState } from '@/lib/types';
import { MONO, UI } from '@/lib/ui';

export default function ReportScreen({ s }: { s: StudioState }) {
  const bars = s.sessions.map((x, i) => ({
    label: `${x.time}  ${x.title}`,
    pct: 92 - i * 7 - (i % 2) * 4,
  }));

  return (
    <div style={{ padding: '24px 24px 80px', maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            padding: '5px 9px',
            borderRadius: 6,
            background: 'oklch(0.955 0.035 78)',
            color: 'oklch(0.44 0.09 68)',
          }}
        >
          샘플 데이터
        </div>
        <div style={{ fontSize: 12, color: UI.muted }}>
          실측값이 아닙니다. 어떤 지표를 봐야 하는지 보여주기 위한 화면입니다.
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
          marginBottom: 24,
        }}
      >
        {METRICS.map((m) => {
          const highlight = m.label === '색상 AA 통과율';
          return (
          <div
            key={m.label}
            style={{
              background: UI.surface,
              border: `1px solid ${highlight ? UI.brand : UI.line}`,
              boxShadow: highlight ? '0 0 0 3px oklch(0.475 0.11 205 / 0.09)' : undefined,
              borderRadius: 14,
              padding: '18px 20px',
            }}
          >
            <div style={{ fontSize: 12, color: UI.muted, marginBottom: 12 }}>{m.label}</div>
            <div
              style={{
                fontSize: 34,
                fontWeight: 700,
                letterSpacing: '-0.04em',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1,
                color: highlight ? UI.brand : UI.ink,
              }}
            >
              {m.value}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 11, color: UI.faint }}>이전 {m.before}</div>
              <div
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  background: 'oklch(0.955 0.03 145)',
                  color: 'oklch(0.4 0.1 145)',
                }}
              >
                {m.delta}
              </div>
            </div>
          </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ background: UI.surface, border: `1px solid ${UI.line}`, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
            세션별 열람률
          </div>
          <div style={{ fontSize: 12, color: UI.muted, marginBottom: 20 }}>
            260815 MERIDIAN 심포지엄 · 참가자 118명
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {bars.map((b) => (
              <div key={b.label}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 7 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      letterSpacing: '-0.01em',
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {b.label}
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 11.5,
                      color: UI.muted,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {b.pct}%
                  </div>
                </div>
                <div style={{ height: 8, borderRadius: 99, background: UI.brandSoft, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${b.pct}%`, borderRadius: 99, background: UI.brand }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: UI.surface, border: `1px solid ${UI.line}`, borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 20 }}>운영 지표</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {OPS.map((o) => (
              <div
                key={o.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '13px 0',
                  borderBottom: '1px solid var(--line-faint)',
                }}
              >
                <div style={{ flex: 1, fontSize: 12.5, color: UI.muted2 }}>{o.label}</div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 12,
                    color: UI.faint,
                    textDecoration: 'line-through',
                  }}
                >
                  {o.before}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: UI.brand }}>{o.after}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
