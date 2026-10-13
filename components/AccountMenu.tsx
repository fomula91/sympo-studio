'use client';

// 헤더 하단의 로그인/계정 위젯 — 게스트는 로그인 버튼, 로그인 사용자는 아바타+드롭다운(FE-15).
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useStudio } from '@/components/StudioProvider';
import { ApiClientError } from '@/lib/api';
import { MONO, UI } from '@/lib/ui';

export default function AccountMenu() {
  const { user, authStatus, logout, deleteAccount, serverIds, eventsListLoaded } = useStudio();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // FE-48 — 영구 삭제라 한 번 클릭으로 바로 실행하지 않는다. 콘솔 일괄 삭제와 같은
  // 2클릭 패턴(StudioShell의 confirmDeleteArmed 참조) — 첫 클릭은 "삭제되는 것"을
  // 보여주는 확인 상태로만 바꾸고, 그 상태에서 같은 버튼을 다시 눌러야 실제로 지운다.
  // 4초 안에 다시 안 누르면 자동으로 풀린다.
  const [confirmDeleteArmed, setConfirmDeleteArmed] = useState(false);
  const confirmDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // `deleteBusy`(state) 하나만으로는 못 막는 틈이 있다 — 확인 버튼을 빠르게 두 번
  // 누르면 둘 다 state가 아직 커밋되기 전에 handleDeleteAccount를 부를 수 있다
  // (`docsBusyRef`·`importBusyRef`와 같은 이유로 ref를 따로 둔다, `/code-review` 발견 —
  // 두 번째 요청은 계정이 이미 지워진 뒤라 404로 실패해, 실제로는 성공한 삭제를
  // 화면이 실패로 보여준다).
  const deleteBusyRef = useRef(false);

  useEffect(() => {
    return () => {
      if (confirmDeleteTimerRef.current) clearTimeout(confirmDeleteTimerRef.current);
    };
  }, []);

  // 드롭다운을 닫을 때는 항상 이 함수를 거쳐 확인 대기 상태도 함께 풀어 둔다 — 안
  // 그러면 닫혔다 다시 열었을 때 아무 설명 없이 바로 "정말 삭제?" 버튼이 보일 수 있다.
  const closeMenu = () => {
    setOpen(false);
    if (confirmDeleteTimerRef.current) clearTimeout(confirmDeleteTimerRef.current);
    setConfirmDeleteArmed(false);
    setDeleteError(null);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeMenu();
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  async function handleDeleteAccount() {
    if (!confirmDeleteArmed) {
      if (confirmDeleteTimerRef.current) clearTimeout(confirmDeleteTimerRef.current);
      setConfirmDeleteArmed(true);
      setDeleteError(null);
      confirmDeleteTimerRef.current = setTimeout(() => setConfirmDeleteArmed(false), 4000);
      return;
    }
    if (deleteBusyRef.current) return;
    deleteBusyRef.current = true;
    if (confirmDeleteTimerRef.current) clearTimeout(confirmDeleteTimerRef.current);
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      closeMenu();
    } catch (e) {
      console.warn('계정 삭제 실패:', e);
      setDeleteError(e instanceof ApiClientError ? e.message : '탈퇴를 완료하지 못했어요. 다시 시도해주세요.');
    } finally {
      deleteBusyRef.current = false;
      setDeleteBusy(false);
    }
  }

  if (authStatus === 'checking') {
    return <div style={{ width: 36, height: 36, marginTop: 8, borderRadius: 99, background: UI.line }} />;
  }

  if (!user) {
    return (
      // 이전엔 36px 원 안에 문자 `→` 하나뿐이라 title(호버)에만 "로그인"이라는 뜻이
      // 있었다 — 스크린 리더에는 "→"로 읽히고, 터치 기기는 호버 자체가 없다(FE-44).
      // aria-label로 목적을 알리고, 보이는 텍스트 라벨을 원 아래에 항상 띄워
      // 호버 없이도 로그인 수단임을 알 수 있게 한다. 배선(href·next= 인코딩)은
      // 그대로 둔다.
      <a
        href={`/api/auth/google?next=${encodeURIComponent(pathname)}`}
        aria-label="Google 계정으로 로그인"
        title="Google로 로그인"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          marginTop: 8,
          textDecoration: 'none',
          color: UI.muted2,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 36,
            height: 36,
            borderRadius: 99,
            border: `1px solid ${UI.line}`,
            display: 'grid',
            placeItems: 'center',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          G
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '-0.01em' }}>로그인</span>
      </a>
    );
  }

  const initial = (user.name || user.email).trim().charAt(0).toUpperCase() || '?';

  return (
    <div ref={ref} style={{ position: 'relative', marginTop: 8 }}>
      <button
        type="button"
        onClick={() => (open ? closeMenu() : setOpen(true))}
        title={user.name ?? user.email}
        style={{
          width: 36,
          height: 36,
          borderRadius: 99,
          border: 'none',
          cursor: 'pointer',
          background: UI.brandSoft,
          color: UI.brand,
          fontSize: 13,
          fontWeight: 700,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
          padding: 0,
        }}
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 외부(Google) 이미지라 next/image 최적화 대상이 아니다.
          <img src={user.avatarUrl} alt="" width={36} height={36} style={{ objectFit: 'cover' }} />
        ) : (
          initial
        )}
      </button>
      {open ? (
        <div
          style={{
            position: 'absolute',
            left: 44,
            bottom: 0,
            minWidth: 180,
            width: confirmDeleteArmed ? 240 : undefined,
            background: UI.surface,
            border: `1px solid ${UI.line}`,
            borderRadius: 12,
            boxShadow: '0 18px 40px -12px oklch(0.3 0.02 250 / 0.3)',
            padding: 8,
            zIndex: 30,
          }}
        >
          <div style={{ padding: '8px 10px 2px', fontSize: 12.5, fontWeight: 650, color: UI.ink }}>
            {user.name ?? '이름 없음'}
          </div>
          <div style={{ padding: '0 10px 4px', fontSize: 11, color: UI.faint, fontFamily: MONO }}>{user.email}</div>
          {/* FE-39 — 연결된 제공자. 지금은 Google SSO 하나뿐이라(BE-12) 고정 문구로
              충분하다 — 로그인 수단이 늘면 AuthUser에 provider를 실어 읽는다. */}
          <div style={{ padding: '0 10px 8px', fontSize: 11, color: UI.faint }}>Google 계정 연동됨</div>
          <button
            type="button"
            className="hv-x"
            onClick={() => {
              closeMenu();
              void logout();
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '8px 10px',
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              color: UI.ink2,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            로그아웃
          </button>
          <div style={{ height: 1, background: UI.line, margin: '6px 2px' }} />
          {confirmDeleteArmed ? (
            <div style={{ padding: '2px 10px 8px', fontSize: 11, lineHeight: 1.5, color: UI.toneDangerFg }}>
              {/* eventsListLoaded 전에는 serverIds가 아직 비어 있을 수 있어 숫자를 내지
                  않는다 — 로그인 직후 바로 열면 "이벤트 0개"로 범위를 실제보다 작게
                  보여줄 뻔했다(`/code-review` 발견). 목록이 실제로 도착한 뒤에만 센다. */}
              {eventsListLoaded ? `이벤트 ${serverIds.size}개` : '이 계정의 이벤트 전체'}와 아젠다·자료·질문·설문
              응답, 브랜드 프리셋까지 모두 영구히 사라져요. 한 번 지우면 되돌릴 수 없어요.
            </div>
          ) : null}
          {deleteError ? (
            <div style={{ padding: '0 10px 8px', fontSize: 11, color: UI.toneDangerFg }}>{deleteError}</div>
          ) : null}
          <button
            type="button"
            className={confirmDeleteArmed ? undefined : 'hv-x'}
            onClick={() => void handleDeleteAccount()}
            disabled={deleteBusy}
            aria-label={confirmDeleteArmed ? '탈퇴 확인 — 다시 누르면 계정이 영구히 삭제돼요' : '탈퇴하기'}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '8px 10px',
              borderRadius: 8,
              border: confirmDeleteArmed ? `1px solid ${UI.toneDangerFg}` : 'none',
              background: confirmDeleteArmed ? UI.toneDangerBg : 'transparent',
              color: UI.toneDangerFg,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: deleteBusy ? 'not-allowed' : 'pointer',
              opacity: deleteBusy ? 0.6 : 1,
            }}
          >
            {deleteBusy ? '탈퇴 처리 중…' : confirmDeleteArmed ? '정말 탈퇴할까요?' : '탈퇴하기'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
