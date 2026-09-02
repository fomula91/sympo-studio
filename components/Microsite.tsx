'use client';

import { useState, type CSSProperties } from 'react';
import QaPanel from '@/components/QaPanel';
import { KV_PATTERNS, type Theme } from '@/lib/theme';
import type { Density, DocumentInfo, EventInfo, KvPattern, Session } from '@/lib/types';
import { useOnlineStatus } from '@/lib/useOnlineStatus';

const MONO = 'ui-monospace, monospace';

interface MicrositeProps {
  theme: Theme;
  sessions: Session[];
  icons: string[];
  event: EventInfo;
  /** 참가자 공개 페이지(`/[slug]`)에서만 넘긴다 — 실제 D1 이벤트에 Q&A GET·POST를 보낼 때 쓰는 id. */
  eventId?: number;
  /** 스튜디오 에디터·뷰어 미리보기에서 true — Q&A 입력·폴링을 렌더하지 않아 목업 편집 중에 실제 행사 데이터를 건드리지 않는다. */
  preview?: boolean;
  /** 참가자 공개 페이지에서만 넘긴다 — 없으면(스튜디오 미리보기) 대표 예시 2건을 보여준다. */
  documents?: DocumentInfo[];
  kv?: string;
  kvPattern?: KvPattern;
  density?: Density;
  wide?: boolean;
}

// 참가자 공개 페이지가 documents를 안 넘길 때(스튜디오 미리보기)만 쓰는 대표 예시.
const DEMO_DOCUMENTS: DocumentInfo[] = [
  { id: -1, name: 'Early Intervention Strategies with ATELOVAN', status: 'ready', pages: 24 },
  { id: -2, name: 'Long-Term Adherence: RWE Review', status: 'ready', pages: 18 },
];

