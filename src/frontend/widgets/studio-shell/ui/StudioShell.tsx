'use client';

import { LogoMark } from "@fe/shared/ui/Logo";
import ThemeToggle from "@fe/shared/ui/ThemeToggle";
import { NAV } from "../config/navigation";

import { ghostBtn, MONO, primaryBtn, savedColor, UI } from "@fe/shared/config/ui";
import type { StudioShellProps } from '../model/props';
import { useStudioShell } from '../model/useStudioShell';
// FE-50 — '복제'는 핸들러가 선택만 비우고 아무 동작도 안 해(요청·오류 처리 없음) 운영자가
// 복제된 줄 알고 넘어가는 문제가 있었다. 구현 전까지 버튼 자체를 뺀다.
const BULK_ACTIONS = ['공개', '초안', '보관', '삭제'];
const PUBLIC_HOST = 'sympo.superjacob.com';

export default function StudioShell({ children, preview, accountMenu, s, ev, presets, patch, resetSessions, createEvent, isServerEvent, setEventStatus, serverIds }: StudioShellProps) {
 const { pathname, statusPending, copied, bulkPending, bulkResult, confirmDeleteArmed, armBulkDelete, disarmBulkDelete, createError, createExpired, creating, inEditor, screenKind, canPublish, handlePublish, handleUnpublish, handleCopyUrl, handleBulkAction, handleCreateEvent, goTo, crumb, heading } = useStudioShell({s, ev, presets, patch, setEventStatus, serverIds, createEvent});
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
        {accountMenu}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: savedColor(s.saved) }}>
                <div style={{ width: 6, height: 6, borderRadius: 99, background: savedColor(s.saved) }} />
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
                onClick={() => void handleCreateEvent()}
                style={{ ...primaryBtn, opacity: creating ? 0.6 : 1, cursor: creating ? 'not-allowed' : 'pointer' }}
              >
                {creating ? '생성 중…' : '새 이벤트'}
              </button>
            </div>
          ) : null}
        </header>

        <main style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {s.viewerOpen ? preview : children}
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
          {BULK_ACTIONS.map((a) => {
            const deleteArmed = a === '삭제' && confirmDeleteArmed;
            return (
              <button
                key={a}
                // hv-glass의 :hover 배경이 !important라 danger 배경(아래 style)을 가린다 —
                // 클릭 직후엔 커서가 보통 이 버튼 위에 그대로 있어서, armed 상태의 강조색이
                // 실사용에서 거의 항상 안 보이는 문제였다(브라우저로 직접 확인). armed일
                // 때만 그 클래스를 빼 hover가 danger 배경을 덮지 않게 한다.
                className={deleteArmed ? undefined : 'hv-glass'}
                onClick={() => {
                  // 삭제는 영구 손실이라 한 번 더 확인받는다 — 첫 클릭은 확인 상태로만
                  // 바꾸고, 그 상태에서 같은 버튼을 다시 눌러야 실제로 지운다.
                  if (a === '삭제' && !confirmDeleteArmed) {
                    armBulkDelete(true);
                    return;
                  }
                  // 선택이 그대로인 채(위 effect가 안 풀어준다) '삭제' 아닌 다른 버튼을
                  // 눌러도 여기서 armed를 꺼야 한다 — 안 그러면 A를 선택해 '삭제'로
                  // 확인 대기를 만든 뒤 같은 선택으로 '공개로 변경' 등을 먼저 눌러도
                  // armed가 true로 남아, 그 뒤 다시 '삭제'를 누르면 확인 없이 바로
                  // 지워진다(`/code-review` 발견과 같은 뿌리, 선택 불변 버전).
                  if (confirmDeleteArmed) disarmBulkDelete();
                  void handleBulkAction(a);
                }}
                disabled={bulkPending}
                aria-label={deleteArmed ? `선택한 ${s.sel.length}개 삭제 확인 — 다시 누르면 영구 삭제됩니다` : undefined}
                style={{
                  height: 44,
                  padding: '0 14px',
                  borderRadius: 11,
                  border: deleteArmed ? '1px solid oklch(0.6 0.2 28)' : '1px solid oklch(1 0 0 / 0.18)',
                  background: deleteArmed ? 'oklch(0.5 0.18 28)' : 'transparent',
                  color: '#fff',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: bulkPending ? 'not-allowed' : 'pointer',
                  opacity: bulkPending ? 0.5 : 1,
                }}
              >
                {a === '삭제' ? (deleteArmed ? '정말 삭제?' : '삭제') : `${a}으로 변경`}
              </button>
            );
          })}
          <button
            className="hv-white"
            onClick={() => {
              // 삭제 확인 대기 중이었다면 선택을 비우는 시점에 함께 풀어 둔다 — 안 그러면
              // 선택 모드를 다시 켜고 몇 초 안에 새로 고른 항목이 이전 armed 상태로
              // 바로 삭제될 수 있다.
              disarmBulkDelete();
              patch({ sel: [] });
            }}
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
