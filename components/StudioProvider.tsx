'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { seedEvents } from '@/lib/data';
import { PRESETS } from '@/lib/theme';
import type { EventItem, Patch, PatchEvent, PatchEventFn, PatchFn, Preset, StudioState } from '@/lib/types';

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
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<StudioState>(INITIAL);

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
      events[idx] = { ...events[idx], ...delta };
      return { ...prev, events };
    });
  }, []);

  const ev = s.events.find((e) => e.id === s.editingId) ?? s.events[0];
  const presets = useMemo(() => [...PRESETS, ...s.customPresets], [s.customPresets]);
  const value = useMemo(() => ({ s, ev, presets, patch, patchEvent }), [s, ev, presets, patch, patchEvent]);

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio는 StudioProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}
