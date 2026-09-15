'use client';

import { useParams } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { autoSlug, seedEvents, uniqueSlug } from '@/lib/data';
import { PRESETS } from '@/lib/theme';
import type { EventItem, Patch, PatchEvent, PatchEventFn, PatchFn, Preset, Session, StudioState } from '@/lib/types';

const SEEDED_EVENTS = seedEvents();

const INITIAL: StudioState = {
  section: 'agenda',
  query: '',
  status: '전체',
  sort: '최신',
  bulk: false,
  sel: [],
  events: SEEDED_EVENTS,
  customPresets: [],
  viewerOpen: false,
  dragOver: false,
  dragIdx: -1,
  device: 'mobile',
  saved: '방금 저장됨',
  paneW: 0,
};

interface StudioContextValue {
  s: StudioState;
  ev: EventItem;
  presets: Preset[];
  patch: PatchFn;
  patchEvent: PatchEventFn;
  resetSessions: () => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<StudioState>(INITIAL);
  // "지금 편집 중인 이벤트"는 URL이 정본이다 — 컨텍스트 state로 따로 들고 effect로 동기화하면
  // 첫 렌더(들)에 URL과 다른 이전 값이 잠깐 보인다(하드 리로드 시 헤더·게이트 오표시, PR #9 리뷰).
  const params = useParams<{ id?: string }>();
  // `Number('abc')`는 NaN인데 `NaN !== NaN`(===도 마찬가지)은 항상 true라, 숫자가 아닌 id를
  // 그대로 두면 아래 렌더 중 비교가 매번 "달라짐"으로 판정돼 setState를 무한 반복한다
  // (팀원 교차 리뷰가 실제 500으로 재현·발견). 존재하는 이벤트 id가 아니면 null로 눌러 담아,
  // 무한 루프뿐 아니라 없는 id가 selectedId에 남아 이후 라우트까지 오염시키는 것도 막는다 —
  // 페이지의 `ev.id !== Number(id)` 검사는 이 null 폴백으로도 그대로 404를 낸다.
  const parsedId = params.id ? Number(params.id) : null;
  const urlEventId = parsedId != null && s.events.some((e) => e.id === parsedId) ? parsedId : null;
  // `/console`·`/report`는 URL에 이벤트 id가 없다 — 그런 라우트에서도 "마지막으로 편집하던
  // 이벤트"를 계속 보여줘야 하므로 별도로 기억해둔다. effect가 아니라 렌더 중 비교로 갱신하는
  // 이유는 URL이 바뀐 바로 그 렌더에서 동기적으로 값을 맞춰야(위 주석과 같은 이유) 하기 때문이다
  // — effect였다면 editor 라우트 진입 첫 프레임에 다시 구값이 보인다(교차 리뷰 발견 회귀).
  const [selectedId, setSelectedId] = useState<number | null>(urlEventId ?? SEEDED_EVENTS[0]?.id ?? null);
  const [syncedUrlEventId, setSyncedUrlEventId] = useState(urlEventId);
  if (urlEventId !== syncedUrlEventId) {
    setSyncedUrlEventId(urlEventId);
    if (urlEventId != null) setSelectedId(urlEventId);
  }
  const effectiveId = urlEventId ?? selectedId;
  // 이벤트별 "되돌리기" 기준선 — 편집을 시작한 시점의 아젠다 스냅샷(공용 데모 시드가 아니다).
  const baselineRef = useRef<Map<number, Session[]>>(new Map());

  useEffect(() => {
    // 이벤트 목록에 더는 없는 기준선은 정리한다 — 방치하면 세션 내내 Map이 계속 쌓인다.
    const validIds = new Set(s.events.map((e) => e.id));
    for (const id of baselineRef.current.keys()) {
      if (!validIds.has(id)) baselineRef.current.delete(id);
    }
    if (effectiveId == null || baselineRef.current.has(effectiveId)) return;
    const found = s.events.find((e) => e.id === effectiveId);
    if (found) baselineRef.current.set(effectiveId, found.sessions);
  }, [effectiveId, s.events]);

  const patch: PatchFn = useCallback((p) => {
    setS((prev) => {
      const delta: Patch = typeof p === 'function' ? p(prev) : p;
      return delta ? { ...prev, ...delta } : prev;
    });
  }, []);

  const patchEvent: PatchEventFn = useCallback(
    (p) => {
      setS((prev) => {
        const idx = prev.events.findIndex((e) => e.id === effectiveId);
        if (idx < 0) return prev;
        const delta: PatchEvent = typeof p === 'function' ? p(prev.events[idx]) : p;
        if (!delta) return prev;
        const events = prev.events.slice();
        const merged = { ...events[idx], ...delta };
        if (delta.title !== undefined || delta.venue !== undefined || delta.date !== undefined) {
          merged.dateCode = merged.date.replace(/-/g, '').slice(2);
          const base = autoSlug(merged.title, merged.venue, merged.date);
          // 다른 이벤트와 slug가 겹치면 새 이벤트 생성 때와 같은 규칙으로 접미사를 붙인다.
          const otherSlugs = prev.events.filter((e) => e.id !== merged.id).map((e) => e.slug);
          merged.slug = uniqueSlug(base, otherSlugs);
        }
        events[idx] = merged;
        return { ...prev, events };
      });
    },
    [effectiveId],
  );

  const resetSessions = useCallback(() => {
    setS((prev) => {
      if (effectiveId == null) return prev;
      const baseline = baselineRef.current.get(effectiveId);
      const idx = prev.events.findIndex((e) => e.id === effectiveId);
      if (!baseline || idx < 0) return prev;
      const events = prev.events.slice();
      events[idx] = { ...events[idx], sessions: baseline.slice() };
      return { ...prev, events };
    });
  }, [effectiveId]);

  const ev = s.events.find((e) => e.id === effectiveId) ?? s.events[0];
  const presets = useMemo(() => [...PRESETS, ...s.customPresets], [s.customPresets]);
  const value = useMemo(
    () => ({ s, ev, presets, patch, patchEvent, resetSessions }),
    [s, ev, presets, patch, patchEvent, resetSessions],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio는 StudioProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}
