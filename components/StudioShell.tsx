'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AccountMenu from '@/components/AccountMenu';
import { LogoMark } from '@/components/Logo';
import ViewerScreen from '@/components/screens/ViewerScreen';
import { useStudio } from '@/components/StudioProvider';
import ThemeToggle from '@/components/ThemeToggle';
import { ApiClientError } from '@/lib/api';
import { NAV } from '@/lib/data';
import { contrastAllPass } from '@/lib/theme';
import { ghostBtn, MONO, primaryBtn, UI } from '@/lib/ui';

// 발행 상태만 일괄로 바꾼다 — '완료'·'공개예정'은 시점이라 사람이 지정할 값이 아니다(BE-23).
const BULK_ACTIONS = ['공개', '초안', '보관', '복제'];

type ScreenKind = 'console' | 'editor' | 'viewer' | 'report';

export default function StudioShell({ children }: { children: React.ReactNode }) {
  const { s, ev, presets, patch, resetSessions, createEvent } = useStudio();
  const router = useRouter();
  const pathname = usePathname();
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // 뷰어를 연 채로 브라우저 뒤로가기를 누르면 URL만 바뀌고 오버레이 상태는 남아있었다 — 경로가 바뀌면 닫는다.
  useEffect(() => {
    patch({ viewerOpen: false });
  }, [pathname, patch]);

  // createError는 StudioShell(레이아웃, 라우트 전환에도 안 사라짐)의 state라 그대로 두면
  // 콘솔을 벗어났다 돌아왔을 때 새로 실패한 적이 없어도 옛 배너가 다시 보인다(/code-review
  // 지적). effect 안 setState(캐스케이딩 렌더, react-hooks/set-state-in-effect)와 render 중
  // ref 접근(react-hooks/refs) 둘 다 이 저장소 lint가 막아서, React가 권장하는 "prop 변화를
  // state로 추적" 패턴을 쓴다.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (createError) setCreateError(null);
  }

  const inEditor = pathname.startsWith('/events/');
  const screenKind: ScreenKind = s.viewerOpen
    ? 'viewer'
    : inEditor
      ? 'editor'
      : pathname === '/report'
        ? 'report'
        : 'console';

  const preset = presets.find((p) => p.id === ev.presetId) || presets[0];
  const canPublish = contrastAllPass(preset, ev.mode);
  const openViewer = () => {
    if (canPublish) patch({ viewerOpen: true });
  };

  const goTo = (target: 'console' | 'editor' | 'theme' | 'report' | 'viewer') => {
    if (target === 'viewer') {
      openViewer();
      return;
    }
    patch((st) => ({
      viewerOpen: false,
      section:
        target === 'theme' ? 'theme' : target === 'editor' ? (st.section === 'theme' ? 'agenda' : st.section) : st.section,
    }));
    router.push(target === 'theme' || target === 'editor' ? `/events/${ev.id}/edit` : `/${target}`);
  };

  const dateCode = ev.date.replace(/-/g, '').slice(2);
  const crumb =
    screenKind === 'console'
      ? 'EVENT CONSOLE'
      : screenKind === 'editor'
        ? 'EVENT EDITOR'
        : screenKind === 'viewer'
          ? 'PARTICIPANT VIEW'
          : 'REPORT';
  const heading =
    screenKind === 'console'
      ? `이벤트 ${s.events.length}건`
      : screenKind === 'editor'
        ? `${dateCode} ${ev.title} · ${ev.venue}`
        : screenKind === 'viewer'
          ? '참가자 뷰 · 반응형 검증'
          : '운영 리포트';

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        minHeight: 640,
        overflow: 'hidden',
        fontFamily: "var(--font-pretendard), 'Helvetica Neue', Helvetica, sans-serif",
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
          const on =
            n.id === 'viewer'
              ? s.viewerOpen
              : s.viewerOpen
                ? false
                : n.id === 'theme'
                  ? inEditor && s.section === 'theme'
                  : n.id === 'editor'
                    ? inEditor && s.section !== 'theme'
                    : pathname === `/${n.id}`;
          const blocked = n.id === 'viewer' && !canPublish;
          return (
            <button
              key={n.id}
              className="hv-bg955"
              onClick={() => goTo(n.id as 'console' | 'editor' | 'theme' | 'report' | 'viewer')}
              title={blocked ? '대비비 미달로 공개할 수 없음' : undefined}
              style={{
                width: 68,
                height: 60,
                borderRadius: 13,
                border: 'none',
                cursor: blocked ? 'not-allowed' : 'pointer',
                opacity: blocked ? 0.4 : 1,
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
        <AccountMenu />
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
          {screenKind === 'editor' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: UI.muted }}>
                <div style={{ width: 6, height: 6, borderRadius: 99, background: UI.green }} />
                {s.saved}
              </div>
              {s.section === 'agenda' ? (
                <button
                  className="hv-bg965"
                  onClick={() => {
                    resetSessions();
                    patch({ saved: '되돌렸습니다' });
                  }}
                  style={ghostBtn}
                >
                  아젠다 되돌리기
                </button>
              ) : null}
              {!canPublish ? (
                <div style={{ fontSize: 12, color: 'oklch(0.5 0.15 28)' }}>대비비 미달로 공개할 수 없음</div>
              ) : null}
              <button
                className="hv-brandpress"
                onClick={openViewer}
                disabled={!canPublish}
                style={{ ...primaryBtn, opacity: canPublish ? 1 : 0.4, cursor: canPublish ? 'pointer' : 'not-allowed' }}
              >
                공개하기
              </button>
            </div>
          ) : null}
          {screenKind === 'console' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {createError ? (
                <div role="alert" style={{ fontSize: 12, color: UI.toneDangerFg }}>
                  {createError}
                </div>
              ) : null}
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
                disabled={creating}
                onClick={async () => {
                  // 가드 없이 연타(또는 더블탭)하면 첫 요청이 아직 안 끝난 사이 두 번째
                  // 클릭이 createEvent()를 또 부른다 — 게스트는 Date.now() id 충돌,
                  // 로그인 상태는 POST /api/events 중복 요청으로 서버에 이벤트가 두 개
                  // 생겨 하나는 고아로 남는다(/code-review 지적).
                  if (creating) return;
                  setCreating(true);
                  setCreateError(null);
                  // createEvent()는 로그인 상태에서 POST /api/events가 실패하면 그대로
                  // throw한다(catch 없이 방치되면 unhandled rejection만 남고 버튼을 눌러도
                  // 화면엔 아무 일도 없었던 것처럼 보인다 — FE-41). router.push는 이 try
                  // 밖에서 불러 — 안에 있으면 생성은 성공했는데 이동만 실패한 경우까지
                  // "생성 실패"로 오탐돼 사용자가 재시도해 중복 생성을 만들 수 있다
                  // (/code-review 지적).
                  let id: number;
                  try {
                    id = await createEvent();
                  } catch (e) {
                    console.error('새 이벤트 생성 실패:', e);
                    setCreateError(
                      e instanceof ApiClientError ? e.message : '새 이벤트를 만들지 못했습니다. 다시 시도해주세요.',
                    );
                    setCreating(false);
                    return;
                  }
                  // 성공해도 원복한다 — StudioShell은 라우트 전환에도 안 사라지는
                  // 레이아웃이라, 여기서 안 풀면 에디터로 이동했다 콘솔로 돌아왔을 때
                  // 버튼이 "생성 중…"에 영구히 멈춰 있다(실측으로 재발견).
                  setCreating(false);
                  router.push(`/events/${id}/edit`);
                }}
                style={{ ...primaryBtn, opacity: creating ? 0.6 : 1, cursor: creating ? 'not-allowed' : 'pointer' }}
              >
                {creating ? '생성 중…' : '새 이벤트'}
              </button>
            </div>
          ) : null}
        </header>

        <main style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {s.viewerOpen ? <ViewerScreen ev={ev} presets={presets} /> : children}
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
