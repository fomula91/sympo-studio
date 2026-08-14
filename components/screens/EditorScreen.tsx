'use client';

import { useCallback, useEffect, useRef } from 'react';
import Microsite from '@/components/Microsite';
import { autoSlug, DOCS, ENGAGE_DEFS, FIELD_DEFS, SECTIONS, SESSION_LIB } from '@/lib/data';
import { contrastRows, derive, ICONSETS, PRESETS } from '@/lib/theme';
import type { Density, Device, IconSetId, KvPattern, Mode, PatchFn, StudioState } from '@/lib/types';
import { ghostBtn, MONO, monoLabel, seg, UI } from '@/lib/ui';

const MODES: { k: Mode; label: string }[] = [
  { k: 'light', label: '라이트' },
  { k: 'dark', label: '다크' },
];
const DENSITIES: Density[] = ['컴팩트', '기본', '여유'];
const DEVICES: { k: Device; label: string }[] = [
  { k: 'mobile', label: '모바일' },
  { k: 'tablet', label: '태블릿' },
];
const KV_CHOICES: { k: KvPattern; label: string }[] = [
  { k: 'stripe', label: '사선 패턴' },
  { k: 'grid', label: '그리드 패턴' },
  { k: 'flat', label: '단색' },
];

const sectionTitle = { margin: '0 0 6px', fontSize: 20, fontWeight: 700, letterSpacing: '-0.025em' } as const;
const sectionDesc = {
  margin: '0 0 24px',
  fontSize: 13,
  color: UI.muted,
  lineHeight: 1.6,
} as const;

function AgendaSection({ s, patch }: { s: StudioState; patch: PatchFn }) {
  const startDrag = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    patch({ dragIdx: idx });
    const move = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const row = el?.closest?.('[data-idx]');
      if (!row) return;
      const to = parseInt(row.getAttribute('data-idx') ?? '', 10);
      patch((st) => {
        if (st.dragIdx < 0 || to === st.dragIdx || isNaN(to)) return null;
        const arr = st.sessions.slice();
        const [it] = arr.splice(st.dragIdx, 1);
        arr.splice(to, 0, it);
        return { sessions: arr, dragIdx: to, saved: '변경 저장 중…' };
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      patch({ dragIdx: -1, saved: '방금 저장됨' });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 6 }}>
        <h2 style={{ ...sectionTitle, margin: 0 }}>아젠다</h2>
        <div style={{ flex: 1 }} />
        <button
          className="hv-bg965"
          onClick={() =>
            patch((st) => {
              const pick = SESSION_LIB[st.sessions.length % SESSION_LIB.length];
              return { sessions: [...st.sessions, { id: Date.now(), ...pick }], saved: '방금 저장됨' };
            })
          }
          style={{ ...ghostBtn, fontWeight: 600 }}
        >
          라이브러리에서 가져오기
        </button>
      </div>
      <p style={sectionDesc}>이미지 슬라이드가 아니라 구조화된 세션 레코드입니다. 순서는 핸들을 끌어 바꿉니다.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {s.sessions.map((x, i) => (
          <div
            key={x.id}
            data-idx={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#fff',
              borderRadius: 12,
              padding: '6px 8px 6px 0',
              userSelect: 'none',
              border: `1px solid ${s.dragIdx === i ? UI.ink : UI.line}`,
              boxShadow: s.dragIdx === i ? '0 10px 24px -12px oklch(0.4 0.02 250 / 0.4)' : undefined,
            }}
          >
            <div
              className="hv-ink"
              onPointerDown={startDrag(i)}
              style={{
                width: 44,
                height: 56,
                flex: '0 0 44px',
                display: 'grid',
                placeItems: 'center',
                cursor: 'grab',
                touchAction: 'none',
                color: 'oklch(0.7 0.006 250)',
                fontSize: 15,
                letterSpacing: 1,
              }}
            >
              ⠿
            </div>
            <div
              style={{
                width: 74,
                flex: '0 0 74px',
                fontFamily: MONO,
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: '-0.02em',
              }}
            >
              {x.time}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 650,
                  letterSpacing: '-0.015em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {x.title}
              </div>
              <div style={{ fontSize: 12, color: 'oklch(0.56 0.008 250)', marginTop: 3 }}>{x.speaker}</div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'oklch(0.68 0.006 250)', paddingRight: 6 }}>
              {x.kind}
            </div>
            <button
              className="hv-x"
              onClick={() =>
                patch((st) => ({ sessions: st.sessions.filter((_, j) => j !== i), saved: '방금 저장됨' }))
              }
              style={{
                width: 44,
                height: 44,
                flex: '0 0 44px',
                border: 'none',
                background: 'transparent',
                borderRadius: 10,
                color: 'oklch(0.65 0.006 250)',
                fontSize: 15,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function BasicSection({ s, patch }: { s: StudioState; patch: PatchFn }) {
  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={sectionTitle}>기본 정보</h2>
      <p style={sectionDesc}>
        한 문자열에 인코딩되어 있던 제목을 필드로 분해했습니다. 슬러그는 자동 생성되고 중복을 검사합니다.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {FIELD_DEFS.map((f) => (
          <label key={f.k} style={{ display: 'block' }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 650,
                color: 'oklch(0.45 0.008 250)',
                marginBottom: 7,
                letterSpacing: '-0.01em',
              }}
            >
              {f.label}
            </div>
            <input
              className="inp"
              value={s[f.k]}
              onChange={(e) => patch({ [f.k]: e.target.value, saved: '변경 저장 중…' })}
              style={{
                width: '100%',
                height: 52,
                borderRadius: 12,
                border: `1px solid ${UI.line}`,
                background: '#fff',
                padding: '0 16px',
                fontSize: 14.5,
                color: UI.ink,
                outline: 'none',
              }}
            />
            <div style={{ fontSize: 11.5, color: UI.faint, marginTop: 6 }}>{f.hint}</div>
          </label>
        ))}
        <div style={{ border: `1px solid ${UI.line}`, borderRadius: 12, background: '#fff', padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 650, color: 'oklch(0.45 0.008 250)', marginBottom: 8 }}>
            생성될 URL
          </div>
          <div style={{ fontFamily: MONO, fontSize: 13, color: 'oklch(0.28 0.008 250)', wordBreak: 'break-all' }}>
            sympo.studio/{autoSlug(s.title, s.venue, s.date)}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              marginTop: 10,
              fontSize: 12,
              color: 'oklch(0.45 0.09 145)',
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: 99, background: UI.green }} />
            중복 없음 · 회차마다 고유
          </div>
        </div>
      </div>
    </div>
  );
}

