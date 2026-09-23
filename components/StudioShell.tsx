'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import AccountMenu from '@/components/AccountMenu';
import { LogoMark } from '@/components/Logo';
import ViewerScreen from '@/components/screens/ViewerScreen';
import { useStudio } from '@/components/StudioProvider';
import ThemeToggle from '@/components/ThemeToggle';
import { ApiClientError } from '@/lib/api';
import { NAV } from '@/lib/data';
import { patchStudioEventStatus } from '@/lib/studio-api';
import { contrastAllPass } from '@/lib/theme';
import { ghostBtn, MONO, primaryBtn, UI } from '@/lib/ui';

// 발행 상태만 일괄로 바꾼다 — '완료'·'공개예정'은 시점이라 사람이 지정할 값이 아니다(BE-23).
const BULK_ACTIONS = ['공개', '초안', '보관', '복제'];

// 참가자 화면 주소는 이 도메인 아래에 slug로 열린다(콘솔·에디터의 "생성될 URL" 표시와 동일).
const PUBLIC_HOST = 'sympo.superjacob.com';

type ScreenKind = 'console' | 'editor' | 'viewer' | 'report';

export default function StudioShell({ children }: { children: React.ReactNode }) {
  const { s, ev, presets, patch, resetSessions, createEvent, isServerEvent, setEventStatus, serverIds } =
    useStudio();
  const router = useRouter();
  const pathname = usePathname();
  // StudioShell은 화면 전환에도 언마운트되지 않는 공용 레이아웃이라, 진행 중인
  // 이벤트 id를 담아 두지 않으면(그냥 boolean이면) 공개 처리 중에 다른 이벤트로
  // 넘어갔을 때 그 이벤트의 버튼까지 엉뚱하게 비활성으로 보인다(`/code-review` 발견).
  const [statusPendingId, setStatusPendingId] = useState<number | null>(null);
  const statusPending = statusPendingId === ev.id;
  const [copied, setCopied] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  // s.saved(위)는 에디터 헤더 전용이라 콘솔의 일괄 변경 결과가 보일 자리가 없었다
  // (팀원 코드리뷰가 PR #63에서 발견) — 콘솔에서도 보이는 별도 토스트로 띄운다.
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  // POST /api/events가 401(세션 만료)로 실패하면, 계정 아이콘은 로그인 상태 그대로
  // 남아 있어 사용자가 같은 버튼을 다시 눌러도 또 실패한다 — 재로그인 링크로 다음
  // 행동을 알려준다(/code-review 지적).
  const [createExpired, setCreateExpired] = useState(false);
  const [creating, setCreating] = useState(false);
  // `creating` state만으로는 못 막는 경우가 있다 — 같은 이벤트 루프 틱 안에서 두 번
  // 클릭되면(스크립트로 발생시킨 더블클릭, CDP 자동화 등) React가 첫 setCreating(true)를
  // 아직 커밋하기 전이라 두 번째 클릭의 클로저도 creating===false를 본다(실측: 15→18건,
  // 30ms 간격은 막혔지만 0ms 연속 클릭은 뚫림). 동기적으로 즉시 갱신되는 ref로 먼저
  // 막는다.
  const creatingRef = useRef(false);

  // 뷰어를 연 채로 브라우저 뒤로가기를 누르면 URL만 바뀌고 오버레이 상태는 남아있었다 — 경로가 바뀌면 닫는다.
  useEffect(() => {
    patch({ viewerOpen: false });
  }, [pathname, patch]);

  // creatingRef는 render 중(위 pathname 비교 블록)이 아니라 effect에서 정리한다 — 그
  // 블록에서 ref를 건드리면 react-hooks/refs("Cannot access refs during render")가 걸린다.
  useEffect(() => {
    creatingRef.current = false;
  }, [pathname]);

  // createError는 StudioShell(레이아웃, 라우트 전환에도 안 사라짐)의 state라 그대로 두면
  // 콘솔을 벗어났다 돌아왔을 때 새로 실패한 적이 없어도 옛 배너가 다시 보인다(/code-review
  // 지적). effect 안 setState(캐스케이딩 렌더, react-hooks/set-state-in-effect)와 render 중
  // ref 접근(react-hooks/refs) 둘 다 이 저장소 lint가 막아서, React가 권장하는 "prop 변화를
  // state로 추적" 패턴을 쓴다.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (createError) setCreateError(null);
    if (createExpired) setCreateExpired(false);
    // 생성 성공 후 router.push 전에 풀면, 실제 화면이 콘솔을 벗어나기 전까지
    // 버튼이 다시 눌려 더블클릭 시 이벤트가 두 개 생긴다(팀원 실측: 15→17건,
    // /code-review 2라운드 이후 재발견) — 경로가 실제로 바뀐 뒤에야 푼다.
    if (creating) setCreating(false);
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

  // FE-23 — 공개·비공개는 디바운스 없이 즉시 서버에 반영한다. 실패하면 로컬 상태는
  // 그대로 두고 사유를 저장 상태 문구에 남긴다(버튼만 낙관적으로 바뀌는 일이 없게).
  const handlePublish = async () => {
    if (!canPublish || statusPending) return;
    setStatusPendingId(ev.id);
    patch({ saved: '공개하는 중…' });
    try {
      await setEventStatus('공개');
      patch({ saved: '공개됨' });
    } catch (e) {
      console.warn('이벤트 공개 실패:', e);
      patch({ saved: '공개하지 못했습니다 — 다시 시도해주세요' });
    } finally {
      setStatusPendingId(null);
    }
  };

  const handleUnpublish = async () => {
    if (statusPending) return;
    setStatusPendingId(ev.id);
    patch({ saved: '비공개로 전환하는 중…' });
    try {
      await setEventStatus('초안');
      patch({ saved: '비공개로 전환됨' });
    } catch (e) {
      console.warn('이벤트 비공개 전환 실패:', e);
      patch({ saved: '전환하지 못했습니다 — 다시 시도해주세요' });
    } finally {
      setStatusPendingId(null);
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

  // FE-24 ① — 콘솔의 일괄 상태 변경을 실제 서버에 반영한다. 선택 항목 중 서버 이벤트만
  // PATCH로 내보내고(게스트·시드는 로컬만 바꾼다 — 애초에 보낼 D1 행이 없다), 실패한
  // 건은 로컬 상태를 낙관적으로 바꾸지 않는다.
  const handleBulkAction = async (a: string) => {
    if (bulkPending) return;
    if (a === '복제') {
      patch({ sel: [] });
      return;
    }
    const targetIds = s.sel;
    setBulkPending(true);
    setBulkResult(null);
    patch({ saved: '일괄 반영 중…' });
    const serverTargets = targetIds.filter((id) => serverIds.has(id));
    const results = await Promise.allSettled(serverTargets.map((id) => patchStudioEventStatus(id, a)));
    const failedIds = new Set<number>();
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        failedIds.add(serverTargets[i]);
        console.warn(`이벤트 ${serverTargets[i]} 상태 변경 실패:`, r.reason);
      }
    });
    const successCount = targetIds.length - failedIds.size;
    patch((st) => ({
      events: st.events.map((e) => (targetIds.includes(e.id) && !failedIds.has(e.id) ? { ...e, status: a } : e)),
      // 처리한 항목 중 성공한 것만 선택에서 뺀다. 실패한 건은 선택을 그대로 둬서
      // 바로 다시 시도할 수 있게 한다 — 요청이 진행되는 동안 사용자가 선택을
      // 바꿨다면(체크박스가 막혀 있지 않다) `sel: []`로 통째로 비우면 그 새 선택도
      // 조용히 사라진다(팀원 코드리뷰가 PR #63에서 발견).
      sel: st.sel.filter((id) => !targetIds.includes(id) || failedIds.has(id)),
      // s.saved는 에디터 헤더에만 보인다 — 일괄 변경은 콘솔에서 일어나는데 그
      // 결과가 콘솔 화면 어디에도 안 보였다(같은 리뷰가 발견). 콘솔에서도 보이는
      // 별도 배너(bulkResult, 아래)로 성공·실패 건수를 알린다.
      saved: failedIds.size > 0 ? `${failedIds.size}건 반영 실패 — 다시 시도해주세요` : '일괄 반영됨',
    }));
    setBulkResult(
      failedIds.size > 0
        ? `${successCount}건 반영됨 · ${failedIds.size}건 실패 — 실패한 항목은 선택된 채로 남아 있어요`
        : `${successCount}건 반영됨`,
    );
    setTimeout(() => setBulkResult(null), 4000);
    setBulkPending(false);
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
              {createError ? (
                <div
                  role="alert"
                  style={{ fontSize: 12, color: UI.toneDangerFg, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {createError}
                  {createExpired ? (
                    <a
                      href={`/api/auth/google?next=${encodeURIComponent(pathname)}`}
                      style={{ color: UI.toneDangerFg, textDecoration: 'underline', fontWeight: 600 }}
                    >
                      다시 로그인
                    </a>
                  ) : null}
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
                  // 생겨 하나는 고아로 남는다(/code-review 지적). ref를 먼저 본다 — state는
                  // React가 커밋할 때까지 지연돼 같은 틱 안의 두 번째 클릭을 못 막는다.
                  if (creatingRef.current) return;
                  creatingRef.current = true;
                  setCreating(true);
                  setCreateError(null);
                  setCreateExpired(false);
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
                    setCreateExpired(e instanceof ApiClientError && e.status === 401);
                    creatingRef.current = false;
                    setCreating(false);
                    return;
                  }
                  // 여기서 creatingRef·setCreating(false)를 풀지 않는다 — router.push는
                  // 화면 전환을 예약할 뿐 즉시 콘솔을 벗어나지 않아서, 여기서 풀면 그 틈에
                  // 더블클릭 두 번째 클릭이 또 통과한다. pathname이 실제로 바뀌는
                  // 시점(위 render 중 state 조정 + pathname effect의 ref 초기화)에 푼다 —
                  // 그러면 에디터로 이동했다 콘솔로 돌아왔을 때도 "생성 중…"에 안 멈춘다.
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

      {bulkResult ? (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            // 선택 토스트가 함께 떠 있으면(일부 실패해 선택이 남은 경우) 겹치지 않게 위로.
            bottom: s.bulk && s.sel.length > 0 ? 88 : 24,
            transform: 'translateX(-50%)',
            background: 'oklch(0.22 0.008 250)',
            color: '#fff',
            borderRadius: 12,
            padding: '9px 16px',
            fontSize: 12.5,
            fontWeight: 600,
            boxShadow: '0 18px 40px -12px oklch(0.3 0.02 250 / 0.5)',
            zIndex: 21,
          }}
        >
          {bulkResult}
        </div>
      ) : null}

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
              onClick={() => void handleBulkAction(a)}
              disabled={bulkPending}
              style={{
                height: 44,
                padding: '0 14px',
                borderRadius: 11,
                border: '1px solid oklch(1 0 0 / 0.18)',
                background: 'transparent',
                color: '#fff',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: bulkPending ? 'not-allowed' : 'pointer',
                opacity: bulkPending ? 0.5 : 1,
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
