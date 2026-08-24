'use client';

import { useCallback, useState } from 'react';
import { LogoMark } from '@/components/Logo';
import ConsoleScreen from '@/components/screens/ConsoleScreen';
import EditorScreen from '@/components/screens/EditorScreen';
import ReportScreen from '@/components/screens/ReportScreen';
import ViewerScreen from '@/components/screens/ViewerScreen';
import ThemeToggle from '@/components/ThemeToggle';
import { autoSlug, defaultEventDetail, NAV, seedEvents, SESSIONS0 } from '@/lib/data';
import type { Patch, PatchEvent, PatchEventFn, PatchFn, StudioState } from '@/lib/types';
import { ghostBtn, MONO, primaryBtn, UI } from '@/lib/ui';

const SEEDED_EVENTS = seedEvents();

const INITIAL: StudioState = {
  screen: 'console',
  section: 'agenda',
  query: '',
  status: '전체',
  sort: '최신',
  bulk: false,
  sel: [],
  events: SEEDED_EVENTS,
  editingId: SEEDED_EVENTS[0]?.id ?? null,
  dragOver: false,
  dragIdx: -1,
  device: 'mobile',
  saved: '방금 저장됨',
  paneW: 0,
};

const BULK_ACTIONS = ['공개예정', '완료', '보관', '복제'];

