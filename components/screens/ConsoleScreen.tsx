'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { STATUS } from '@/lib/data';
import type { AuthUser, PatchFn, SortKey, StudioState } from '@/lib/types';
import { eventPhase } from '@/lib/status';
import { MONO, phasePillStyle, seg, UI } from '@/lib/ui';

const SORTS: SortKey[] = ['최신', '행사일', '이름'];
// 로그인 라우트(/api/auth/google·/api/auth/callback/google)가 실패를 리다이렉트로
// 알려줄 때 쓰는 사유 코드 → 화면 문구. URL엔 사유 코드만 싣고 문구는 여기서 정한다.
const AUTH_ERROR_MESSAGE: Record<string, string> = {
  cancelled: '로그인을 취소했습니다.',
  failed: '로그인에 실패했습니다. 다시 시도해 주세요.',
  config_error: 'Google 로그인이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.',
};
// 발행 상태 4종의 톤(BE-23) — 행사 시점('당일'·'종료')은 별도 축이라 배지를 나눠 그린다(phasePillStyle).
// 초안은 이전 pillStyle과 정확히 같은 값(UI.muted)이고, 보관은 근접한 값(UI.faint, L 0.62 —
// 이전 리터럴은 0.66)으로 통일했다 — 육안 차이 없음(/code-review 2026-09-21이 지적).
const STATUS_TONE: Record<string, BadgeTone> = { 공개: 'success', 검수대기: 'warning', 초안: 'muted', 보관: 'faint' };

export function filterEvents(s: StudioState) {
  const q = s.query.trim().toLowerCase();
  let list = s.events.filter(
    (e) =>
      (s.status === '전체' || e.status === s.status) &&
      (!q || (e.title + e.brand + e.venue + e.slug + e.dateCode).toLowerCase().includes(q)),
  );
  if (s.sort === '행사일') list = list.toSorted((a, b) => a.dateCode.localeCompare(b.dateCode));
  if (s.sort === '이름') list = list.toSorted((a, b) => a.title.localeCompare(b.title));
  return list;
}