function DocsSection() {
  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={sectionTitle}>자료</h2>
      <p style={sectionDesc}>강의자료와 제품소개를 한 곳에서 다룹니다. 해시 파일명 대신 표시명을 관리합니다.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {DOCS.map((d) => (
          <div
            key={d.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              background: '#fff',
              border: `1px solid ${UI.line}`,
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            <div
              style={{
                width: 40,
                height: 44,
                flex: '0 0 40px',
                borderRadius: 8,
                background: UI.soft,
                display: 'grid',
                placeItems: 'center',
                fontFamily: MONO,
                fontSize: 9,
                fontWeight: 700,
                color: 'oklch(0.48 0.008 250)',
              }}
            >
              PDF
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 650,
                  letterSpacing: '-0.015em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {d.name}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: 'oklch(0.66 0.006 250)', marginTop: 3 }}>
                {d.meta}
              </div>
            </div>
            <div
              style={{
                flex: '0 0 auto',
                padding: '5px 10px',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 650,
                background: UI.soft,
                color: 'oklch(0.45 0.008 250)',
              }}
            >
              {d.tag}
            </div>
          </div>
        ))}
        <div
          style={{
            height: 64,
            border: '1px dashed oklch(0.86 0.005 250)',
            borderRadius: 12,
            display: 'grid',
            placeItems: 'center',
            fontFamily: MONO,
            fontSize: 11,
            color: UI.faint,
            letterSpacing: '0.02em',
          }}
        >
          PDF 드롭 · 표시명 자동 추론
        </div>
      </div>
    </div>
  );
}

