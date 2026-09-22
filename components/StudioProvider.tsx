'use client';

import { useParams } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClientError } from '@/lib/api';
import { autoSlug, defaultEventDetail, seedEvents, uniqueSlug } from '@/lib/data';
import {
  createStudioEvent,
  detailPatchToBody,
  fetchCurrentUser,
  fetchStudioEvent,
  fetchStudioEvents,
  logoutStudioUser,
  patchStudioEvent,
  patchStudioEventStatus,
  putStudioEventSessions,
} from '@/lib/studio-api';
import type { EventStatus } from '@/lib/status';
import { PRESETS } from '@/lib/theme';
import type {
  AuthUser,
  EventItem,
  Patch,
  PatchEvent,
  PatchEventFn,
  PatchFn,
  Preset,
  Session,
  StudioState,
} from '@/lib/types';

// 게스트 로컬 워크스페이스 영속(FE-15). 버전을 접두사에 박아 둔다 — 나중에 저장
// 모양이 바뀌면 새 키로 옮기고 예전 값은 그냥 버려진다(마이그레이션 없음, 로컬
// 목업 데이터라 감수할 수 있는 손실이다).
const GUEST_STORAGE_KEY = 'sympo-guest-events-v1';

function readGuestWorkspace(): EventItem[] | null {
  try {
    const raw = window.localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as EventItem[]) : null;
  } catch {
    // 손상된 값·프라이빗 모드에서의 접근 거부 등 — 게스트 워크스페이스는 잃어도
    // 시드로 복구되는 로컬 전용 데이터라 조용히 무시하고 시드로 폴백한다.
    return null;
  }
}

