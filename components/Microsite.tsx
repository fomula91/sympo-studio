'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import QaPanel from '@/components/QaPanel';
import SurveyPanel from '@/components/SurveyPanel';
import { fetchWithTimeout, sendEventLogs } from '@/lib/api';
import { KV_PATTERNS, type Theme } from '@/lib/theme';
import type { Density, DocumentInfo, EventInfo, KvPattern, Session } from '@/lib/types';
import { useOnlineStatus } from '@/lib/useOnlineStatus';

const MONO = 'ui-monospace, monospace';

// PDF.js 번들(무겁다)이 초기 로딩에 안 실리도록 뷰어를 여는 시점에만 가져온다(FE-6).
const PdfViewer = dynamic(() => import('@/components/PdfViewer'), { ssr: false });

interface MicrositeProps {
  theme: Theme;
  sessions: Session[];
  icons: string[];
  event: EventInfo;
  /** 참가자 공개 페이지(`/[slug]`)에서만 넘긴다 — 실제 D1 이벤트에 Q&A GET·POST를 보낼 때 쓰는 id. */
  eventId?: number;
  /** 스튜디오 에디터·뷰어 미리보기에서 true — Q&A 입력·폴링을 렌더하지 않아 목업 편집 중에 실제 행사 데이터를 건드리지 않는다. */
  preview?: boolean;
  /** 참가자 공개 페이지에서만 넘긴다 — 없으면(스튜디오 미리보기) 대표 예시 2건을 보여준다. */
  documents?: DocumentInfo[];
  /** 참가자 공개 페이지에서만 넘긴다 — 자료를 열기 직전 서명 URL을 새로 받아오는 데 쓴다(서명은 10분 TTL). */
  slug?: string;
  kv?: string;
  kvPattern?: KvPattern;
  density?: Density;
  wide?: boolean;
}

// 참가자 공개 페이지가 documents를 안 넘길 때(스튜디오 미리보기)만 쓰는 대표 예시.
// url은 가상 강의자료(FE-6)를 가리켜 미리보기에서도 뷰어를 실제로 열어볼 수 있다.
const DEMO_DOCUMENTS: DocumentInfo[] = [
  { id: -1, name: 'Early Intervention Strategies with ATELOVAN', status: 'ready', pages: 24, url: '/demo/sample-lecture.pdf' },
  { id: -2, name: 'Long-Term Adherence: RWE Review', status: 'ready', pages: 18, url: '/demo/sample-lecture.pdf' },
];