export default function Microsite({
  theme: t,
  sessions,
  icons,
  event: ev,
  eventId,
  preview = false,
  documents,
  kv = '',
  kvPattern = 'stripe',
  density = '기본',
  wide = false,
}: MicrositeProps) {
  const online = useOnlineStatus();
  const [qaOpen, setQaOpen] = useState(false);
  const docs = documents ?? DEMO_DOCUMENTS;
  const gap = density === '컴팩트' ? 6 : density === '여유' ? 14 : 9;
  const pad = density === '컴팩트' ? 11 : density === '여유' ? 18 : 14;

  const bg = kv ? `url("${kv}") center/cover` : KV_PATTERNS[kvPattern](t);
  const heroFg = `oklch(0.985 0.006 ${t.h})`;

  const sectionLabel: CSSProperties = {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: '0.16em',
    color: t.muted,
    margin: '0 0 11px',
    textTransform: 'uppercase',
  };

  const numberIcons = icons[0].length > 1;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        background: t.bg,
        color: t.ink,
        fontFamily: "var(--font-pretendard), 'Helvetica Neue', Helvetica, sans-serif",
        letterSpacing: '-0.01em',
      }}
    >
      <div style={{ position: 'relative', height: wide ? 244 : 210, background: bg, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(to bottom, ${
              t.mode === 'dark'
                ? 'oklch(0 0 0 / 0.28), oklch(0 0 0 / 0.7)'
                : 'oklch(0 0 0 / 0.18), oklch(0 0 0 / 0.58)'
            })`,
          }}
        />
        <div
          style={{
            position: 'relative',
            padding: '22px 20px 20px',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: heroFg,
                color: `oklch(0.26 0.02 ${t.h})`,
                display: 'grid',
                placeItems: 'center',
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              S
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: '0.16em',
                color: heroFg,
                opacity: 0.92,
                textTransform: 'uppercase',
              }}
            >
              {ev.brandLabel || 'SYMPO STUDIO'}
            </div>
          </div>
          <div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 11.5,
                letterSpacing: '0.1em',
                color: heroFg,
                opacity: 0.86,
                marginBottom: 7,
              }}
            >
              {(ev.date || '2026-08-15').replace(/-/g, '. ')}
            </div>
            <div
              style={{
                fontSize: wide ? 30 : 25,
                fontWeight: 750,
                letterSpacing: '-0.035em',
                lineHeight: 1.2,
                color: heroFg,
                textWrap: 'pretty',
                marginBottom: 8,
              }}
            >
              {ev.title || 'MERIDIAN 심포지엄'}
            </div>
            <div style={{ fontSize: 12.5, color: heroFg, opacity: 0.88 }}>
              {ev.venue || '아르떼 호텔 서울'} · {ev.host || '좌장 서정우'}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          background: t.surface,
          borderBottom: `1px solid ${t.line}`,
          position: 'sticky',
          top: 0,
          zIndex: 2,
        }}
      >
        {['아젠다', '자료', 'Q&A', '설문'].map((label, i) => (
          <div
            key={label}
            style={{
              height: 60,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              cursor: 'pointer',
              color: i === 0 ? t.brand : t.muted,
              borderBottom: `3px solid ${i === 0 ? t.brand : 'transparent'}`,
            }}
          >
            <div
              style={{
                fontSize: numberIcons ? 12 : 16,
                lineHeight: 1,
                fontFamily: numberIcons ? MONO : 'inherit',
                fontWeight: 700,
              }}
            >
              {icons[i]}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 650, letterSpacing: '-0.01em' }}>{label}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: wide ? '22px 28px 32px' : '18px 16px 28px',
          maxWidth: wide ? 760 : 'none',
          margin: '0 auto',
        }}
      >
        <div style={sectionLabel}>아젠다</div>
        <ol
          style={{
            listStyle: 'none',
            margin: '0 0 24px',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap,
          }}
        >
          {sessions.map((s) => (
            <li
              key={s.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                background: t.surface,
                border: `1px solid ${t.line}`,
                borderRadius: 13,
                padding: `${pad}px 13px`,
              }}
            >
              <div
                style={{
                  width: 46,
                  flex: '0 0 46px',
                  fontFamily: MONO,
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  color: t.brand,
                  paddingTop: 1,
                }}
              >
                {s.time}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 650,
                    lineHeight: 1.4,
                    letterSpacing: '-0.02em',
                    color: t.ink,
                    textWrap: 'pretty',
                  }}
                >
                  {s.title}
                </div>
                <div style={{ fontSize: 12, color: t.muted, marginTop: 4, lineHeight: 1.45 }}>{s.speaker}</div>
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: '0.08em',
                  color: t.muted,
                  background: t.soft,
                  padding: '4px 6px',
                  borderRadius: 5,
                  flex: '0 0 auto',
                }}
              >
                {s.kind}
              </div>
            </li>
          ))}
        </ol>

        <div style={sectionLabel}>자료</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {docs.length === 0 ? (
            <div style={{ fontSize: 12.5, color: t.muted }}>등록된 자료가 없습니다.</div>
          ) : (
            docs.map((f) => {
              const pending = f.status === 'pending';
              return (
                <div
                  key={f.id}
                  aria-disabled={pending}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: t.surface,
                    border: `1px solid ${t.line}`,
                    borderRadius: 13,
                    padding: '12px 13px',
                    cursor: pending ? 'not-allowed' : 'pointer',
                    opacity: pending ? 0.6 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 40,
                      flex: '0 0 34px',
                      borderRadius: 7,
                      background: t.soft,
                      color: t.brand,
                      display: 'grid',
                      placeItems: 'center',
                      fontFamily: MONO,
                      fontSize: 8,
                      fontWeight: 800,
                    }}
                  >
                    PDF
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 650,
                        letterSpacing: '-0.02em',
                        lineHeight: 1.35,
                        color: t.ink,
                      }}
                    >
                      {f.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: t.muted, marginTop: 3 }}>
                      {pending ? '준비 중' : `${f.pages ?? '?'}p · 앱 내 열람`}
                    </div>
                  </div>
                  <div style={{ color: t.muted, fontSize: 14 }}>→</div>
                </div>
              );
            })
          )}
        </div>

        {!preview && !online && (ev.engage.qa !== false || ev.engage.survey !== false) ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12.5,
              color: t.muted,
              marginBottom: 10,
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: 99, background: t.muted, flex: '0 0 6px' }} />
            오프라인 상태 — 연결되면 다시 시도하세요
          </div>
        ) : null}
        {ev.engage.qa !== false &&
          (preview ? (
            <div
              aria-disabled
              style={{
                height: 54,
                borderRadius: 14,
                background: 'transparent',
                border: `1px solid ${t.line}`,
                color: t.muted,
                display: 'grid',
                placeItems: 'center',
                fontSize: 13,
                fontWeight: 650,
                letterSpacing: '-0.02em',
                marginBottom: 10,
                cursor: 'not-allowed',
              }}
            >
              질문 남기기 (미리보기 — 참가자 페이지에서만 동작)
            </div>
          ) : qaOpen && eventId != null ? (
            <QaPanel theme={t} online={online} eventId={eventId} />
          ) : (
            <button
              type="button"
              onClick={() => setQaOpen(true)}
              disabled={!online}
              style={{
                width: '100%',
                height: 54,
                borderRadius: 14,
                border: 'none',
                background: t.brand,
                color: t.onBrand,
                fontFamily: 'inherit',
                fontSize: 14.5,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                cursor: online ? 'pointer' : 'not-allowed',
                opacity: online ? 1 : 0.45,
                marginBottom: 10,
              }}
            >
              질문 남기기
            </button>
          ))}
        {ev.engage.survey !== false && (
          <div
            aria-disabled={!online}
            style={{
              height: 54,
              borderRadius: 14,
              background: 'transparent',
              border: `1px solid ${t.line}`,
              color: t.ink,
              display: 'grid',
              placeItems: 'center',
              fontSize: 14,
              fontWeight: 650,
              letterSpacing: '-0.02em',
              cursor: online ? 'pointer' : 'not-allowed',
              opacity: online ? 1 : 0.45,
            }}
          >
            설문 참여 · 2분
          </div>
        )}
      </div>
    </div>
  );
}