function EngageSection({ s, patch }: { s: StudioState; patch: PatchFn }) {
  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={sectionTitle}>참여</h2>
      <p style={sectionDesc}>Q&A와 설문을 외부 링크·QR 이미지 대신 페이지 안에서 완결시킵니다.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ENGAGE_DEFS.map((t) => {
          const on = s.engage[t.k];
          return (
            <button
              key={t.k}
              className="hv-border80"
              onClick={() =>
                patch((st) => ({ engage: { ...st.engage, [t.k]: !st.engage[t.k] }, saved: '방금 저장됨' }))
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                background: '#fff',
                border: `1px solid ${UI.line}`,
                borderRadius: 12,
                padding: '14px 16px',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: '-0.015em' }}>{t.label}</div>
                <div style={{ fontSize: 12, color: 'oklch(0.58 0.008 250)', marginTop: 3 }}>{t.desc}</div>
              </div>
              <div
                style={{
                  width: 52,
                  height: 32,
                  flex: '0 0 52px',
                  borderRadius: 99,
                  padding: 3,
                  display: 'flex',
                  justifyContent: on ? 'flex-end' : 'flex-start',
                  background: on ? UI.ink : 'oklch(0.9 0.004 250)',
                }}
              >
                <div style={{ width: 26, height: 26, borderRadius: 99, background: '#fff' }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ThemeSection({ s, patch, showContrast }: { s: StudioState; patch: PatchFn; showContrast: boolean }) {
  const preset = PRESETS.find((p) => p.id === s.presetId) || PRESETS[0];
  const theme = derive(preset, s.mode);
  const cRows = contrastRows(theme, s.mode);
  const allPass = cRows.every((r) => r.pass);

  return (
    <div style={{ maxWidth: 660 }}>
      <h2 style={sectionTitle}>테마 스튜디오</h2>
      <p style={sectionDesc}>
        기존 HEX 12개 입력을 프리셋 1회 선택으로 대체했습니다. 대비비가 기준 미달인 조합은 만들 수 없습니다.
      </p>

      <div style={{ ...monoLabel, marginBottom: 10 }}>01 · 브랜드 프리셋</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 10,
          marginBottom: 28,
        }}
      >
        {PRESETS.map((p) => {
          const t = derive(p, s.mode);
          const on = s.presetId === p.id;
          const sw = { width: 14, height: 28, borderRadius: 4 } as const;
          return (
            <button
              key={p.id}
              className="hv-border78"
              onClick={() => patch({ presetId: p.id, saved: '테마 반영됨' })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                height: 60,
                padding: '0 14px',
                borderRadius: 13,
                cursor: 'pointer',
                background: '#fff',
                border: `1px solid ${on ? UI.ink : UI.line}`,
              }}
            >
              <div style={{ display: 'flex', gap: 5 }}>
                <div style={{ ...sw, background: t.brand }} />
                <div style={{ ...sw, background: t.soft }} />
                <div style={{ ...sw, background: t.ink }} />
              </div>
              <div style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: 650, letterSpacing: '-0.015em' }}>
                {p.label}
              </div>
              <div style={{ fontSize: 13, color: 'oklch(0.5 0.008 250)' }}>{on ? '✓' : ''}</div>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 28 }}>
        <div>
          <div style={{ ...monoLabel, marginBottom: 10 }}>02 · 표면</div>
          <div
            style={{
              display: 'flex',
              background: '#fff',
              border: `1px solid ${UI.line}`,
              borderRadius: 12,
              padding: 5,
              gap: 4,
            }}
          >
            {MODES.map((m) => (
              <button key={m.k} onClick={() => patch({ mode: m.k, saved: '테마 반영됨' })} style={seg(s.mode === m.k)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ ...monoLabel, marginBottom: 10 }}>03 · 아이콘 세트</div>
          <div
            style={{
              display: 'flex',
              background: '#fff',
              border: `1px solid ${UI.line}`,
              borderRadius: 12,
              padding: 5,
              gap: 4,
            }}
          >
            {(Object.keys(ICONSETS) as IconSetId[]).map((k) => (
              <button
                key={k}
                onClick={() => patch({ iconSet: k, saved: '테마 반영됨' })}
                style={seg(s.iconSet === k)}
              >
                {ICONSETS[k].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ ...monoLabel, marginBottom: 10 }}>04 · 밀도</div>
          <div
            style={{
              display: 'flex',
              background: '#fff',
              border: `1px solid ${UI.line}`,
              borderRadius: 12,
              padding: 5,
              gap: 4,
            }}
          >
            {DENSITIES.map((d) => (
              <button
                key={d}
                onClick={() => patch({ density: d, saved: '테마 반영됨' })}
                style={seg(s.density === d)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ ...monoLabel, marginBottom: 10 }}>05 · 키 비주얼</div>
      <div
        onDrop={(e) => {
          e.preventDefault();
          patch({ dragOver: false });
          const f = e.dataTransfer?.files?.[0];
          if (f && f.type.startsWith('image')) {
            patch({ keyVisual: URL.createObjectURL(f), saved: '키 비주얼 교체됨' });
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!s.dragOver) patch({ dragOver: true });
        }}
        onDragLeave={() => patch({ dragOver: false })}
        style={{
          height: 150,
          borderRadius: 14,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
          background: s.dragOver ? UI.soft : '#fff',
          border: `1.5px dashed ${s.dragOver ? 'oklch(0.35 0.008 250)' : 'oklch(0.86 0.005 250)'}`,
        }}
      >
        {s.keyVisual ? (
          <div
            role="img"
            aria-label="키 비주얼"
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 13,
              background: `url("${s.keyVisual}") center/cover no-repeat`,
            }}
          />
        ) : (
          <div
            style={{
              textAlign: 'center',
              fontFamily: MONO,
              fontSize: 11,
              color: 'oklch(0.6 0.006 250)',
              lineHeight: 1.9,
              letterSpacing: '0.02em',
            }}
          >
            key visual · 1600 × 640
            <br />
            이미지를 이 영역에 드롭
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {KV_CHOICES.map((p) => (
          <button
            key={p.k}
            onClick={() => patch({ kvPattern: p.k, keyVisual: '', saved: '키 비주얼 교체됨' })}
            style={{
              height: 44,
              padding: '0 14px',
              borderRadius: 10,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 650,
              background: '#fff',
              border: `1px solid ${s.kvPattern === p.k && !s.keyVisual ? UI.ink : 'oklch(0.9 0.004 250)'}`,
              color: 'oklch(0.35 0.008 250)',
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          className="hv-bg965"
          onClick={() => patch({ keyVisual: '', kvPattern: 'none' })}
          style={{
            height: 44,
            padding: '0 14px',
            borderRadius: 10,
            border: '1px solid oklch(0.9 0.004 250)',
            background: '#fff',
            fontSize: 12,
            fontWeight: 600,
            color: 'oklch(0.5 0.008 250)',
            cursor: 'pointer',
          }}
        >
          비우기
        </button>
      </div>

      {showContrast ? (
        <div
          style={{
            marginTop: 28,
            border: `1px solid ${UI.line}`,
            borderRadius: 14,
            background: '#fff',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 16px',
              borderBottom: `1px solid ${UI.lineFaint}`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.015em' }}>대비비 검증</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: UI.faint, letterSpacing: '0.06em' }}>
              WCAG AA · 저장 게이트
            </div>
            <div style={{ flex: 1 }} />
            <div
              style={{
                padding: '5px 11px',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 700,
                background: allPass ? 'oklch(0.955 0.03 145)' : 'oklch(0.955 0.04 28)',
                color: allPass ? 'oklch(0.4 0.1 145)' : 'oklch(0.5 0.15 28)',
              }}
            >
              {allPass ? '저장 허용' : '저장 차단'}
            </div>
          </div>
          {cRows.map((r) => (
            <div
              key={r.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 16px',
                borderBottom: '1px solid oklch(0.965 0.003 250)',
              }}
            >
              <div style={{ flex: 1, fontSize: 12.5, color: 'oklch(0.42 0.008 250)' }}>{r.label}</div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  fontVariantNumeric: 'tabular-nums',
                  color: 'oklch(0.3 0.008 250)',
                }}
              >
                {r.ratio}
              </div>
              <div
                style={{
                  width: 46,
                  textAlign: 'center',
                  padding: '4px 0',
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: MONO,
                  background: r.pass ? 'oklch(0.955 0.03 145)' : 'oklch(0.955 0.04 28)',
                  color: r.pass ? 'oklch(0.42 0.1 145)' : 'oklch(0.5 0.15 28)',
                }}
              >
                {r.pass ? 'AA' : '미달'}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function EditorScreen({ s, patch }: { s: StudioState; patch: PatchFn }) {
  const preset = PRESETS.find((p) => p.id === s.presetId) || PRESETS[0];
  const theme = derive(preset, s.mode);
  const icons = ICONSETS[s.iconSet].glyphs;
  const ev = {
    title: s.title,
    venue: s.venue,
    date: s.date,
    host: s.host,
    cap: s.cap,
    engage: s.engage,
    brandLabel: preset.label,
  };

  const roRef = useRef<ResizeObserver | null>(null);
  const pvRef = useCallback(
    (el: HTMLDivElement | null) => {
      roRef.current?.disconnect();
      if (!el || typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(() => {
        const w = el.clientWidth;
        if (w) patch((st) => (w !== st.paneW ? { paneW: w } : null));
      });
      ro.observe(el);
      roRef.current = ro;
    },
    [patch],
  );
  useEffect(() => () => roRef.current?.disconnect(), []);

  const kvW = s.device === 'mobile' ? 390 : 834;
  const kvH = s.device === 'mobile' ? 780 : 620;
  const avail = Math.max(240, (s.paneW || 472) - 40);
  const scale = Math.min(1, avail / kvW);

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <div
        style={{
          width: 180,
          flex: '0 0 180px',
          borderRight: `1px solid ${UI.line}`,
          background: '#fff',
          padding: '16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        <div style={{ ...monoLabel, color: 'oklch(0.65 0.006 250)', padding: '6px 10px 10px' }}>SECTIONS</div>
        {SECTIONS.map((x) => {
          const meta =
            x.id === 'agenda' ? String(s.sessions.length) : x.id === 'theme' ? preset.label.split(' ')[0] : x.meta;
          return (
            <button
              key={x.id}
              className="hv-bg962"
              onClick={() => patch({ section: x.id })}
              style={{
                width: '100%',
                height: 48,
                padding: '0 12px',
                borderRadius: 11,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 13.5,
                fontWeight: 650,
                letterSpacing: '-0.015em',
                textAlign: 'left',
                background: s.section === x.id ? 'oklch(0.945 0.003 250)' : 'transparent',
                color: 'oklch(0.26 0.008 250)',
              }}
            >
              <span>{x.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, opacity: 0.55 }}>{meta}</span>
            </button>
          );
        })}
      </div>

      <div style={{ flex: '1 1 auto', minWidth: 440, overflow: 'auto', padding: '24px 28px 64px' }}>
        {s.section === 'agenda' ? <AgendaSection s={s} patch={patch} /> : null}
        {s.section === 'theme' ? <ThemeSection s={s} patch={patch} showContrast /> : null}
        {s.section === 'basic' ? <BasicSection s={s} patch={patch} /> : null}
        {s.section === 'docs' ? <DocsSection /> : null}
        {s.section === 'engage' ? <EngageSection s={s} patch={patch} /> : null}
      </div>

      <div
        style={{
          flex: '0 1 472px',
          minWidth: 300,
          borderLeft: `1px solid ${UI.line}`,
          background: UI.soft,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: 60,
            flex: '0 0 60px',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            gap: 10,
            borderBottom: `1px solid ${UI.line}`,
          }}
        >
          <div style={{ ...monoLabel, color: UI.muted }}>LIVE PREVIEW</div>
          <div style={{ flex: 1 }} />
          <div
            style={{
              display: 'flex',
              background: '#fff',
              border: '1px solid oklch(0.9 0.004 250)',
              borderRadius: 10,
              padding: 4,
              gap: 3,
            }}
          >
            {DEVICES.map((d) => (
              <button
                key={d.k}
                onClick={() => patch({ device: d.k })}
                style={{
                  height: 36,
                  padding: '0 13px',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 650,
                  background: s.device === d.k ? UI.ink : 'transparent',
                  color: s.device === d.k ? '#fff' : 'oklch(0.5 0.008 250)',
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div
          ref={pvRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            justifyContent: 'center',
            padding: '20px 0',
          }}
        >
          <div
            style={{
              width: Math.round(kvW * scale),
              height: Math.round(kvH * scale),
              borderRadius: s.device === 'mobile' ? 28 : 16,
              overflow: 'hidden',
              background: '#fff',
              boxShadow: '0 18px 44px -18px oklch(0.4 0.02 250 / 0.4)',
            }}
          >
            <div style={{ width: kvW, height: kvH, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <Microsite
                theme={theme}
                sessions={s.sessions}
                icons={icons}
                event={ev}
                kv={s.keyVisual}
                kvPattern={s.kvPattern}
                density={s.density}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