export default function Microsite({
  theme: t,
  sessions,
  icons,
  event: ev,
  eventId,
  preview = false,
  documents,
  slug,
  kv = '',
  kvPattern = 'stripe',
  density = '기본',
  wide = false,
}: MicrositeProps) {
  const online = useOnlineStatus();
  const [qaOpen, setQaOpen] = useState(false);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [openDoc, setOpenDoc] = useState<DocumentInfo | null>(null);
  const [loadingDocId, setLoadingDocId] = useState<number | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const docs = documents ?? DEMO_DOCUMENTS;
  // FE-28 — 같은 방문에서 doc_view를 중복 전송하지 않기 위한 열람 기록. seenSessionsRef와
  // 같은 이유로 ref에 둔다: state로 두면 갱신마다 렌더가 다시 돌아 effect가 재실행될 수 있다.
  const seenDocsRef = useRef<Set<number>>(new Set());

  async function openDocument(doc: DocumentInfo) {
    if (doc.status === 'pending' || !doc.url) return;
    setDocError(null);
    // 참가자 공개 페이지의 서명 URL은 10분 TTL이라(lib/r2.ts) 아젠다를 한참 훑다가 열면
    // 처음 받은 url이 이미 만료됐을 수 있다 — 열기 직전에 새로 받는다.
    if (preview || !slug) {
      setOpenDoc(doc);
      return;
    }
    setLoadingDocId(doc.id);
    try {
      const res = await fetchWithTimeout(`/api/public/${slug}`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { documents: { id: number; url: string | null }[] };
      const fresh = data.documents.find((d) => d.id === doc.id)?.url;
      if (!fresh) throw new Error();
      setOpenDoc({ ...doc, url: fresh });
      // session_view(아래 seenSessionsRef)와 같은 패턴 — 같은 방문에서 같은 자료를 다시 열어도
      // doc_view는 한 번만 센다. FE-28: 재열람마다 세면 /ops의 hits가 실제 순열람자 수를 왜곡한다.
      if (eventId != null && !seenDocsRef.current.has(doc.id)) {
        seenDocsRef.current.add(doc.id);
        sendEventLogs(eventId, [{ kind: 'doc_view', documentId: doc.id }]).then((ok) => {
          if (!ok) seenDocsRef.current.delete(doc.id);
        });
      }
    } catch {
      setDocError('자료를 불러오지 못했습니다. 다시 시도해주세요.');
    } finally {
      setLoadingDocId(null);
    }
  }
  const agendaRef = useRef<HTMLOListElement>(null);
  // 세션 목록이 새 배열로 갱신돼도(예: 오프라인 복구 재조회) 아래 effect가 다시 도는데,
  // seen을 effect 안에 두면 그때마다 초기화돼 이미 본 세션을 다시 화면에 노출된 것으로 오인해
  // session_view를 중복 전송한다 — ref로 렌더 사이에 유지한다.
  const seenSessionsRef = useRef<Set<number>>(new Set());

  // 아젠다 카드가 화면에 노출될 때 session_view를 배치로 보낸다(FE-20) — 스튜디오 미리보기(preview)에서는 보내지 않는다.
  // 값은 이 화면에서만 검증된 선택이다 — FE-6·FE-4가 같은 패턴으로 doc_view·survey_complete를 추가할 때
  // 그대로 맞출지 다르게 갈지 판단하고 넘어갈 것.
  useEffect(() => {
    const SESSION_VIEW_DEBOUNCE_MS = 1500;
    const SESSION_VIEW_THRESHOLD = 0.5;
    if (preview || eventId == null) return;
    const container = agendaRef.current;
    if (!container) return;
    const seen = seenSessionsRef.current;
    let pending: number[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const ids = pending;
      pending = [];
      if (ids.length === 0) return;
      sendEventLogs(eventId, ids.map((sessionId) => ({ kind: 'session_view' as const, sessionId }))).then((ok) => {
        // 실패분은 seen에서 빼서, sessions 재조회로 effect가 다시 돌 때(FE-9 재연결) 다시 관찰되게 한다(FE-21).
        if (!ok) for (const id of ids) seen.delete(id);
      });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = Number((entry.target as HTMLElement).dataset.sessionId);
          if (seen.has(id)) continue;
          seen.add(id);
          pending.push(id);
          observer.unobserve(entry.target);
        }
        if (pending.length > 0 && !timer) timer = setTimeout(flush, SESSION_VIEW_DEBOUNCE_MS);
      },
      { threshold: SESSION_VIEW_THRESHOLD },
    );
    // 이미 seen인 요소는 다시 관찰하지 않는다 — sessions 참조가 바뀌어 effect가 재실행돼도
    // 화면에 그대로 떠 있는 항목을 또 감지해 옵저버에 올리지 않게.
    container
      .querySelectorAll<HTMLElement>('[data-session-id]')
      .forEach((el) => {
        if (!seen.has(Number(el.dataset.sessionId))) observer.observe(el);
      });
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
      // 디바운스 중 effect가 재실행되면(예: sessions 재조회) seen에는 이미 기록됐지만
      // 아직 전송 안 된 pending이 남는다 — 유실 없이 지금 바로 흘려보낸다.
      if (pending.length > 0) flush();
    };
  }, [eventId, preview, sessions]);
  const gap = density === '컴팩트' ? 6 : density === '여유' ? 14 : 9;
  const pad = density === '컴팩트' ? 11 : density === '여유' ? 18 : 14;

  const bg = kv ? `url("${kv}") center/cover` : KV_PATTERNS[kvPattern](t);
  const heroFg = `oklch(0.985 0.006 ${t.h})`;

  const sectionLabel: CSSProperties = {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: '0.16em',
    color: t.muted,
    margin: '0 0 11px',
    textTransform: 'uppercase',
  };

  const numberIcons = icons[0].length > 1;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        background: t.bg,
        color: t.ink,
        fontFamily: "var(--font-pretendard), 'Helvetica Neue', Helvetica, sans-serif",
        letterSpacing: '-0.01em',
      }}
    >
      <div style={{ position: 'relative', height: wide ? 244 : 210, background: bg, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(to bottom, ${
              t.mode === 'dark'
                ? 'oklch(0 0 0 / 0.28), oklch(0 0 0 / 0.7)'
                : 'oklch(0 0 0 / 0.18), oklch(0 0 0 / 0.58)'
            })`,
          }}
        />
        <div
          style={{
            position: 'relative',
            padding: '22px 20px 20px',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: heroFg,
                color: `oklch(0.26 0.02 ${t.h})`,
                display: 'grid',
                placeItems: 'center',
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              S
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: '0.16em',
                color: heroFg,
                opacity: 0.92,
                textTransform: 'uppercase',
              }}
            >
              {ev.brandLabel || 'SYMPO STUDIO'}
            </div>
          </div>
          <div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 11.5,
                letterSpacing: '0.1em',
                color: heroFg,
                opacity: 0.86,
                marginBottom: 7,
              }}
            >
              {(ev.date || '2026-08-15').replace(/-/g, '. ')}
            </div>
            <div
              style={{
                fontSize: wide ? 30 : 25,
                fontWeight: 750,
                letterSpacing: '-0.035em',
                lineHeight: 1.2,
                color: heroFg,
                textWrap: 'pretty',
                marginBottom: 8,
              }}
            >
              {ev.title || 'MERIDIAN 심포지엄'}
            </div>
            <div style={{ fontSize: 12.5, color: heroFg, opacity: 0.88 }}>
              {ev.venue || '아르떼 호텔 서울'} · {ev.host || '좌장 서정우'}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          background: t.surface,
          borderBottom: `1px solid ${t.line}`,
          position: 'sticky',
          top: 0,
          zIndex: 2,
        }}
      >
        {['아젠다', '자료', 'Q&A', '설문'].map((label, i) => (
          <div
            key={label}
            style={{
              height: 60,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              cursor: 'pointer',
              color: i === 0 ? t.brand : t.muted,
              borderBottom: `3px solid ${i === 0 ? t.brand : 'transparent'}`,
            }}
          >
            <div
              style={{
                fontSize: numberIcons ? 12 : 16,
                lineHeight: 1,
                fontFamily: numberIcons ? MONO : 'inherit',
                fontWeight: 700,
              }}
            >
              {icons[i]}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 650, letterSpacing: '-0.01em' }}>{label}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: wide ? '22px 28px 32px' : '18px 16px 28px',
          maxWidth: wide ? 760 : 'none',
          margin: '0 auto',
        }}
      >
        <div style={sectionLabel}>아젠다</div>
        <ol
          ref={agendaRef}
          style={{
            listStyle: 'none',
            margin: '0 0 24px',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap,
          }}
        >
          {sessions.map((s) => (
            <li
              key={s.id}
              data-session-id={s.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                background: t.surface,
                border: `1px solid ${t.line}`,
                borderRadius: 13,
                padding: `${pad}px 13px`,
              }}
            >
              <div
                style={{
                  width: 46,
                  flex: '0 0 46px',
                  fontFamily: MONO,
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  color: t.brand,
                  paddingTop: 1,
                }}
              >
                {s.time}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 650,
                    lineHeight: 1.4,
                    letterSpacing: '-0.02em',
                    color: t.ink,
                    textWrap: 'pretty',
                  }}
                >
                  {s.title}
                </div>
                <div style={{ fontSize: 12, color: t.muted, marginTop: 4, lineHeight: 1.45 }}>{s.speaker}</div>
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: '0.08em',
                  color: t.muted,
                  background: t.soft,
                  padding: '4px 6px',
                  borderRadius: 5,
                  flex: '0 0 auto',
                }}
              >
                {s.kind}
              </div>
            </li>
          ))}
        </ol>

        <div style={sectionLabel}>자료</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {docs.length === 0 ? (
            <div style={{ fontSize: 12.5, color: t.muted }}>등록된 자료가 없습니다.</div>
          ) : (
            docs.map((f) => {
              const pending = f.status === 'pending';
              // status가 pending을 벗어났어도 파일(url)이 없는 자료는 열 수 없다 — pending과
              // 똑같이 비활성으로 그려야 "활성화된 것처럼 보이는데 눌러도 반응이 없는" 상태를 피한다.
              const unavailable = pending || !f.url;
              const loading = loadingDocId === f.id;
              return (
                <div
                  key={f.id}
                  role="button"
                  tabIndex={unavailable ? -1 : 0}
                  aria-disabled={unavailable}
                  onClick={() => openDocument(f)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openDocument(f);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: t.surface,
                    border: `1px solid ${t.line}`,
                    borderRadius: 13,
                    padding: '12px 13px',
                    cursor: unavailable ? 'not-allowed' : 'pointer',
                    opacity: unavailable ? 0.6 : loading ? 0.8 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 40,
                      flex: '0 0 34px',
                      borderRadius: 7,
                      background: t.soft,
                      color: t.brand,
                      display: 'grid',
                      placeItems: 'center',
                      fontFamily: MONO,
                      fontSize: 8,
                      fontWeight: 800,
                    }}
                  >
                    PDF
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 650,
                        letterSpacing: '-0.02em',
                        lineHeight: 1.35,
                        color: t.ink,
                      }}
                    >
                      {f.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: t.muted, marginTop: 3 }}>
                      {unavailable ? '준비 중' : `${f.pages ?? '?'}p · 앱 내 열람`}
                    </div>
                  </div>
                  <div style={{ color: t.muted, fontSize: 14 }}>{loading ? '…' : '→'}</div>
                </div>
              );
            })
          )}
          {docError ? (
            <div style={{ fontSize: 12, color: t.muted }}>{docError}</div>
          ) : null}
        </div>

        {!preview && !online && (ev.engage.qa !== false || ev.engage.survey !== false) ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12.5,
              color: t.muted,
              marginBottom: 10,
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: 99, background: t.muted, flex: '0 0 6px' }} />
            오프라인 상태 — 연결되면 다시 시도하세요
          </div>
        ) : null}
        {ev.engage.qa !== false &&
          (preview ? (
            <div
              aria-disabled
              style={{
                height: 54,
                borderRadius: 14,
                background: 'transparent',
                border: `1px solid ${t.line}`,
                color: t.muted,
                display: 'grid',
                placeItems: 'center',
                fontSize: 13,
                fontWeight: 650,
                letterSpacing: '-0.02em',
                marginBottom: 10,
                cursor: 'not-allowed',
              }}
            >
              질문 남기기 (미리보기 — 참가자 페이지에서만 동작)
            </div>
          ) : qaOpen && eventId != null ? (
            <QaPanel theme={t} online={online} eventId={eventId} />
          ) : (
            <button
              type="button"
              onClick={() => setQaOpen(true)}
              disabled={!online}
              style={{
                width: '100%',
                height: 54,
                borderRadius: 14,
                border: 'none',
                background: t.brand,
                color: t.onBrand,
                fontFamily: 'inherit',
                fontSize: 14.5,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                cursor: online ? 'pointer' : 'not-allowed',
                opacity: online ? 1 : 0.45,
                marginBottom: 10,
              }}
            >
              질문 남기기
            </button>
          ))}
        {ev.engage.survey !== false &&
          (preview ? (
            <div
              aria-disabled
              style={{
                height: 54,
                borderRadius: 14,
                background: 'transparent',
                border: `1px solid ${t.line}`,
                color: t.muted,
                display: 'grid',
                placeItems: 'center',
                fontSize: 13,
                fontWeight: 650,
                letterSpacing: '-0.02em',
                cursor: 'not-allowed',
              }}
            >
              설문 참여 (미리보기 — 참가자 페이지에서만 동작)
            </div>
          ) : surveyOpen && eventId != null ? (
            <SurveyPanel
              theme={t}
              online={online}
              eventId={eventId}
              sessions={sessions}
              eventTitle={ev.title}
              venue={ev.venue}
              date={ev.date}
              certEnabled={ev.engage.cert}
              onComplete={() => sendEventLogs(eventId, [{ kind: 'survey_complete' }])}
            />
          ) : (
            <button
              type="button"
              onClick={() => setSurveyOpen(true)}
              disabled={!online}
              style={{
                width: '100%',
                height: 54,
                borderRadius: 14,
                border: `1px solid ${t.line}`,
                background: 'transparent',
                color: t.ink,
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 650,
                letterSpacing: '-0.02em',
                cursor: online ? 'pointer' : 'not-allowed',
                opacity: online ? 1 : 0.45,
              }}
            >
              설문 참여 · 2분
            </button>
          ))}
      </div>
      {openDoc && openDoc.url ? (
        <PdfViewer theme={t} url={openDoc.url} title={openDoc.name} onClose={() => setOpenDoc(null)} />
      ) : null}
    </div>
  );
}
