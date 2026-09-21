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
      <a
        href={`/api/auth/google?next=${encodeURIComponent(pathname)}`}
        title="Google로 시작하기"
        style={{
          width: 36,
          height: 36,
          marginTop: 8,
          borderRadius: 99,
          border: `1px solid ${UI.line}`,
          display: 'grid',
          placeItems: 'center',
          fontSize: 14,
          color: UI.muted2,
          textDecoration: 'none',
        }}
      >
        →
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
