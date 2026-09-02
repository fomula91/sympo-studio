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
  sessions: { id: number; time: string; title: string; speaker: string; kind: string }[];
  documents: { id: number; sessionId: number | null; name: string; tag: string | null; status: string; pages: number | null; sizeBytes: number | null }[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: PublicEvent };

const ICON_SET_IDS: IconSetId[] = ['geo', 'solid', 'number'];
const DENSITIES: Density[] = ['컴팩트', '기본', '여유'];
const KV_PATTERNS: KvPattern[] = ['stripe', 'grid', 'flat', 'none'];

export default function PublicEventPage() {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/${slug}`, { cache: 'no-store' });
        if (cancelled) return;
        if (res.status === 404) {
          setState({ status: 'not-found' });
          return;
        }
        if (!res.ok) throw new Error(`요청이 실패했습니다 (${res.status})`);
        const data = (await res.json()) as PublicEvent;
        setState({ status: 'ready', data });
      } catch (e) {
        if (!cancelled) {
          setState({ status: 'error', message: e instanceof Error ? e.message : '불러오지 못했습니다.' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state.status === 'not-found') notFound();

  if (state.status === 'loading') {
    return <CenteredMessage>불러오는 중…</CenteredMessage>;
  }
  if (state.status === 'error') {
    return <CenteredMessage>{state.message}</CenteredMessage>;
  }

  const { data } = state;
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
  const sessions: Session[] = data.sessions.map((s) => ({
    id: s.id,
    time: s.time,
    title: s.title,
    speaker: s.speaker,
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
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: UI.muted, fontSize: 14 }}>
      {children}
    </div>
  );
}
