'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AccountMenu from '@/components/AccountMenu';
import { LogoMark } from '@/components/Logo';
import ViewerScreen from '@/components/screens/ViewerScreen';
import { useStudio } from '@/components/StudioProvider';
import ThemeToggle from '@/components/ThemeToggle';
import { NAV } from '@/lib/data';
import { contrastAllPass } from '@/lib/theme';
import { ghostBtn, MONO, primaryBtn, UI } from '@/lib/ui';

// 발행 상태만 일괄로 바꾼다 — '완료'·'공개예정'은 시점이라 사람이 지정할 값이 아니다(BE-23).
const BULK_ACTIONS = ['공개', '초안', '보관', '복제'];

// 참가자 화면 주소는 이 도메인 아래에 slug로 열린다(콘솔·에디터의 "생성될 URL" 표시와 동일).
const PUBLIC_HOST = 'sympo.superjacob.com';

type ScreenKind = 'console' | 'editor' | 'viewer' | 'report';

export default function StudioShell({ children }: { children: React.ReactNode }) {
  const { s, ev, presets, patch, resetSessions, createEvent, isServerEvent, setEventStatus } = useStudio();
  const router = useRouter();
  const pathname = usePathname();
  const [statusPending, setStatusPending] = useState(false);
  const [copied, setCopied] = useState(false);

  // 뷰어를 연 채로 브라우저 뒤로가기를 누르면 URL만 바뀌고 오버레이 상태는 남아있었다 — 경로가 바뀌면 닫는다.
  useEffect(() => {
    patch({ viewerOpen: false });
  }, [pathname, patch]);

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

  // FE-23 — 공개·비공개는 디바운스 없이 즉시 서버에 반영한다. 실패하면 로컬 상태는
  // 그대로 두고 사유를 저장 상태 문구에 남긴다(버튼만 낙관적으로 바뀌는 일이 없게).
  const handlePublish = async () => {
    if (!canPublish || statusPending) return;
    setStatusPending(true);
    patch({ saved: '공개하는 중…' });
    try {
      await setEventStatus('공개');
      patch({ saved: '공개됨' });
    } catch (e) {
      console.warn('이벤트 공개 실패:', e);
      patch({ saved: '공개하지 못했습니다 — 다시 시도해주세요' });
    } finally {
      setStatusPending(false);
    }
  };

  const handleUnpublish = async () => {
    if (statusPending) return;
    setStatusPending(true);
    patch({ saved: '비공개로 전환하는 중…' });
    try {
      await setEventStatus('초안');
      patch({ saved: '비공개로 전환됨' });
    } catch (e) {
      console.warn('이벤트 비공개 전환 실패:', e);
      patch({ saved: '전환하지 못했습니다 — 다시 시도해주세요' });
    } finally {
      setStatusPending(false);
    }
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(`https://${PUBLIC_HOST}/${ev.slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.warn('URL 복사 실패:', e);
    }
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
              {isServerEvent && ev.status === '공개' ? (
                <>
                  <button
                    className="hv-bg965"
                    onClick={handleCopyUrl}
                    title={`https://${PUBLIC_HOST}/${ev.slug}`}
                    style={{ ...ghostBtn, fontFamily: MONO, fontSize: 11.5, maxWidth: 260 }}
                  >
                    {copied ? '복사됨' : `${PUBLIC_HOST}/${ev.slug}`}
                  </button>
                  <button
                    className="hv-bg965"
                    onClick={handleUnpublish}
                    disabled={statusPending}
                    style={{ ...ghostBtn, opacity: statusPending ? 0.5 : 1, cursor: statusPending ? 'not-allowed' : 'pointer' }}
                  >
                    비공개로 전환
                  </button>
                </>
              ) : (
                <button
                  className="hv-brandpress"
                  onClick={isServerEvent ? handlePublish : undefined}
                  disabled={!canPublish || !isServerEvent || statusPending}
                  title={!isServerEvent ? '로그인해야 실제로 공개할 수 있어요' : undefined}
                  style={{
                    ...primaryBtn,
                    opacity: canPublish && isServerEvent && !statusPending ? 1 : 0.4,
                    cursor: canPublish && isServerEvent && !statusPending ? 'pointer' : 'not-allowed',
                  }}
                >
                  공개하기
                </button>
              )}
            </div>
          ) : null}
          {screenKind === 'console' ? (
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
                onClick={() => {
                  void createEvent().then((id) => router.push(`/events/${id}/edit`));
                }}
                style={primaryBtn}
              >
                새 이벤트
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
