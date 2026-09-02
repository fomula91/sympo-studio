'use client';

// 참가자용 공개 마이크로사이트 — GET /api/public/[slug]에서 실제 이벤트를 받아 렌더한다
import { notFound, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Microsite from '@/components/Microsite';
import { derive, ICONSETS, PRESETS } from '@/lib/theme';
import type { Density, DocumentInfo, IconSetId, KvPattern, Mode, Session } from '@/lib/types';
import { UI } from '@/lib/ui';

interface PublicEvent {
  id: number;
  brand: string;
  title: string;
  venue: string | null;
  date: string | null;
  host: string | null;
  capacity: number | null;
  theme: {
    presetId: string | null;
    mode: string;
    iconSet: string;
    density: string;
    keyVisual: string | null;
    kvPattern: string;
  };
  engage: { qa: boolean; survey: boolean; chat: boolean; cert: boolean };
  sessions: { id: number; time: string | null; title: string; speaker: string | null; kind: string }[];
  documents: {
    id: number;
    sessionId: number | null;
    name: string;
    tag: string | null;
    status: string;
    pages: number | null;
    sizeBytes: number | null;
  }[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: PublicEvent; stale: boolean };

const ICON_SET_IDS: IconSetId[] = ['geo', 'solid', 'number'];
const DENSITIES: Density[] = ['컴팩트', '기본', '여유'];
const KV_PATTERNS: KvPattern[] = ['stripe', 'grid', 'flat', 'none'];
const CACHE_PREFIX = 'sympo-public-event-';

function loadCached(slug: string): PublicEvent | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + slug);
    return raw ? (JSON.parse(raw) as PublicEvent) : null;
  } catch {
    return null;
  }
}

function saveCache(slug: string, data: PublicEvent): void {
  try {
    localStorage.setItem(CACHE_PREFIX + slug, JSON.stringify(data));
  } catch {
    // 저장 실패는 조용히 무시 — 캐시는 오프라인 폴백일 뿐 필수 경로가 아니다.
  }
}

export default function PublicEventPage() {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/public/${slug}`, { cache: 'no-store' });
        if (cancelled) return;
        if (res.status === 404) {
          setState({ status: 'not-found' });
          return;
        }
        if (!res.ok) throw new Error(`요청이 실패했습니다 (${res.status})`);
        const data = (await res.json()) as PublicEvent;
        saveCache(slug, data);
        setState({ status: 'ready', data, stale: false });
      } catch (e) {
        if (cancelled) return;
        // 네트워크 실패(오프라인 등)면 마지막으로 성공했던 응답을 캐시에서 보여준다 —
        // 아젠다·자료가 로컬 state가 아니라 fetch로 바뀐 뒤로 이 폴백이 없으면 오프라인 시
        // 화면이 통째로 사라진다(교차 리뷰 C1).
        const cached = loadCached(slug);
        if (cached) {
          setState({ status: 'ready', data: cached, stale: true });
        } else {
          setState({ status: 'error', message: e instanceof Error ? e.message : '불러오지 못했습니다.' });
        }
      }
    };
    load();
    const onOnline = () => load(); // 네트워크가 돌아오면 새로고침 없이 자동으로 다시 받아온다
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, [slug, retryTick]);

  if (state.status === 'not-found') notFound();

  if (state.status === 'loading') {
    return <CenteredMessage>불러오는 중…</CenteredMessage>;
  }
  if (state.status === 'error') {
    return (
      <CenteredMessage>
        <div>{state.message}</div>
        <button
          type="button"
          onClick={() => setRetryTick((n) => n + 1)}
          style={{
            marginTop: 12,
            fontSize: 13,
            color: UI.brand,
            background: 'none',
            border: 'none',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          다시 시도
        </button>
      </CenteredMessage>
    );
  }

  const { data, stale } = state;
  // D1의 brand_presets는 origin='extracted' 커스텀 프리셋도 저장하지만, 이 응답의 presetId는
  // 문자열 참조뿐이라 여기서 resolve할 수 없다 — BE-7이 hue/chroma/label을 함께 내려줘야
  // 정확히 재현된다(BE-17). 지금은 스튜디오가 실제 CRUD API에 연결돼 있지 않아(전부 클라이언트
  // 상태) 이 경로로 실제 프리셋이 저장될 일이 아직 없다 — 빌트인 프리셋 폴백은 안전하다.
  const preset = PRESETS.find((p) => p.id === data.theme.presetId) ?? PRESETS[0];
  const mode: Mode = data.theme.mode === 'dark' ? 'dark' : 'light';
  const iconSet: IconSetId = ICON_SET_IDS.includes(data.theme.iconSet as IconSetId)
    ? (data.theme.iconSet as IconSetId)
    : 'geo';
  const density: Density = DENSITIES.includes(data.theme.density as Density) ? (data.theme.density as Density) : '기본';
  const kvPattern: KvPattern = KV_PATTERNS.includes(data.theme.kvPattern as KvPattern)
    ? (data.theme.kvPattern as KvPattern)
    : 'stripe';
  const theme = derive(preset, mode);
  // BE-14 쓰기 API는 time·speaker를 선택 입력으로 허용한다 — null이면 화면에 그대로 새면
  // "null" 글자가 보이므로 빈 문자열로 눌러 담는다.
  const sessions: Session[] = data.sessions.map((s) => ({
    id: s.id,
    time: s.time ?? '',
    title: s.title,
    speaker: s.speaker ?? '',
    kind: s.kind,
  }));
  const documents: DocumentInfo[] = data.documents.map((d) => ({
    id: d.id,
    name: d.name,
    status: d.status,
    pages: d.pages,
  }));

  return (
    <div style={{ minHeight: '100vh' }}>
      {stale ? (
        <div
          style={{
            padding: '8px 16px',
            fontSize: 12.5,
            textAlign: 'center',
            background: 'oklch(0.955 0.035 78)',
            color: 'oklch(0.44 0.09 68)',
          }}
        >
          오프라인 상태 — 마지막으로 불러온 정보를 보여주고 있습니다. 연결되면 자동으로 갱신됩니다.
        </div>
      ) : null}
      <Microsite
        theme={theme}
        sessions={sessions}
        icons={ICONSETS[iconSet].glyphs}
        eventId={data.id}
        documents={documents}
        event={{
          title: data.title,
          venue: data.venue ?? '',
          date: data.date ?? '',
          host: data.host ?? '',
          cap: data.capacity != null ? String(data.capacity) : undefined,
          engage: data.engage,
          brandLabel: preset.label,
        }}
        kv={data.theme.keyVisual ?? ''}
        kvPattern={kvPattern}
        density={density}
      />
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
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