export default function ConsoleScreen({
  s,
  patch,
  user,
  authStatus,
}: {
  s: StudioState;
  patch: PatchFn;
  user: AuthUser | null;
  authStatus: 'checking' | 'ready';
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authError = searchParams.get('auth');
  // 문구를 보여준 뒤 URL에서 지운다 — 안 그러면 새로고침마다 같은 메시지가 다시 뜬다.
  useEffect(() => {
    if (authError) router.replace('/console');
  }, [authError, router]);
  const list = filterEvents(s);

  return (
    <div style={{ padding: '24px 24px 120px', maxWidth: 1400 }}>
      {authError ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 14,
            padding: '10px 16px',
            borderRadius: 12,
            background: UI.toneDangerBg,
            fontSize: 12.5,
            color: UI.toneDangerFg,
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: 99, background: UI.toneDangerFg, flex: '0 0 6px' }} />
          {AUTH_ERROR_MESSAGE[authError] ?? '로그인 중 문제가 발생했습니다.'}
        </div>
      ) : null}
      {authStatus === 'ready' && !user ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 14,
            padding: '10px 16px',
            borderRadius: 12,
            background: UI.soft,
            border: `1px solid ${UI.line}`,
            fontSize: 12.5,
            color: UI.muted2,
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: 99, background: UI.faint, flex: '0 0 6px' }} />
          체험 중 · 이 브라우저에만 저장됩니다
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <div
            style={{
              position: 'absolute',
              left: 18,
              top: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              color: UI.faint,
              fontSize: 15,
            }}
          >
            ⌕
          </div>
          <input
            className="inp"
            value={s.query}
            onChange={(e) => patch({ query: e.target.value })}
            placeholder="행사명 · 브랜드 · 장소 · 슬러그 검색"
            style={{
              width: '100%',
              height: 56,
              borderRadius: 14,
              border: `1px solid ${UI.line}`,
              background: UI.surface,
              padding: '0 18px 0 44px',
              fontSize: 15,
              color: UI.ink,
              outline: 'none',
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            background: UI.surface,
            border: `1px solid ${UI.line}`,
            borderRadius: 14,
            padding: 5,
            gap: 4,
          }}
        >
          {SORTS.map((x) => (
            <button key={x} onClick={() => patch({ sort: x })} style={seg(s.sort === x, true)}>
              {x}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {['전체', ...STATUS].map((x) => {
          const on = s.status === x;
          const count = x === '전체' ? s.events.length : s.events.filter((e) => e.status === x).length;
          return (
            <button
              key={x}
              onClick={() => patch({ status: x })}
              style={{
                height: 44,
                padding: '0 16px',
                borderRadius: 11,
                cursor: 'pointer',
                fontSize: 12.5,
                fontWeight: 650,
                letterSpacing: '-0.01em',
                border: `1px solid ${on ? UI.brand : UI.line}`,
                background: on ? UI.brand : UI.surface,
                color: on ? UI.surface : UI.muted2,
              }}
            >
              {x}
              <span style={{ opacity: 0.5, marginLeft: 7, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {list.map((e) => {
          const on = s.sel.includes(e.id);
          return (
            <button
              key={e.id}
              type="button"
              className="hv-border78"
              aria-pressed={s.bulk ? on : undefined}
              onClick={() => {
                if (s.bulk) {
                  patch((st) => ({
                    sel: on ? st.sel.filter((x) => x !== e.id) : [...st.sel, e.id],
                  }));
                } else {
                  patch({ section: 'agenda' });
                  router.push(`/events/${e.id}/edit`);
                }
              }}
              style={{
                display: 'block',
                width: '100%',
                background: UI.surface,
                borderRadius: 16,
                padding: 18,
                cursor: 'pointer',
                border: `1px solid ${on ? UI.brand : UI.line}`,
                boxShadow: on ? '0 0 0 3px oklch(0.475 0.11 205 / 0.09)' : undefined,
                font: 'inherit',
                color: 'inherit',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {s.bulk ? (
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      flex: '0 0 24px',
                      borderRadius: 7,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 13,
                      color: UI.surface,
                      background: on ? UI.brand : 'transparent',
                      border: `1.5px solid ${on ? UI.brand : UI.line}`,
                    }}
                  >
                    {on ? '✓' : ''}
                  </div>
                ) : null}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Badge tone={STATUS_TONE[e.status] ?? 'muted'}>{e.status}</Badge>
                    {(() => {
                      // 시점은 저장값이 아니라 event_date에서 파생된다(BE-23).
                      const phase = eventPhase(e.date);
                      return phase ? <div style={phasePillStyle()}>{phase}</div> : null;
                    })()}
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        color: UI.faint,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {e.dateCode}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      letterSpacing: '-0.02em',
                      lineHeight: 1.35,
                      marginBottom: 6,
                      textWrap: 'pretty',
                    }}
                  >
                    {e.title}
                  </div>
                  <div style={{ fontSize: 13, color: UI.muted, lineHeight: 1.5 }}>{e.venue}</div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      color: on ? UI.brand : UI.faint,
                      marginTop: 10,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    /{e.slug}
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: `1px solid ${UI.lineFaint}`,
                }}
              >
                <div style={{ fontSize: 12, color: UI.muted }}>
                  세션 {e.sessions.length} · 자료 {e.docs}
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: 12, fontWeight: 600, color: on ? UI.brand : UI.muted2 }}>
                  {s.bulk ? (on ? '선택됨' : '탭하여 선택') : '편집 →'}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {list.length === 0 ? <EmptyState>조건에 맞는 이벤트가 없습니다.</EmptyState> : null}

      <div
        style={{
          marginTop: 24,
          fontFamily: MONO,
          fontSize: 11,
          color: UI.faint,
          letterSpacing: '0.04em',
        }}
      >
        {list.length} / {s.events.length} EVENTS · 가상 스크롤
      </div>
    </div>
  );
}
