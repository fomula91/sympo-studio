'use client';

// 운영자용 실측 리포트 — slug로 GET /api/public/[slug](이벤트 정보) + GET /api/events/[id]/ops(BE-5 집계)를 받아 그린다.
// 스튜디오(app/(studio)/report)는 로컬 목업 이벤트를 미리보기용 샘플로 그리는 별개 화면이다 —
// 목업 이벤트는 D1과 연결된 적이 없어(FE-19/BE-20) 실측을 낼 수 없다. 이 페이지는 실제 공개
// 이벤트 하나를 slug로 지목해 그 실측만 보여준다. 아직 운영자 인증이 없어 슬러그를 아는 사람은
// 누구나 열 수 있다(BE-12 이후 잠글 사안, [[Next-Tasks]] BE-19 참고).
import { notFound, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { type EventOps, fetchEventOps } from '@/lib/api';
import { MONO, UI } from '@/lib/ui';

interface ReportEvent {
  id: number;
  title: string;
  venue: string | null;
  capacity: number | null;
  sessions: { id: number; time: string | null; title: string }[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; ev: ReportEvent; ops: EventOps };

export default function LiveReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const evRes = await fetch(`/api/public/${slug}`, { cache: 'no-store' });
        if (cancelled) return;
        if (evRes.status === 404) {
          setState({ status: 'not-found' });
          return;
        }
        if (!evRes.ok) throw new Error(`요청이 실패했습니다 (${evRes.status})`);
        const ev = (await evRes.json()) as ReportEvent;
        const ops = await fetchEventOps(ev.id);
        if (cancelled) return;
        setState({ status: 'ready', ev, ops });
      } catch (e) {
        if (cancelled) return;
        setState({ status: 'error', message: e instanceof Error ? e.message : '불러오지 못했습니다.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, retryTick]);

  if (state.status === 'not-found') notFound();

  if (state.status === 'loading') {
    return <Centered>불러오는 중…</Centered>;
  }
  if (state.status === 'error') {
    return (
      <Centered>
        <div>{state.message}</div>
        <button
          type="button"
          onClick={() => {
            setState({ status: 'loading' });
            setRetryTick((n) => n + 1);
          }}
          style={retryBtn}
        >
          다시 시도
        </button>
      </Centered>
    );
  }

  const { ev, ops } = state;
  const pct = (visitors: number) => (ops.capacity ? Math.min(100, Math.round((visitors / ops.capacity) * 100)) : null);
  const bars = ev.sessions.map((s) => {
    const row = ops.sessions.find((o) => o.sessionId === s.id);
    const visitors = row?.visitors ?? 0;
    return { id: s.id, label: `${s.time ?? ''}  ${s.title}`.trim(), visitors, pct: pct(visitors) };
  });

  const stats = [
    { label: '방문자', value: `${ops.visitors}명` },
    { label: '페이지뷰', value: `${ops.pageViews}` },
    { label: '설문 완료', value: `${ops.surveyCompleted}건` },
    {
      label: '참석률',
      value: ops.attendanceRate != null ? `${Math.round(ops.attendanceRate * 100)}%` : '—',
    },
  ];

  return (
    <div style={{ padding: '24px 24px 80px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>{ev.title} · 실측 리포트</div>
        <div style={{ fontSize: 12, color: UI.muted, marginTop: 2 }}>
          {ev.venue ?? ''} · 예상 인원 {ops.capacity != null ? `${ops.capacity}명` : '미설정'}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 14,
          marginBottom: 24,
        }}
      >
        {stats.map((m) => (
          <div key={m.label} style={{ background: UI.surface, border: `1px solid ${UI.line}`, borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ fontSize: 12, color: UI.muted, marginBottom: 12 }}>{m.label}</div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 700,
                letterSpacing: '-0.04em',
                fontVariantNumeric: 'tabular-nums',
                color: UI.ink,
              }}
            >
              {m.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: UI.surface, border: `1px solid ${UI.line}`, borderRadius: 14, padding: 20, maxWidth: 640 }}>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 20 }}>세션별 열람</div>
        {bars.length === 0 ? (
          <div style={{ fontSize: 12.5, color: UI.muted }}>등록된 세션이 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {bars.map((b) => (
              <div key={b.id}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 7 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      letterSpacing: '-0.01em',
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {b.label}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11.5, color: UI.muted, fontVariantNumeric: 'tabular-nums' }}>
                    {b.pct != null ? `${b.pct}%` : `${b.visitors}명`}
                  </div>
                </div>
                <div style={{ height: 8, borderRadius: 99, background: UI.brandSoft, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${b.pct ?? Math.min(100, b.visitors * 20)}%`,
                      borderRadius: 99,
                      background: UI.brand,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const retryBtn: React.CSSProperties = {
  marginTop: 12,
  fontSize: 13,
  color: UI.brand,
  background: 'none',
  border: 'none',
  textDecoration: 'underline',
  cursor: 'pointer',
};

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: UI.muted,
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}
