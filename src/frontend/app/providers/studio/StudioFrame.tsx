'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStudio } from './StudioProvider';
import { StudioShell } from '@fe/widgets/studio-shell';
import { DevicePreview } from '@fe/widgets/participant-site';

import { AccountMenu } from '@fe/features/account-menu';
import { LogoMark } from '@fe/shared/ui/Logo';
import { ghostBtn, primaryBtn, UI } from '@fe/shared/config/ui';
import { requestFailureMessage } from '@fe/shared/api/failure-message';

function StudioNotice({ title, children, accountMenu, error = false }: {
  title: string; children?: React.ReactNode; accountMenu: React.ReactNode; error?: boolean;
}) {
  return (
    <div style={{ minHeight: '100vh', background: UI.bg, color: UI.ink }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px', background: UI.surface, borderBottom: `1px solid ${UI.line}` }}>
        <LogoMark size={36} />
        <span style={{ flex: 1, fontWeight: 700 }}>SYMPO STUDIO</span>
        {accountMenu}
      </header>
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '56px 24px' }}>
        <h1 role={error ? 'alert' : 'status'} style={{ fontSize: 20, margin: '0 0 24px' }}>{title}</h1>
        {children}
      </main>
    </div>
  );
}

function CreateFirstEvent({ createEvent }: { createEvent: () => Promise<number> }) {
  const router = useRouter();
  const busy = useRef(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    if (busy.current) return;
    busy.current = true;
    setCreating(true);
    setError(null);
    try {
      const id = await createEvent();
      router.push(`/events/${id}/edit`);
    } catch (e) {
      busy.current = false;
      setCreating(false);
      setError(requestFailureMessage(e, '행사를 만들지 못했습니다'));
    }
  }
  return (
    <>
      <button type="button" disabled={creating} onClick={() => void create()} style={primaryBtn}>{creating ? '생성 중…' : '새 이벤트'}</button>
      {error ? <p role="alert" style={{ color: UI.toneDangerFg }}>{error}</p> : null}
    </>
  );
}

export function StudioFrame({ children }: { children: React.ReactNode }) {
  const studio = useStudio();
  const pathname = usePathname();
  const accountMenu = <AccountMenu {...studio} />;
  const retry = <button type="button" style={ghostBtn} onClick={() => window.location.reload()}>다시 불러오기</button>;

  // SSR/첫 렌더에서도 인증 결과가 오기 전의 시드를 내 행사로 노출하지 않는다.
  if (studio.authError) {
    return <StudioNotice title={studio.authError} accountMenu={accountMenu} error>{retry}</StudioNotice>;
  }
  if (studio.authStatus === 'checking') {
    return <StudioNotice title="로그인 상태를 확인하고 있습니다…" accountMenu={accountMenu} />;
  }
  if (studio.user) {
    if (pathname.startsWith('/events/')) {
      if (studio.loadStatus === 'loading') {
        return <StudioNotice title="행사를 불러오는 중…" accountMenu={accountMenu} />;
      }
      if (studio.loadStatus === 'error' || studio.loadStatus === 'notfound') {
        return (
          <StudioNotice title="행사를 확인하지 못했습니다" accountMenu={accountMenu} error>
            {children}
            <Link href="/console" style={{ color: UI.brand }}>콘솔로 돌아가기</Link>
          </StudioNotice>
        );
      }
    } else {
      if (studio.eventsListError) {
        return <StudioNotice title={studio.eventsListError} accountMenu={accountMenu} error>{retry}</StudioNotice>;
      }
      if (!studio.eventsListLoaded) {
        return <StudioNotice title="내 행사를 불러오는 중…" accountMenu={accountMenu} />;
      }
    }
  }
  if (studio.s.events.length === 0) {
    return (
      <StudioNotice title="아직 만든 행사가 없습니다" accountMenu={accountMenu}>
        <CreateFirstEvent createEvent={studio.createEvent} />
        {pathname === '/console' ? children : <p><Link href="/console" style={{ color: UI.brand }}>콘솔로 돌아가기</Link></p>}
      </StudioNotice>
    );
  }
  return (
    <StudioShell
      {...studio}
      accountMenu={accountMenu}
      preview={<DevicePreview ev={studio.ev} presets={studio.presets} />}
    >
      {children}
    </StudioShell>
  );
}