export default function StudioApp() {
  const [s, setS] = useState<StudioState>(INITIAL);
  const patch: PatchFn = useCallback((p) => {
    setS((prev) => {
      const delta: Patch = typeof p === 'function' ? p(prev) : p;
      return delta ? { ...prev, ...delta } : prev;
    });
  }, []);
  const patchEvent: PatchEventFn = useCallback((p) => {
    setS((prev) => {
      const idx = prev.events.findIndex((e) => e.id === prev.editingId);
      if (idx < 0) return prev;
      const delta: PatchEvent = typeof p === 'function' ? p(prev.events[idx]) : p;
      if (!delta) return prev;
      const events = prev.events.slice();
      events[idx] = { ...events[idx], ...delta };
      return { ...prev, events };
    });
  }, []);

  const ev = s.events.find((e) => e.id === s.editingId) ?? s.events[0];
  const dateCode = ev.date.replace(/-/g, '').slice(2);
  const crumb =
    s.screen === 'console'
      ? 'EVENT CONSOLE'
      : s.screen === 'editor'
        ? 'EVENT EDITOR'
        : s.screen === 'viewer'
          ? 'PARTICIPANT VIEW'
          : 'REPORT';
  const heading =
    s.screen === 'console'
      ? `이벤트 ${s.events.length}건`
      : s.screen === 'editor'
        ? `${dateCode} ${ev.title} · ${ev.venue}`
        : s.screen === 'viewer'
          ? '참가자 뷰 · 반응형 검증'
          : '운영 리포트';

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        minHeight: 640,
        overflow: 'hidden',
        fontFamily: "Pretendard, 'Helvetica Neue', Helvetica, sans-serif",
        color: UI.ink,
        background: UI.bg,
        letterSpacing: '-0.01em',
      }}
    >
      <nav
        style={{
          width: 92,
          flex: '0 0 92px',
          background: UI.surface,
          borderRight: `1px solid ${UI.line}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 0 12px',
          gap: 6,
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <LogoMark size={44} />
        </div>
        {NAV.map((n) => {
          const inEditor = s.screen === 'editor';
          const on =
            n.id === 'theme'
              ? inEditor && s.section === 'theme'
              : n.id === 'editor'
                ? inEditor && s.section !== 'theme'
                : s.screen === n.id;
          return (
            <button
              key={n.id}
              className="hv-bg955"
              onClick={() =>
                patch((st) =>
                  n.id === 'theme'
                    ? { screen: 'editor', section: 'theme' }
                    : n.id === 'editor'
                      ? { screen: 'editor', section: st.section === 'theme' ? 'agenda' : st.section }
                      : { screen: n.id as StudioState['screen'] },
                )
              }
              style={{
                width: 68,
                height: 60,
                borderRadius: 13,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                background: on ? UI.brandSoft : 'transparent',
                color: on ? UI.brand : UI.ink2,
              }}
            >
              <div
                style={
                  n.shape === 'phone'
                    ? {
                        width: 12,
                        height: 18,
                        border: `1.7px solid ${on ? UI.brand : UI.ink2}`,
                        borderRadius: 3.5,
                        boxShadow: `inset 0 -3.5px 0 -1.5px ${on ? UI.brand : UI.ink2}`,
                      }
                    : {
                        fontSize: 17,
                        lineHeight: 1,
                        height: 18,
                        display: 'grid',
                        placeItems: 'center',
                        color: on ? UI.brand : UI.ink2,
                      }
                }
              >
                {n.glyph}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0 }}>{n.label}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <ThemeToggle size={36} />
        <div
          style={{
            width: 36,
            height: 36,
            marginTop: 8,
            borderRadius: 99,
            background: UI.line,
            display: 'grid',
            placeItems: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: UI.muted2,
          }}
        >
          OP
        </div>
      </nav>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            height: 68,
            flex: '0 0 68px',
            background: UI.surface,
            borderBottom: `1px solid ${UI.line}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: '0.14em',
                color: UI.faint,
                textTransform: 'uppercase',
              }}
            >
              {crumb}
            </div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {heading}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {s.screen === 'editor' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: UI.muted }}>
                <div style={{ width: 6, height: 6, borderRadius: 99, background: UI.green }} />
                {s.saved}
              </div>
              <button
                className="hv-bg965"
                onClick={() => {
                  patchEvent({ sessions: SESSIONS0.slice() });
                  patch({ saved: '되돌렸습니다' });
                }}
                style={ghostBtn}
              >
                되돌리기
              </button>
              <button className="hv-brandpress" onClick={() => patch({ screen: 'viewer' })} style={primaryBtn}>
                공개하기
              </button>
            </div>
          ) : null}
          {s.screen === 'console' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                className="hv-bg965"
                onClick={() => patch((st) => ({ bulk: !st.bulk, sel: [] }))}
                style={{
                  ...ghostBtn,
                  border: `1px solid ${s.bulk ? UI.ink : UI.line}`,
                  color: UI.ink2,
                }}
              >
                선택 모드
              </button>
              <button
                className="hv-brandpress"
                onClick={() =>
                  patch((st) => {
                    const id = Date.now();
                    const detail = defaultEventDetail();
                    return {
                      events: [
                        ...st.events,
                        {
                          id,
                          brand: '',
                          status: '초안',
                          dateCode: detail.date.replace(/-/g, '').slice(2),
                          slug: autoSlug(detail.title, detail.venue, detail.date),
                          docs: 0,
                          ...detail,
                        },
                      ],
                      editingId: id,
                      screen: 'editor',
                      section: 'basic',
                    };
                  })
                }
                style={primaryBtn}
              >
                새 이벤트
              </button>
            </div>
          ) : null}
        </header>

        <main style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {s.screen === 'console' ? <ConsoleScreen s={s} patch={patch} /> : null}
          {s.screen === 'editor' ? <EditorScreen s={s} ev={ev} patch={patch} patchEvent={patchEvent} /> : null}
          {s.screen === 'viewer' ? <ViewerScreen ev={ev} /> : null}
          {s.screen === 'report' ? <ReportScreen ev={ev} /> : null}
        </main>
      </div>

      {s.bulk && s.sel.length > 0 ? (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            // 항상 어둡게 — 셸 다크모드와 무관하게 떠 있는 토스트 형태를 유지한다.
            background: 'oklch(0.22 0.008 250)',
            color: '#fff',
            borderRadius: 16,
            padding: '10px 12px 10px 20px',
            boxShadow: '0 18px 40px -12px oklch(0.3 0.02 250 / 0.5)',
            zIndex: 20,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 650, letterSpacing: '-0.01em' }}>{s.sel.length}개 선택</div>
          <div style={{ width: 1, height: 24, background: 'oklch(1 0 0 / 0.16)', margin: '0 6px' }} />
          {BULK_ACTIONS.map((a) => (
            <button
              key={a}
              className="hv-glass"
              onClick={() =>
                patch((st) => ({
                  events:
                    a === '복제'
                      ? st.events
                      : st.events.map((e) => (st.sel.includes(e.id) ? { ...e, status: a } : e)),
                  sel: [],
                  saved: '일괄 반영됨',
                }))
              }
              style={{
                height: 44,
                padding: '0 14px',
                borderRadius: 11,
                border: '1px solid oklch(1 0 0 / 0.18)',
                background: 'transparent',
                color: '#fff',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {a === '복제' ? '템플릿으로 복제' : `${a}으로 변경`}
            </button>
          ))}
          <button
            className="hv-white"
            onClick={() => patch({ sel: [] })}
            style={{
              width: 44,
              height: 44,
              borderRadius: 11,
              border: 'none',
              background: 'transparent',
              color: 'oklch(1 0 0 / 0.6)',
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
