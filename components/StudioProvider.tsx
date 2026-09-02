'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { autoSlug, seedEvents } from '@/lib/data';
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
  editingId: SEEDED_EVENTS[0]?.id ?? null,
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
  // 이벤트별 "되돌리기" 기준선 — 편집을 시작한 시점의 아젠다 스냅샷(공용 데모 시드가 아니다).
  const baselineRef = useRef<Map<number, Session[]>>(new Map());

  useEffect(() => {
    // 이벤트 목록에 더는 없는 기준선은 정리한다 — 방치하면 세션 내내 Map이 계속 쌓인다.
    const validIds = new Set(s.events.map((e) => e.id));
    for (const id of baselineRef.current.keys()) {
      if (!validIds.has(id)) baselineRef.current.delete(id);
    }
    if (s.editingId == null || baselineRef.current.has(s.editingId)) return;
    const found = s.events.find((e) => e.id === s.editingId);
    if (found) baselineRef.current.set(s.editingId, found.sessions);
  }, [s.editingId, s.events]);

  const patch: PatchFn = useCallback((p) => {
    setS((prev) => {
      const delta: Patch = typeof p === 'function' ? p(prev) : p;
      return delta ? { ...prev, ...delta } : prev;
    });
  }, []);

  const patchEvent: PatchEventFn = useCallback((p) => {
    setS((prev) => {
      const idx = prev.events.findIndex((e) => e.id === prev.editingId);
      if (idx < 0) return prev;
      const delta: PatchEvent = typeof p === 'function' ? p(prev.events[idx]) : p;
      if (!delta) return prev;
      const events = prev.events.slice();
      const merged = { ...events[idx], ...delta };
      if (delta.title !== undefined || delta.venue !== undefined || delta.date !== undefined) {
        merged.dateCode = merged.date.replace(/-/g, '').slice(2);
        merged.slug = autoSlug(merged.title, merged.venue, merged.date);
      }
      events[idx] = merged;
      return { ...prev, events };
    });
  }, []);

  const resetSessions = useCallback(() => {
    setS((prev) => {
      if (prev.editingId == null) return prev;
      const baseline = baselineRef.current.get(prev.editingId);
      const idx = prev.events.findIndex((e) => e.id === prev.editingId);
      if (!baseline || idx < 0) return prev;
      const events = prev.events.slice();
      events[idx] = { ...events[idx], sessions: baseline.slice() };
      return { ...prev, events };
    });
  }, []);

  const ev = s.events.find((e) => e.id === s.editingId) ?? s.events[0];
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
