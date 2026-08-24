'use client';

import { STATUS } from '@/lib/data';
import type { PatchFn, SortKey, StudioState } from '@/lib/types';
import { MONO, pillStyle, seg, UI } from '@/lib/ui';

const SORTS: SortKey[] = ['최신', '행사일', '이름'];

export function filterEvents(s: StudioState) {
  const q = s.query.trim().toLowerCase();
  let list = s.events.filter(
    (e) =>
      (s.status === '전체' || e.status === s.status) &&
      (!q || (e.brand + e.venue + e.slug + e.dateCode).toLowerCase().includes(q)),
  );
  if (s.sort === '행사일') list = list.toSorted((a, b) => a.dateCode.localeCompare(b.dateCode));
  if (s.sort === '이름') list = list.toSorted((a, b) => a.brand.localeCompare(b.brand));
  return list;
}

export default function ConsoleScreen({ s, patch }: { s: StudioState; patch: PatchFn }) {
  const list = filterEvents(s);

  return (
    <div style={{ padding: '24px 24px 120px', maxWidth: 1400 }}>
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
            <div
              key={e.id}
              className="hv-border78"
              onClick={() => {
                if (s.bulk) {
                  patch((st) => ({
                    sel: on ? st.sel.filter((x) => x !== e.id) : [...st.sel, e.id],
                  }));
                } else {
                  patch({ screen: 'editor', section: 'agenda', editingId: e.id });
                }
              }}
              style={{
                background: UI.surface,
                borderRadius: 16,
                padding: 18,
                cursor: 'pointer',
                border: `1px solid ${on ? UI.brand : UI.line}`,
                boxShadow: on ? '0 0 0 3px oklch(0.475 0.11 205 / 0.09)' : undefined,
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
                    <div style={pillStyle(e.status)}>{e.status}</div>
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
            </div>
          );
        })}
      </div>

      {list.length === 0 ? (
        <div style={{ padding: '80px 0', textAlign: 'center', color: UI.faint, fontSize: 14 }}>
          조건에 맞는 이벤트가 없습니다.
        </div>
      ) : null}

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
