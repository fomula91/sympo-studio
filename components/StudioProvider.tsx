'use client';

import { useParams } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClientError } from '@/lib/api';
import { autoSlug, seedEvents, uniqueSlug } from '@/lib/data';
import { detailPatchToBody, fetchStudioEvent, patchStudioEvent } from '@/lib/studio-api';
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
  // FE-30 — 목업 시드(0~14)에 없는 실제 D1 전용 id를 열람 중일 때의 로딩 상태.
  // 목업 id는 그 자리에 보여줄 게 이미 있어 'loading'을 띄우지 않는다(기존 UX 유지).
  loadStatus: 'idle' | 'loading' | 'notfound';
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<StudioState>(INITIAL);
  // "지금 편집 중인 이벤트"는 URL이 정본이다 — 컨텍스트 state로 따로 들고 effect로 동기화하면
  // 첫 렌더(들)에 URL과 다른 이전 값이 잠깐 보인다(하드 리로드 시 헤더·게이트 오표시, PR #9 리뷰).
  const params = useParams<{ id?: string }>();
  // `Number('abc')`는 NaN인데 `NaN !== NaN`(===도 마찬가지)은 항상 true라, 숫자가 아닌 id를
  // 그대로 두면 아래 렌더 중 비교가 매번 "달라짐"으로 판정돼 setState를 무한 반복한다
  // (팀원 교차 리뷰가 실제 500으로 재현·발견). NaN만 null로 눌러 담아 그 무한 루프를 막는다.
  // FE-30 전에는 여기서 "목업 배열에 있는 id인가"까지 같이 걸렀지만, 그러면 목업 시드
  // (0~14) 밖의 **실제 D1 전용 id**(운영 중인 실제 이벤트는 이미 15개를 넘는다)가 영영
  // urlEventId가 되지 못해 아래 실측 fetch가 아예 안 돌았다. 존재 여부 판정은 이제
  // 서버 fetch의 성공/404로 넘긴다(loadStatus).
  const parsedId = params.id ? Number(params.id) : null;
  const urlEventId = parsedId != null && !Number.isNaN(parsedId) ? parsedId : null;
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
  const ev = s.events.find((e) => e.id === effectiveId) ?? s.events[0];
  // 이벤트별 "되돌리기" 기준선 — 편집을 시작한 시점의 아젠다 스냅샷(공용 데모 시드가 아니다).
  const baselineRef = useRef<Map<number, Session[]>>(new Map());

  const patch: PatchFn = useCallback((p) => {
    setS((prev) => {
      const delta: Patch = typeof p === 'function' ? p(prev) : p;
      return delta ? { ...prev, ...delta } : prev;
    });
  }, []);

  // FE-30 — 실제 D1에서 읽어온 이벤트 id 집합. patchEvent가 이 안에 있는 이벤트만
  // 서버로도 PATCH를 보낸다(그 밖은 지금처럼 로컬 목업으로 남는다). 세션(아젠다)
  // 쓰기는 별도 계약(PUT .../sessions)이라 이번 범위에 넣지 않았다 — context-notes 참조.
  const [serverIds, setServerIds] = useState<Set<number>>(new Set());
  // 404가 확인된 id만 실제 state로 둔다(비동기 콜백 안에서만 갱신 — 아래 참조).
  // "loading"은 상태로 따로 안 두고 렌더마다 파생시킨다 — 이펙트 본문에서 곧바로
  // setState하면 react-hooks/set-state-in-effect가 걸린다(연쇄 렌더 유발 경고).
  const [notFoundId, setNotFoundId] = useState<number | null>(null);
  // 목업 시드(0~14)뿐 아니라 "새 이벤트"로 막 만든 로컬 전용 id(Date.now(), 서버에
  // 저장된 적 없음)도 여기 해당한다 — 둘 다 이미 로컬에 보여줄 게 있어 서버 확인을
  // 기다릴 필요가 없다. s.events를 렌더 중에 직접 훑는다(ref로 캐싱하면 값이 바뀌어도
  // 리렌더를 안 일으켜 loadStatus가 갱신되지 않는다).
  const isKnownLocally = effectiveId != null && s.events.some((e) => e.id === effectiveId);
  // serverIds에 있다는 건 그 뒤 fetch가 성공했다는 뜻이다 — notFoundId가 예전에 이
  // id로 찍혀 있어도(생성 전에 먼저 열어봤다가 나중에 실제로 생긴 경우) 성공한 조회가
  // 우선해야 한다. 그렇지 않으면 한 번 404였던 id는 나중에 생겨도 이 세션 내내
  // notFound 화면에 영구히 갇힌다.
  const loadStatus: 'idle' | 'loading' | 'notfound' =
    effectiveId != null && !isKnownLocally && !serverIds.has(effectiveId)
      ? effectiveId === notFoundId
        ? 'notfound'
        : 'loading'
      : 'idle';

  // 텍스트 입력은 키 입력마다 patchEvent를 부른다(기존 로컬 전용 동작) — 서버 PATCH까지
  // 매 키 입력마다 보내면 12글자 제목 하나에 요청 12번이 나간다(실측으로 확인). 짧은
  // 무입력 구간(SAVE_DEBOUNCE_MS)이 지난 뒤 누적된 델타 하나로 합쳐 한 번만 보낸다.
  const pendingSaveRef = useRef<{ id: number; delta: PatchEvent } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SAVE_DEBOUNCE_MS = 700;

  const flushServerSave = useCallback(() => {
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (!pending || !pending.delta) return;
    patch({ saved: '변경 저장 중…' });
    patchStudioEvent(pending.id, pending.delta)
      .then(() => patch({ saved: '방금 저장됨' }))
      .catch((e) => {
        console.warn('스튜디오 이벤트 서버 저장 실패:', e);
        patch({ saved: '저장 실패 — 다시 시도해주세요' });
      });
  }, [patch]);

  // 화면을 떠나기 전(라우트 이동·언마운트) 아직 안 보낸 델타가 있으면 지금 보낸다 —
  // 안 그러면 마지막 700ms 안의 편집이 화면 이동과 함께 조용히 유실된다.
  useEffect(() => () => flushServerSave(), [flushServerSave]);

  useEffect(() => {
    if (effectiveId == null || serverIds.has(effectiveId)) return;
    let cancelled = false;
    fetchStudioEvent(effectiveId)
      .then((real) => {
        if (cancelled) return;
        setS((prev) => {
          const idx = prev.events.findIndex((e) => e.id === effectiveId);
          const events = prev.events.slice();
          if (idx >= 0) events[idx] = real;
          else events.push(real);
          return { ...prev, events };
        });
        setServerIds((prev) => new Set(prev).add(effectiveId));
      })
      .catch((e) => {
        if (cancelled) return;
        // 로컬에 이미 있던 이벤트(목업 시드 또는 방금 만든 새 이벤트)는 서버에 없는 게
        // 정상 경로라 조용히 로컬로 남는다. 그 밖의 id가 404면 정말 없는 이벤트다 —
        // 화면에 notFound를 알린다.
        console.warn('스튜디오 이벤트 실측 조회 실패:', e);
        if (!isKnownLocally && e instanceof ApiClientError && e.status === 404) {
          setNotFoundId(effectiveId);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveId, serverIds, isKnownLocally]);

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

  const patchEvent: PatchEventFn = useCallback(
    (p) => {
      const isServerEvent = effectiveId != null && serverIds.has(effectiveId);
      setS((prev) => {
        const idx = prev.events.findIndex((e) => e.id === effectiveId);
        if (idx < 0) return prev;
        // setS의 업데이터 함수는 React가 나중에(배치 처리 중) 실행할 수 있어, 여기서
        // 계산한 delta를 이 함수 밖으로 안전하게 꺼낼 방법이 없다(클로저 변수에
        // 대입해도 그 대입 자체가 언제 실행될지 보장되지 않는다). 그래서 서버 전송용
        // delta는 아래에서 `ev`(같은 렌더의 최신 값)로 **별도로 다시 계산**한다 — 이
        // 파일의 patch 콜백은 전부 순수 함수라 같은 입력에 같은 델타가 나온다. 단,
        // 서버로 보내는 필드(제목 등)는 이 함수(연속 pointermove로 빠르게 여러 번
        // 불리는 아젠다 드래그와 달리)가 폼 입력 한 번에 한 번만 불리므로 안전하다.
        const delta: PatchEvent = typeof p === 'function' ? p(prev.events[idx]) : p;
        if (!delta) return prev;
        const events = prev.events.slice();
        const merged = { ...events[idx], ...delta };
        // 서버가 실제로 붙어 있는 이벤트는 slug를 절대 로컬에서 재계산하지 않는다 —
        // PATCH /api/events/[id]는 "slug는 여기서 바꾸지 않는다"는 계약이라(공개된
        // 뒤 주소가 바뀌면 공유된 링크가 깨진다), 화면이 다른 slug를 보여주면
        // "공개 URL"이 실제로 열리는 주소와 어긋나는 FE-23류 버그가 재발한다.
        if (!isServerEvent && (delta.title !== undefined || delta.venue !== undefined || delta.date !== undefined)) {
          merged.dateCode = merged.date.replace(/-/g, '').slice(2);
          const base = autoSlug(merged.title, merged.venue, merged.date);
          // 다른 이벤트와 slug가 겹치면 새 이벤트 생성 때와 같은 규칙으로 접미사를 붙인다.
          const otherSlugs = prev.events.filter((e) => e.id !== merged.id).map((e) => e.slug);
          merged.slug = uniqueSlug(base, otherSlugs);
        }
        events[idx] = merged;
        return { ...prev, events };
      });
      if (isServerEvent && effectiveId != null) {
        const delta: PatchEvent = typeof p === 'function' ? p(ev) : p;
        // 아젠다(sessions)만 바뀐 델타는 detailPatchToBody가 null을 돌려준다 — 그런
        // 델타로는 저장을 예약하지 않는다(어차피 서버로 안 나간다).
        if (delta && detailPatchToBody(delta)) {
          const prevPending = pendingSaveRef.current;
          const mergedDelta: PatchEvent =
            prevPending && prevPending.id === effectiveId && prevPending.delta
              ? { ...prevPending.delta, ...delta }
              : delta;
          pendingSaveRef.current = { id: effectiveId, delta: mergedDelta };
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(flushServerSave, SAVE_DEBOUNCE_MS);
        }
      }
    },
    [effectiveId, serverIds, ev, flushServerSave],
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

  const presets = useMemo(() => [...PRESETS, ...s.customPresets], [s.customPresets]);
  const value = useMemo(
    () => ({ s, ev, presets, patch, patchEvent, resetSessions, loadStatus }),
    [s, ev, presets, patch, patchEvent, resetSessions, loadStatus],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio는 StudioProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}