function writeGuestWorkspace(events: EventItem[]) {
  try {
    window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(events));
  } catch {
    // 용량 초과·프라이빗 모드 등 — 화면 동작을 막을 이유는 아니다.
  }
}

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
  // 'error'는 404가 아닌 조회 실패(타임아웃·500 등) — 예전엔 이 경우 계속 'loading'에
  // 머물러 무한 스피너가 됐다(교차 리뷰 발견).
  loadStatus: 'idle' | 'loading' | 'notfound' | 'error';
  // FE-15 — 로그인 사용자(비로그인은 null, 오류 아님). 'checking'은 GET /api/auth/me
  // 응답이 아직 안 왔다는 뜻 — 이 창에는 로그인/게스트 어느 쪽 UI도 단정해 그리지 않는다.
  user: AuthUser | null;
  authStatus: 'checking' | 'ready';
  logout: () => Promise<void>;
  // 로그인 상태면 실제 POST /api/events로 만들고, 게스트면 로컬에만 만든다.
  // 새로 생긴 이벤트의 id를 돌려준다(호출자가 그 id로 라우팅한다).
  createEvent: () => Promise<number>;
  // 지금 보고 있는 이벤트가 실제 D1에 연결돼 있는가 — 로컬 전용(게스트·시드)이면 false.
  // 공개·비공개 전환(FE-23)은 서버 이벤트에서만 의미가 있다.
  isServerEvent: boolean;
  // 발행 상태만 즉시 PATCH한다(디바운스 없음) — 실패하면 throw, 로컬 상태는 안 바뀐다.
  // 서버 이벤트가 아닐 때 부르면 아무 일도 하지 않는다(호출자가 isServerEvent로 미리 가른다).
  setEventStatus: (status: EventStatus) => Promise<void>;
  // 실제 D1에 연결된 것으로 확인된 이벤트 id 전체 — 콘솔의 일괄 작업(FE-24)이 어떤
  // 선택 항목이 서버로 나가야 하는지 가릴 때 쓴다. 로그인 사용자는 목록 조회 성공 시
  // 전부 여기 들어온다(개별 열람 없이도).
  serverIds: ReadonlySet<number>;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<StudioState>(INITIAL);
  // FE-15 — 로그인 사용자. SSR과 첫 클라이언트 렌더는 항상 게스트로 시작한다
  // (localStorage·세션 쿠키는 마운트 이펙트에서만 읽는다 — 서버에는 없는 값이라
  // 렌더 중에 읽으면 하이드레이션 불일치가 난다).
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authStatus, setAuthStatus] = useState<'checking' | 'ready'>('checking');
  // 게스트 워크스페이스를 localStorage에서 읽어온 뒤에야 그 변경을 다시 저장한다 —
  // 안 그러면 마운트 시의 시드값이 실제 저장된 값을 먼저 덮어쓸 수 있다.
  const guestHydratedRef = useRef(false);
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
  // "이 id가 실제 서버 이벤트로 확인됐다"(serverIds, 목록 조회만으로도 채워진다)와
  // "이 id의 전체 상세(세션 포함)를 실제로 불러왔다"는 다른 사실이다 — 목록 응답엔
  // sessions가 없다(단건 조회만 싣는다, GET /api/events/[id]). 아래에서 둘 다 쓴다.
  const detailLoadedRef = useRef<Set<number>>(new Set());

  // FE-15 — 로그인 여부를 한 번 확인하고, 그 결과에 따라 콘솔 목록의 출처를 가른다.
  // 로그인이면 실제 D1 목록(GET /api/events)으로 교체, 게스트면 localStorage에
  // 저장된 워크스페이스가 있으면 그걸로 교체(없으면 시드를 그대로 쓰고 이제부터
  // 저장을 시작한다).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let me: AuthUser | null = null;
      try {
        me = await fetchCurrentUser();
      } catch (e) {
        console.warn('로그인 상태 확인 실패(게스트로 취급):', e);
      }
      if (cancelled) return;
      setUser(me);
      setAuthStatus('ready');

      if (me) {
        try {
          const events = await fetchStudioEvents();
          if (!cancelled) {
            // 목록 응답엔 sessions가 없다 — 이미 상세를 불러온 이벤트가 있다면
            // (상세 조회가 목록보다 먼저 끝난 경우) 그 세션을 목록의 빈 배열로
            // 덮어쓰지 않는다(FE-24 ③, 위 detailLoadedRef 주석 참조).
            setS((prev) => {
              const priorById = new Map(prev.events.map((e) => [e.id, e]));
              const merged = events.map((e) =>
                detailLoadedRef.current.has(e.id) ? { ...e, sessions: priorById.get(e.id)?.sessions ?? e.sessions } : e,
              );
              return { ...prev, events: merged };
            });
            setServerIds(new Set(events.map((e) => e.id)));
          }
        } catch (e) {
          // 목록을 못 받아도 화면이 완전히 막히지는 않는다 — 시드가 그대로 보인다.
          // 재시도 UI는 이번 범위 밖(FE-15 완료 기준은 생성·재조회 왕복까지다).
          console.warn('이벤트 목록 조회 실패:', e);
        }
      } else {
        const stored = readGuestWorkspace();
        if (stored && !cancelled) setS((prev) => ({ ...prev, events: stored }));
        guestHydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
    // 마운트 시 한 번만 — 로그인·로그아웃 이후의 재확인은 logout()·리다이렉트 복귀가
    // 각자 처리한다(아래).
  }, []);

  // 게스트 워크스페이스 변경을 저장한다. 서버 목록을 받아오는 중(비로그인 여부를
  // 아직 모름)에는 건너뛴다 — 안 그러면 시드값이 실제 저장분을 덮어쓸 수 있다.
  useEffect(() => {
    if (user || !guestHydratedRef.current) return;
    writeGuestWorkspace(s.events);
  }, [s.events, user]);

  // 404가 확인된 id만 실제 state로 둔다(비동기 콜백 안에서만 갱신 — 아래 참조).
  // "loading"은 상태로 따로 안 두고 렌더마다 파생시킨다 — 이펙트 본문에서 곧바로
  // setState하면 react-hooks/set-state-in-effect가 걸린다(연쇄 렌더 유발 경고).
  const [notFoundId, setNotFoundId] = useState<number | null>(null);
  // 404가 아닌 조회 실패(타임아웃·500 등)를 확인한 id — notFoundId와 마찬가지로
  // 비동기 콜백 안에서만 갱신한다.
  const [errorId, setErrorId] = useState<number | null>(null);
  // 목업 시드(0~14)뿐 아니라 "새 이벤트"로 막 만든 로컬 전용 id(Date.now(), 서버에
  // 저장된 적 없음)도 여기 해당한다 — 둘 다 이미 로컬에 보여줄 게 있어 서버 확인을
  // 기다릴 필요가 없다. s.events를 렌더 중에 직접 훑는다(ref로 캐싱하면 값이 바뀌어도
  // 리렌더를 안 일으켜 loadStatus가 갱신되지 않는다).
  const isKnownLocally = effectiveId != null && s.events.some((e) => e.id === effectiveId);
  // serverIds에 있다는 건 그 뒤 fetch가 성공했다는 뜻이다 — notFoundId·errorId가 예전에
  // 이 id로 찍혀 있어도(생성 전에 먼저 열어봤다가 나중에 실제로 생긴 경우) 성공한 조회가
  // 우선해야 한다. 그렇지 않으면 한 번 404·에러였던 id는 나중에 성공해도 이 세션
  // 내내 그 화면에 영구히 갇힌다.
  const loadStatus: 'idle' | 'loading' | 'notfound' | 'error' =
    effectiveId != null && !isKnownLocally && !serverIds.has(effectiveId)
      ? effectiveId === notFoundId
        ? 'notfound'
        : effectiveId === errorId
          ? 'error'
          : 'loading'
      : 'idle';

  // 텍스트 입력은 키 입력마다 patchEvent를 부른다(기존 로컬 전용 동작) — 서버 PATCH까지
  // 매 키 입력마다 보내면 12글자 제목 하나에 요청 12번이 나간다(실측으로 확인). 짧은
  // 무입력 구간(SAVE_DEBOUNCE_MS)이 지난 뒤 누적된 델타 하나로 합쳐 한 번만 보낸다.
  // 이벤트 id별로 큐를 분리한다 — 단일 슬롯이면 A를 편집한 직후(700ms 안) B로 넘어가
  // 편집할 때 B의 델타가 A의 대기 중이던 델타를 통째로 덮어써 A의 변경이 조용히
  // 사라진다(교차 리뷰 발견 — Provider가 스튜디오 공용 레이아웃에 있어 이벤트 전환으로는
  // 언마운트되지 않으므로 cleanup도 이걸 못 잡는다).
  const pendingSavesRef = useRef<Map<number, PatchEvent>>(new Map());
  const saveTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const SAVE_DEBOUNCE_MS = 700;

  const flushServerSave = useCallback(
    (id: number) => {
      const delta = pendingSavesRef.current.get(id);
      const timer = saveTimersRef.current.get(id);
      if (timer) clearTimeout(timer);
      saveTimersRef.current.delete(id);
      if (!delta) return;
      patch({ saved: '변경 저장 중…' });
      patchStudioEvent(id, delta)
        .then(() => {
          // 이 델타를 큐에서 뺀다 — 단, 응답을 기다리는 사이 같은 이벤트에 새 편집이
          // 들어와 이미 다른(더 최신) 델타로 교체됐다면 그건 건드리지 않는다(이미
          // 예약된 다음 타이머가 그 최신 값을 마저 보낸다).
          if (pendingSavesRef.current.get(id) === delta) pendingSavesRef.current.delete(id);
          patch({ saved: '방금 저장됨' });
        })
        .catch((e) => {
          console.warn('스튜디오 이벤트 서버 저장 실패:', e);
          patch({ saved: '저장 실패 — 다시 시도해주세요' });
          // 실패한 델타는 큐에서 지우지 않고 남겨둔다(위에서 이미 지우지 않음) —
          // 이전엔 요청 보내기 전에 먼저 비웠어서, 실패한 필드는 재시도 수단 없이
          // 그대로 사라지고 이어서 다른 필드를 수정하면 그 필드만 나가 "방금 저장됨"이
          // 뜨는 동안 실패한 필드는 계속 서버에 반영 안 된 채 묻혔다(교차 리뷰 발견).
          // 이제 같은 이벤트를 한 번 더 편집하면 남은 델타와 합쳐져 함께 재전송된다.
        });
    },
    [patch],
  );

  // 언마운트 시 대기 중인 이벤트 전부 즉시 보낸다 — 안 그러면 마지막 700ms 안의
  // 편집이 화면 이동과 함께 조용히 유실된다. 이벤트별 타이머는 계속 살아 있는 동안
  // 각자 알아서 flush되므로(전환만으로는 안 지워짐), 여기서는 진짜 언마운트만 처리한다.
  useEffect(
    () => () => {
      for (const id of pendingSavesRef.current.keys()) flushServerSave(id);
    },
    [flushServerSave],
  );

  // FE-24 ③ — 아젠다(sessions)는 detailPatchToBody가 다루지 않는 필드라(배열 전체를
  // 보내는 다른 계약, PUT .../sessions) 위 필드 저장 큐와 분리한다. 델타를 merge하지
  // 않고 "최신 배열 전체"만 덮어써 보관한다 — 순서 변경 델타는 항상 배열 전부를 들고
  // 오므로 merge할 것이 없다.
  const pendingSessionsRef = useRef<Map<number, Session[]>>(new Map());
  const sessionSaveTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  // 서버가 실제로 발급한 세션 id만 담는다. 로컬에서 새로 추가한 세션은 `Date.now()`로
  // 임시 id를 받는데(AgendaSection), 그 값을 그대로 PUT에 실으면 "남의 세션 id"로
  // 거절당한다(존재하지 않는 id라 UPDATE 0행이 아니라 400) — 여기 없는 id는 전부
  // null(새 행)로 보내 서버가 실제 id를 새로 발급하게 한다.
  const knownSessionIdsRef = useRef<Map<number, Set<number>>>(new Map());

  const flushSessionSave = useCallback(
    (id: number) => {
      const sessions = pendingSessionsRef.current.get(id);
      const timer = sessionSaveTimersRef.current.get(id);
      if (timer) clearTimeout(timer);
      sessionSaveTimersRef.current.delete(id);
      if (!sessions) return;
      patch({ saved: '변경 저장 중…' });
      const known = knownSessionIdsRef.current.get(id) ?? new Set<number>();
      const body = sessions.map((s) => ({
        id: known.has(s.id) ? s.id : null,
        time: s.time || null,
        title: s.title,
        speaker: s.speaker || null,
        kind: s.kind,
      }));
      putStudioEventSessions(id, body)
        .then((serverSessions) => {
          if (pendingSessionsRef.current.get(id) === sessions) pendingSessionsRef.current.delete(id);
          knownSessionIdsRef.current.set(id, new Set(serverSessions.map((s) => s.id)));
          setS((prev) => {
            const idx = prev.events.findIndex((e) => e.id === id);
            if (idx < 0) return prev;
            const events = prev.events.slice();
            events[idx] = { ...events[idx], sessions: serverSessions };
            return { ...prev, events };
          });
          patch({ saved: '방금 저장됨' });
        })
        .catch((e) => {
          console.warn('아젠다 저장 실패:', e);
          patch({ saved: '아젠다 저장 실패 — 다시 시도해주세요' });
          // 필드 저장과 같은 이유로 큐에서 지우지 않는다 — 다음 아젠다 편집이 최신
          // 배열로 다시 덮어써 재시도된다.
        });
    },
    [patch],
  );

  useEffect(
    () => () => {
      for (const id of pendingSessionsRef.current.keys()) flushSessionSave(id);
    },
    [flushSessionSave],
  );

  // 예전엔 위 두 사실을 `serverIds` 하나로 묶어서 판단했는데, 마운트 시 목록 조회가
  // 상세 조회보다 늦게 끝나면 `serverIds`가 바뀌며 이 effect가 재실행돼 진행 중이던
  // 상세 조회를 취소시키고, 그 상세 조회가 들고 있던 실제 세션 데이터가 조용히
  // 버려졌다(FE-24 ③ 검증 중 발견 — 새로고침하면 방금 저장한 세션이 화면에서
  // 사라지지만 D1엔 멀쩡히 남아 있는 것으로 확인).
  useEffect(() => {
    if (effectiveId == null || detailLoadedRef.current.has(effectiveId)) return;
    let cancelled = false;
    fetchStudioEvent(effectiveId)
      .then((real) => {
        if (cancelled) return;
        detailLoadedRef.current.add(effectiveId);
        setS((prev) => {
          const idx = prev.events.findIndex((e) => e.id === effectiveId);
          const events = prev.events.slice();
          if (idx >= 0) events[idx] = real;
          else events.push(real);
          return { ...prev, events };
        });
        setServerIds((prev) => new Set(prev).add(effectiveId));
        knownSessionIdsRef.current.set(effectiveId, new Set(real.sessions.map((sess) => sess.id)));
      })
      .catch((e) => {
        if (cancelled) return;
        // 로컬에 이미 있던 이벤트(목업 시드 또는 방금 만든 새 이벤트)는 서버에 없는 게
        // 정상 경로라 조용히 로컬로 남는다. 그 밖의 id는 조회가 실패한 이유에 따라
        // 갈린다 — 404면 정말 없는 이벤트, 그 밖(타임아웃·500 등)은 존재 여부를 모르는
        // 것뿐이라 notFound가 아니라 별도 에러 상태로 알린다(전에는 여기가 'loading'에
        // 계속 머물러 무한 스피너가 됐다 — 교차 리뷰 발견).
        console.warn('스튜디오 이벤트 실측 조회 실패:', e);
        if (isKnownLocally) return;
        if (e instanceof ApiClientError && e.status === 404) {
          setNotFoundId(effectiveId);
        } else {
          setErrorId(effectiveId);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveId, isKnownLocally]);

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
        // 로컬 전용 커스텀 프리셋(색 추출, POST /api/presets로 등록된 적 없음)의 id를
        // 그대로 보내면 events.preset_id FK 위반으로 PATCH 전체가 400 나서 같은
        // 델타에 합쳐진 다른 필드까지 함께 실패한다(교차 리뷰 발견). 서버가 실제로
        // 아는 내장 프리셋(PRESETS)일 때만 그 필드를 보낸다.
        let serverDelta = delta;
        if (serverDelta?.presetId !== undefined) {
          const { presetId } = serverDelta;
          if (!PRESETS.some((preset) => preset.id === presetId)) {
            serverDelta = { ...serverDelta };
            delete serverDelta.presetId;
          }
        }
        // 아젠다(sessions)만 바뀐 델타는 detailPatchToBody가 null을 돌려준다 — 그런
        // 델타로는 저장을 예약하지 않는다(어차피 서버로 안 나간다).
        if (serverDelta && detailPatchToBody(serverDelta)) {
          const prevDelta = pendingSavesRef.current.get(effectiveId);
          const mergedDelta: PatchEvent = prevDelta ? { ...prevDelta, ...serverDelta } : serverDelta;
          pendingSavesRef.current.set(effectiveId, mergedDelta);
          const prevTimer = saveTimersRef.current.get(effectiveId);
          if (prevTimer) clearTimeout(prevTimer);
          saveTimersRef.current.set(
            effectiveId,
            setTimeout(() => flushServerSave(effectiveId), SAVE_DEBOUNCE_MS),
          );
        }
        // 아젠다는 별도 계약(PUT .../sessions, 배열 전체 교체)이라 위 필드 큐와
        // 분리한다 — 델타는 항상 최신 배열 전체다(merge할 필요 없이 덮어쓴다).
        if (serverDelta?.sessions !== undefined) {
          pendingSessionsRef.current.set(effectiveId, serverDelta.sessions);
          const prevSessionTimer = sessionSaveTimersRef.current.get(effectiveId);
          if (prevSessionTimer) clearTimeout(prevSessionTimer);
          sessionSaveTimersRef.current.set(
            effectiveId,
            setTimeout(() => flushSessionSave(effectiveId), SAVE_DEBOUNCE_MS),
          );
        }
      }
    },
    [effectiveId, serverIds, ev, flushServerSave, flushSessionSave],
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

  // FE-15 — 로그아웃하면 게스트로 돌아간다. 서버 목록을 지우고 localStorage
  // 워크스페이스를(있으면) 다시 읽어온다 — 로그인 전과 같은 경로다.
  const logout = useCallback(async () => {
    await logoutStudioUser();
    setUser(null);
    setServerIds(new Set());
    const stored = readGuestWorkspace();
    setS((prev) => ({ ...prev, events: stored ?? seedEvents() }));
    guestHydratedRef.current = true;
  }, []);

  // FE-15 — 로그인이면 실제 POST, 게스트면 로컬에만 추가(기존 StudioShell 로직을
  // 여기로 옮겼다 — 로그인 분기가 화면 컴포넌트가 아니라 상태 층에 있어야 한다).
  const createEvent = useCallback(async (): Promise<number> => {
    const detail = defaultEventDetail();
    if (user) {
      // 이 범위엔 브랜드명을 따로 입력하는 필드가 없다 — 제목으로 채운다(FE-37류
      // 갭과는 별개로, 서버가 brand를 필수로 요구해서 생긴 임시 결정).
      const created = await createStudioEvent({
        brand: detail.title,
        title: detail.title,
        venue: detail.venue || undefined,
        date: detail.date || undefined,
        host: detail.host || undefined,
      });
      setS((prev) => ({ ...prev, events: [created, ...prev.events], section: 'basic' }));
      setServerIds((prev) => new Set(prev).add(created.id));
      return created.id;
    }
    const id = Date.now();
    setS((prev) => ({
      ...prev,
      events: [
        {
          id,
          brand: '',
          status: '초안',
          dateCode: detail.date.replace(/-/g, '').slice(2),
          slug: uniqueSlug(
            autoSlug(detail.title, detail.venue, detail.date),
            prev.events.map((e) => e.slug),
          ),
          docs: 0,
          localRef: crypto.randomUUID(),
          ...detail,
        },
        ...prev.events,
      ],
      section: 'basic',
    }));
    return id;
  }, [user]);

  const isServerEvent = effectiveId != null && serverIds.has(effectiveId);

  const setEventStatus = useCallback(
    async (status: EventStatus): Promise<void> => {
      if (effectiveId == null || !serverIds.has(effectiveId)) return;
      await patchStudioEventStatus(effectiveId, status);
      const id = effectiveId;
      setS((prev) => {
        const idx = prev.events.findIndex((e) => e.id === id);
        if (idx < 0) return prev;
        const events = prev.events.slice();
        events[idx] = { ...events[idx], status };
        return { ...prev, events };
      });
    },
    [effectiveId, serverIds],
  );

  const presets = useMemo(() => [...PRESETS, ...s.customPresets], [s.customPresets]);
  const value = useMemo(
    () => ({
      s,
      ev,
      presets,
      patch,
      patchEvent,
      resetSessions,
      loadStatus,
      user,
      authStatus,
      logout,
      createEvent,
      isServerEvent,
      setEventStatus,
      serverIds,
    }),
    [
      s,
      ev,
      presets,
      patch,
      patchEvent,
      resetSessions,
      loadStatus,
      user,
      authStatus,
      logout,
      createEvent,
      isServerEvent,
      setEventStatus,
      serverIds,
    ],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio는 StudioProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}
