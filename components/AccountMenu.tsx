'use client';

// 헤더 하단의 로그인/계정 위젯 — 게스트는 로그인 버튼, 로그인 사용자는 아바타+드롭다운(FE-15).
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useStudio } from '@/components/StudioProvider';
import { MONO, UI } from '@/lib/ui';

export default function AccountMenu() {
  const { user, authStatus, logout } = useStudio();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

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
        onClick={() => setOpen((v) => !v)}
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
          <div style={{ padding: '0 10px 8px', fontSize: 11, color: UI.faint, fontFamily: MONO }}>{user.email}</div>
          <button
            type="button"
            className="hv-x"
            onClick={() => {
              setOpen(false);
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
        </div>
      ) : null}
    </div>
  );
}
