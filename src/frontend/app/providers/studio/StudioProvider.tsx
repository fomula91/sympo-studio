'use client';
import { readGuestWorkspace, writeGuestWorkspace } from './guest-storage';
import { mergeDetailLoadedEvents } from './event-merge';

import { SEEDED_EVENTS, INITIAL } from './initial-state';
import { useEventSaveQueue } from './useEventSaveQueue';
import { useSessionSync } from './useSessionSync';
import { useAccountActions } from './useAccountActions';
import { useDocumentUpload } from './useDocumentUpload';

import { useParams } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClientError } from "@fe/shared/api/http";
import { autoSlug } from "@fe/entities/event";
import { defaultEventDetail, uniqueSlug } from "@fe/entities/event";
import { createStudioEvent, detailPatchToBody, fetchStudioEvent, fetchStudioEvents, patchStudioEventStatus } from "@fe/entities/event";
import { createStudioPreset, fetchStudioPresets } from "@fe/entities/theme";
import { fetchCurrentUser } from "@fe/entities/account";

import type { EventStatus } from "@fe/entities/event";
import { PRESETS } from "@fe/entities/theme";
import type { AuthUser } from "@fe/entities/account";
import type { EventItem, PatchEvent, PatchEventFn, Session } from "@fe/entities/event";
import type { Patch, PatchFn, StudioState } from "./types";
import type { Preset } from "@fe/entities/theme";

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
  // FE-48 — 계정과 소유 데이터를 서버에서 영구히 지운 뒤 게스트로 되돌린다(로그아웃과
  // 같은 로컬 정리). 실패(401 등)는 그대로 던진다 — 호출자가 사유를 보여준다.
  deleteAccount: () => Promise<void>;
  // 로그인 상태면 실제 POST /api/events로 만들고, 게스트면 로컬에만 만든다.
  // 새로 생긴 이벤트의 id를 돌려준다(호출자가 그 id로 라우팅한다).
  createEvent: () => Promise<number>;
  // 지금 보고 있는 이벤트가 실제 D1에 연결돼 있는가 — 로컬 전용(게스트·시드)이면
  // false. patchEvent가 실제로 서버에 쓰는지와 같은 판정이라 화면이 "저장 중" 문구를
  // 정직하게 고를 때도 쓰고(FE-36), 공개·비공개 전환(FE-23)과 자료 업로드(FE-25)도
  // 서버 이벤트에서만 의미가 있어 이 값으로 가른다(로컬 전용은 올릴 R2 행이 없다).
  isServerEvent: boolean;
  // 발행 상태만 즉시 PATCH한다(디바운스 없음) — 실패하면 throw, 로컬 상태는 안 바뀐다.
  // 서버 이벤트가 아닐 때 부르면 아무 일도 하지 않는다(호출자가 isServerEvent로 미리 가른다).
  setEventStatus: (status: EventStatus) => Promise<void>;
  // 실제 D1에 연결된 것으로 확인된 이벤트 id 전체 — 콘솔의 일괄 작업(FE-24)이 어떤
  // 선택 항목이 서버로 나가야 하는지 가릴 때 쓴다. 로그인 사용자는 목록 조회 성공 시
  // 전부 여기 들어온다(개별 열람 없이도).
  serverIds: ReadonlySet<number>;
  // FE-48 — serverIds가 실제로 서버 목록 조회를 반영했는가(아직 비어 있을 뿐인 초기값과
  // 구분). 계정 삭제 확인 화면이 "이벤트 N개"를 보여줄지, 로딩 전이라 숫자를 아예
  // 빼야 할지 이걸로 가른다.
  eventsListLoaded: boolean;
  // 자료 한 건을 등록+업로드한다(메타 PUT → 파일 PUT, 두 단계를 한 동작으로 묶는다).
  // 서버 이벤트가 아니면 아무 일도 하지 않는다(호출자가 isServerEvent로 미리 가른다).
  // 업로드 실패 시 방금 만든 메타 행도 되돌려 목록에 빈 'pending' 자료가 남지 않는다.
  addDocument: (file: File) => Promise<void>;
  // 자료 한 건을 지운다(메타 목록에서 빼고 PUT). R2 객체는 서버가 D1 삭제 뒤 함께
  // 지우고, 그게 실패해도 자정 Cron이 회수한다(BE-35) — 클라이언트가 할 일은 없다.
  removeDocument: (docId: number) => Promise<void>;
  // 로그인 사용자만 호출 가능(FE-40) — 실패(401·409 등)는 그대로 던진다.
  createPreset: (input: { id: string; label: string; hue: number; chroma: number }) => Promise<Preset>;
  // 이 presetId가 서버에도 알려져 있는가(내장 PRESETS 또는 POST /api/presets로 이미
  // 등록됨) — patchEvent가 presetId를 서버로 보낼지 가르는 것과 정확히 같은 판정이다.
  // 화면이 "변경 저장 중…" 문구를 고를 때도 같은 판정을 써야 어긋나지 않는다
  // (팀원 리뷰, PR #65) — 한 곳(`isKnownPreset`)에서만 계산해 두 군데가 따로 판정하며
  // 어긋날 여지를 없앴다.
  isKnownPreset: (presetId: string) => boolean;
  // FE-39 — 로그인 직후 가져올 게스트 이벤트가 있으면 담긴다(없으면 null, 배너
  // 안 그림). 가져오기 실패분은 confirmImport가 다시 여기 채워 재시도할 수 있게 한다.
  importPrompt: EventItem[] | null;
  importBusy: boolean;
  importMessage: string | null;
  confirmImport: () => Promise<void>;
  dismissImport: () => void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<StudioState>(INITIAL);
  // FE-15 — 로그인 사용자. SSR과 첫 클라이언트 렌더는 항상 게스트로 시작한다
  // (localStorage·세션 쿠키는 마운트 이펙트에서만 읽는다 — 서버에는 없는 값이라
  // 렌더 중에 읽으면 하이드레이션 불일치가 난다).
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authStatus, setAuthStatus] = useState<'checking' | 'ready'>('checking');
  // FE-48 — 로그인 사용자의 이벤트 목록(GET /api/events) 조회가 실제로 끝났는가.
  // `authStatus === 'ready'`는 로그인 여부만 확인됐다는 뜻이라, 그 직후엔 `serverIds`가
  // 아직 비어 있을 수 있다 — 계정 삭제 확인 화면이 "이벤트 0개"로 범위를 실제보다
  // 작게 보여주지 않도록, 목록이 정말 도착했는지를 별도로 노출한다(`/code-review` 발견).
  const [eventsListLoaded, setEventsListLoaded] = useState(false);
  // 게스트 워크스페이스를 localStorage에서 읽어온 뒤에야 그 변경을 다시 저장한다 —
  // 안 그러면 마운트 시의 시드값이 실제 저장된 값을 먼저 덮어쓸 수 있다.
  const guestHydratedRef = useRef(false);
  // FE-39 — 로그인 직후 게스트 워크스페이스에 가져올 이벤트(localRef 있음)가 있으면
  // 여기 채운다. 가져오기 수락·거절·완료로만 비우거나 교체한다 — null이면 배너를
  // 안 그린다. importMessage는 가져오기 수락 뒤의 결과(성공·실패 건수)를 한 번
  // 보여주고, 다음 가져오기 시도나 배너 해제로 지운다.
  const [importPrompt, setImportPrompt] = useState<EventItem[] | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  // importBusy(state)만으로는 막지 못하는 틈이 있다 — 버튼을 빠르게 두 번 누르면
  // 두 클릭 모두 state가 아직 갱신되기 전에 confirmImport를 부를 수 있다(`docsBusyRef`와
  // 같은 이유로 ref를 따로 둔다, `/code-review` 발견).
  const importBusyRef = useRef(false);
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
  // 지금 편집 중인 이벤트가 실제 D1에 연결돼 있는가 — patchEvent 내부 판정과 같은
  // 식이다(FE-36). 화면(EditorScreen)이 "변경 저장 중…"을 쓸지 "미리보기에만
  // 반영됨"을 쓸지 이걸로 가른다. patchEvent(아래)의 의존성 배열이 이 값을 참조하므로
  // 그보다 앞서 선언해야 한다.
  const isServerEvent = effectiveId != null && serverIds.has(effectiveId);

  // FE-40 — "서버가 아는 커스텀 프리셋 id" 집합을 ref로도 따로 든다(`s.customPresets`
  // state와 내용은 같다). `patchEvent`가 이 값으로 presetId를 걸러내는데, `saveDraft`
  // 같은 async 호출자는 `createPreset`이 끝나기 전에 이미 잡아 둔 `patchEvent` 클로저를
  // 그대로 쓴다 — 그 클로저의 `s.customPresets`는 호출 시점의 스냅샷이라 `createPreset`이
  // 막 등록한 새 id를 못 본다(react-hooks 리렌더가 아직 안 돌았으므로). ref는 객체
  // 정체성이 렌더를 넘나들며 그대로라, 오래된 클로저도 `.current`를 읽으면 항상 최신값을
  // 얻는다(`detailLoadedRef`와 같은 수법, 코드 리뷰 발견).
  const customPresetIdsRef = useRef<Set<string>>(new Set());
  // patchEvent(아래)와 화면(EditorScreen의 저장 문구)이 똑같이 쓰는 판정 — 하나로
  // 합쳐 두 자리가 따로 계산하다 어긋나는 일을 없앴다(팀원 리뷰, PR #65: 새로 등록한
  // 커스텀 프리셋이 실제로는 PATCH되는데 화면은 `isBuiltInPreset`만 보고 "미리보기에만
  // 반영됨"이라고 거짓 표시했다).
  const isKnownPreset = useCallback(
    (presetId: string) => PRESETS.some((preset) => preset.id === presetId) || customPresetIdsRef.current.has(presetId),
    [],
  );
  // 로그아웃 이후 도착하는 마운트 시점 조회 응답(느린 네트워크 등)이 방금 지운
  // 개인 프리셋을 다시 채우지 않도록 막는다(공용 기기 — 코드 리뷰 발견). 마운트
  // 이펙트는 한 번만 도니 로그인 상태가 다시 필요하면 OAuth 리다이렉트로 페이지가
  // 통째로 새로고침된다 — true로 한 번 세팅되면 이 컴포넌트 생애주기 안에서 되돌릴
  // 필요가 없다.
  const loggedOutRef = useRef(false);
  // "이 id가 실제 서버 이벤트로 확인됐다"(serverIds, 목록 조회만으로도 채워진다)와
  // "이 id의 전체 상세(세션·자료 포함)를 실제로 불러왔다"는 다른 사실이다 — 목록
  // 응답엔 sessions·documents가 없다(단건 조회만 싣는다, GET /api/events/[id]). 아래에서 둘 다 쓴다.
  //
  // **두 갈래로 나눠 들고 있는 이유** — ref는 상세 조회 effect의 재실행 가드(아래)에
  // 쓴다. 그 effect가 이 값을 의존성 배열에 넣으면(반응형 state라면) "어떤 이벤트든
  // 상세가 하나 로드될 때마다" 재실행돼, 지금 막 진행 중인 다른 이벤트의 상세 조회를
  // 취소시킨다 — 처음에 고친 경합 버그(위 주석)가 다른 모양으로 되살아난다. 반면
  // `loadStatus`(아래)는 렌더 중에 값을 읽어야 하는데, 렌더 중 ref 읽기는
  // `react-hooks/refs` 규칙이 막는다(`/code-review`가 CI에서 잡아냄) — 그래서 렌더용
  // 값만 별도로 반응형 state(`detailLoadedIds`)에 미러링한다. 둘은 상세 조회가 끝나는
  // 같은 시점에 함께 갱신되므로 항상 같은 값을 가리킨다.
  const detailLoadedRef = useRef<Set<number>>(new Set());
  const [detailLoadedIds, setDetailLoadedIds] = useState<Set<number>>(new Set());

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
        // FE-39 — 로그인 직후 게스트 워크스페이스에 가져올 게 있으면 묻는다.
        // localRef가 있는 항목만(게스트가 실제로 만든 이벤트) — 시드는 없다.
        // localStorage만 읽는 동기 작업이라 아래 네트워크 조회를 기다릴 이유가
        // 없다 — 배너가 먼저 뜬다(코드 리뷰 발견).
        const guestStored = readGuestWorkspace();
        const importable = (guestStored ?? []).filter((e) => e.localRef);
        if (importable.length > 0 && !cancelled) setImportPrompt(importable);

        // 목록·프리셋 둘 다 독립 요청이라 동시에 쏜다(순서대로 await하면 왕복 시간이
        // 그냥 더해진다 — 코드 리뷰 발견). 각자 실패해도 나머지 하나는 그대로 반영되도록
        // try/catch는 분리해 둔다.
        const eventsPromise = fetchStudioEvents();
        const presetsPromise = fetchStudioPresets();
        try {
          const events = await eventsPromise;
          if (!cancelled) {
            // 상세를 이미 불러온 이벤트가 있다면(상세 조회가 목록보다 먼저 끝난 경우) 그
            // 값을 목록의 빈 값으로 덮어쓰지 않는다(위 detailLoadedRef 주석 참조) —
            // mergeDetailLoadedEvents 참조.
            setS((prev) => ({
              ...prev,
              events: mergeDetailLoadedEvents(prev.events, events, detailLoadedRef.current),
            }));
            setServerIds(new Set(events.map((e) => e.id)));
            setEventsListLoaded(true);
          }
        } catch (e) {
          // 목록을 못 받아도 화면이 완전히 막히지는 않는다 — 시드가 그대로 보인다.
          // 재시도 UI는 이번 범위 밖(FE-15 완료 기준은 생성·재조회 왕복까지다).
          // eventsListLoaded는 여기서 true로 올리지 않는다 — serverIds가 실패 전
          // 값(보통 빈 Set) 그대로라, true로 올리면 계정 삭제 확인 화면이 "이벤트
          // 0개"를 실제로 다 센 값처럼 보여준다.
          console.warn('이벤트 목록 조회 실패:', e);
        }
        try {
          // 서버에 저장된 추출 프리셋을 목록에 합친다(FE-40) — 안 하면 "새로고침해도
          // 프리셋이 목록에 남아 있다"는 완료 기준이 성립하지 않는다(내장은 이미
          // `PRESETS` 상수에 있으니 서버 응답에서 'extracted' origin만 가져온다).
          const presets = await presetsPromise;
          if (!cancelled && !loggedOutRef.current) {
            setS((prev) => ({ ...prev, customPresets: presets }));
            presets.forEach((p) => customPresetIdsRef.current.add(p.id));
          }
        } catch (e) {
          console.warn('프리셋 목록 조회 실패:', e);
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
    if (!writeGuestWorkspace(s.events)) {
      // 이펙트 본문에서 곧바로 setState하면 react-hooks/set-state-in-effect가 걸린다
      // (연쇄 렌더 유발 경고) — 마이크로태스크로 한 틱 미룬다.
      queueMicrotask(() => patch({ saved: '저장 용량 초과 — 이 편집은 저장되지 않았습니다. 이미지를 지우거나 줄여주세요' }));
    }
  }, [s.events, user, patch]);

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
  // detailLoadedRef(위)에 있다는 건 단건 상세 조회(세션·자료 포함)가 성공했다는 뜻이다 —
  // notFoundId·errorId가 예전에 이 id로 찍혀 있어도(생성 전에 먼저 열어봤다가 나중에
  // 실제로 생긴 경우) 성공한 조회가 우선해야 한다. 그렇지 않으면 한 번 404·에러였던
  // id는 나중에 성공해도 이 세션 내내 그 화면에 영구히 갇힌다.
  //
  // **`serverIds`가 아니라 `detailLoadedIds`로 가른다** — 로그인 사용자는 마운트 시
  // 목록 조회(GET /api/events, sessions 없음)만으로도 `serverIds`가 채워진다. 예전엔
  // 그걸로 'idle'을 판정해 에디터가 곧장 렌더됐는데, 그러면 단건 상세(세션·자료 포함)가
  // 아직 안 왔는데도 아젠다·자료 섹션이 빈 배열을 진짜 상태로 오해하고 편집을 받아들여,
  // `PUT .../sessions`·`PUT .../documents`(배열 전체 교체 계약)가 그 빈 배열로 나가
  // 서버의 기존 세션·자료를 전부 지울 수 있었다(`/code-review` 발견, FE-24 ③·FE-25). 상세가 실제로 온 뒤에만 'idle'로
  // 본다 — 그때까지는 'loading'이라 `EditEventPage`가 `EditorScreen` 자체를 안 그린다.
  //
  // **`isKnownLocally`만으로는 부족하다** — 목록 조회가 `s.events`에 이 id의 항목을
  // (세션 없이) 추가하는 순간 `isKnownLocally`도 true가 돼, 원래 목적(순수 로컬 목업·
  // 게스트 이벤트는 서버 확인을 기다릴 필요가 없다)과 무관하게 **서버 이벤트조차** 상세
  // 도착 전에 'idle'로 새 버렸다(팀원 코드리뷰가 PR #63에서 재발견). `serverIds`에는
  // 있는데 `detailLoadedIds`엔 아직 없는 경우를 `isKnownLocally`보다 먼저 걸러
  // 'loading'으로 묶어 둔다 — 순수 로컬(게스트·시드) 이벤트만 `isKnownLocally`로
  // 즉시 'idle' 처리된다.
  //
  // **`notFoundId`·`errorId`는 `serverIds`-'loading'보다 먼저 확인한다** — 상세
  // 조회가 실패해 errorId가 찍힌 뒤에도 이 id는 여전히 serverIds에 남아 있다(목록
  // 조회가 존재를 이미 확인했으므로 지울 이유가 없다). serverIds 체크를 먼저 두면
  // 확정된 에러 상태를 영영 못 보고 무한 'loading'에 머문다(Codex 리뷰 2026-09-22
  // 발견).
  const loadStatus: 'idle' | 'loading' | 'notfound' | 'error' =
    effectiveId == null
      ? 'idle'
      : detailLoadedIds.has(effectiveId)
        ? 'idle'
        : effectiveId === notFoundId
          ? 'notfound'
          : effectiveId === errorId
            ? 'error'
            : serverIds.has(effectiveId)
              ? 'loading'
              : isKnownLocally
                ? 'idle'
                : 'loading';
  const { pendingSavesRef, saveTimersRef, flushServerSave, SAVE_DEBOUNCE_MS } = useEventSaveQueue({ patch });

  const { knownSessionIdsRef, pendingSessionsRef, sessionSaveTimersRef, flushSessionSave } = useSessionSync({ patch, setS });

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
        setDetailLoadedIds((prev) => new Set(prev).add(effectiveId));
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
        // 순수 로컬 이벤트(목업 시드 또는 방금 만든 새 이벤트, serverIds에 없음)는
        // 서버에 없는 게 정상 경로라 조용히 로컬로 남는다. `serverIds`에 이미 있는
        // (목록 조회로 존재가 확인된) 이벤트는 isKnownLocally가 true여도 정상 경로가
        // 아니다 — 그 경우까지 조용히 넘기면 loadStatus가 serverIds만 보고 무조건
        // 'loading'을 반환해(위 loadStatus 주석 참조) 무한 스피너가 된다(Codex 리뷰
        // 2026-09-22 발견). 그 밖의 id는 조회가 실패한 이유에 따라 갈린다 — 404면
        // 정말 없는 이벤트, 그 밖(타임아웃·500 등)은 존재 여부를 모르는 것뿐이라
        // notFound가 아니라 별도 에러 상태로 알린다(전에는 여기가 'loading'에 계속
        // 머물러 무한 스피너가 됐다 — 교차 리뷰 발견).
        console.warn('스튜디오 이벤트 실측 조회 실패:', e);
        if (isKnownLocally && !serverIds.has(effectiveId)) return;
        if (e instanceof ApiClientError && e.status === 404) {
          setNotFoundId(effectiveId);
        } else {
          setErrorId(effectiveId);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveId, isKnownLocally, knownSessionIdsRef, serverIds]);

  useEffect(() => {
    // 이벤트 목록에 더는 없는 기준선은 정리한다 — 방치하면 세션 내내 Map이 계속 쌓인다.
    const validIds = new Set(s.events.map((e) => e.id));
    for (const id of baselineRef.current.keys()) {
      if (!validIds.has(id)) baselineRef.current.delete(id);
    }
    if (effectiveId == null || baselineRef.current.has(effectiveId)) return;
    // 서버 이벤트는 상세(세션 포함)가 실제로 온 뒤에만 기준선을 잡는다 — 안 그러면
    // 목록 조회가 만든 빈 세션 스텁을 "원래 상태"로 잘못 기억해, 상세를 다 읽은
    // 뒤에 "아젠다 되돌리기"를 눌러도 서버의 기존 세션을 지우는 배열로 되돌아간다
    // (팀원 코드리뷰가 PR #63에서 발견).
    if (serverIds.has(effectiveId) && !detailLoadedIds.has(effectiveId)) return;
    const found = s.events.find((e) => e.id === effectiveId);
    if (found) baselineRef.current.set(effectiveId, found.sessions);
  }, [effectiveId, s.events, serverIds, detailLoadedIds]);

  const patchEvent: PatchEventFn = useCallback(
    (p) => {
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
        // 서버가 모르는 프리셋 id를 그대로 보내면 events.preset_id FK 위반으로 PATCH
        // 전체가 400 나서 같은 델타에 합쳐진 다른 필드까지 함께 실패한다(교차 리뷰
        // 발견). 내장(PRESETS) 또는 이미 POST /api/presets로 등록된 커스텀
        // 프리셋(customPresetIdsRef, FE-40)일 때만 그 필드를 보낸다 — `s.customPresets`
        // 대신 ref를 보는 이유: `saveDraft`가 `createPreset` 완료 직후 곧바로 이
        // `patchEvent`를 부르는데, 그 호출은 `createPreset`이 끝나기 **전** 렌더에서
        // 잡아 둔 오래된 클로저를 쓴다 — 그 클로저의 `s.customPresets`는 호출 시점
        // 스냅샷이라 막 등록된 새 id를 못 본다(리렌더가 아직 안 돌았으므로). ref는
        // 객체 정체성이 그대로라 오래된 클로저도 `.current`를 읽으면 항상 최신값을
        // 얻는다(코드 리뷰 발견 — 처음 버전은 이 문제로 한 번에 저장이 안 됐다).
        let serverDelta = delta;
        if (serverDelta?.presetId !== undefined) {
          const { presetId } = serverDelta;
          if (!isKnownPreset(presetId)) {
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
            setTimeout(() => {
              flushServerSave(effectiveId).catch(() => {});
            }, SAVE_DEBOUNCE_MS),
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
            setTimeout(() => {
              flushSessionSave(effectiveId).catch(() => {});
            }, SAVE_DEBOUNCE_MS),
          );
        }
      }
    },
    [isServerEvent, effectiveId, ev, isKnownPreset, pendingSavesRef, saveTimersRef, SAVE_DEBOUNCE_MS, flushServerSave, pendingSessionsRef, sessionSaveTimersRef, flushSessionSave],
  );

  // patchEvent를 통해 되돌린다 — 직접 setS만 하면 서버 이벤트에서 두 가지가
  // 어긋난다(`/code-review` 발견). ① 이 되돌리기 직전에 있던 아젠다 편집이 이미
  // 세션 저장 큐(`pendingSessionsRef`)에 대기 중이었다면 그 타이머가 그대로 살아남아
  // 되돌린 뒤에도 "되돌리기 전" 배열을 서버로 보낸다. ② 되돌리기 자체도 로컬에서만
  // 일어나 서버엔 반영되지 않는다 — 새로고침하면 되돌리기 전 상태가 다시 나온다.
  // patchEvent를 쓰면 두 문제 다 같은 메커니즘(최신 배열로 큐를 덮어쓰고 타이머를
  // 리셋)으로 풀린다.
  const resetSessions = useCallback(() => {
    if (effectiveId == null) return;
    const baseline = baselineRef.current.get(effectiveId);
    if (!baseline) return;
    patchEvent({ sessions: baseline.slice() });
  }, [effectiveId, patchEvent]);
  const { logout, deleteAccount, confirmImport, dismissImport } = useAccountActions({ setUser, setServerIds, setEventsListLoaded, detailLoadedRef, setDetailLoadedIds, loggedOutRef, customPresetIdsRef, setS, guestHydratedRef, setImportPrompt, setImportMessage, importPrompt, importBusyRef, setImportBusy });

  // FE-15 — 로그인이면 실제 POST, 게스트면 로컬에만 추가(기존 StudioShell 로직을
  // 여기로 옮겼다 — 로그인 분기가 화면 컴포넌트가 아니라 상태 층에 있어야 한다).
  const createEvent = useCallback(async (): Promise<number> => {
    const detail = defaultEventDetail();
    if (user) {
      // 생성 시점엔 여전히 제목으로 채운다 — 서버가 brand를 빈 문자열이면 필수
      // 위반으로 거절해서(app/api/events/route.ts), 폼 없이 부르는 이 생성 경로에선
      // 뭔가를 채워 보내야 한다. 에디터 기본 정보에 브랜드명 필드가 생겨(FE-42)
      // 생성 직후 바로 고칠 수 있으니, 그걸로 이 임시값을 대신한다.
      const created = await createStudioEvent({
        brand: detail.title,
        title: detail.title,
        venue: detail.venue || undefined,
        date: detail.date || undefined,
        host: detail.host || undefined,
      });
      setS((prev) => ({ ...prev, events: [created, ...prev.events], section: 'basic' }));
      setServerIds((prev) => new Set(prev).add(created.id));
      // 생성 응답에 이미 완전한 상세(세션·자료 포함, 새 이벤트라 둘 다 빈 배열)가
      // 실려 있다 — 단건 상세를 다시 조회하지 않아도 된다. 안 해두면 방금 만든
      // 이벤트를 바로 열었을 때 loadStatus가 'loading'으로 한 번 더 깜빡인다.
      detailLoadedRef.current.add(created.id);
      setDetailLoadedIds((prev) => new Set(prev).add(created.id));
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
          localRef: crypto.randomUUID(),
          ...detail,
        },
        ...prev.events,
      ],
      section: 'basic',
    }));
    return id;
  }, [user]);

  // 로그인 사용자만 실제로 저장한다(FE-40) — 로그인 필수는 서버(BE-25)도 401로
  // 강제하지만, 게스트는 애초에 호출하지 않아 불필요한 왕복·에러 문구를 피한다.
  // 실패는 호출자(ThemeSection)에게 그대로 던진다 — 401(로그인 필요)·409(이름 충돌)를
  // 서로 다른 문구로 보여줘야 해서 여기서 뭉뚱그리지 않는다.
  const createPreset = useCallback(
    async (input: { id: string; label: string; hue: number; chroma: number }): Promise<Preset> => {
      const created = await createStudioPreset(input);
      // 저장 요청이 나간 뒤 응답이 오기 전에 로그아웃했다면(공용 기기) 개인 프리셋을
      // 화면 state에 반영하지 않는다 — id는 이미 서버에 등록됐지만 그건 서버 쪽
      // 사실일 뿐, 이 브라우저 화면에 노출할지는 별개다.
      if (!loggedOutRef.current) {
        customPresetIdsRef.current.add(created.id);
        setS((prev) => {
          const idx = prev.customPresets.findIndex((p) => p.id === created.id);
          const customPresets =
            idx >= 0
              ? prev.customPresets.map((p, i) => (i === idx ? created : p))
              : [...prev.customPresets, created];
          return { ...prev, customPresets };
        });
      }
      return created;
    },
    [],
  );

  const setEventStatus = useCallback(
    async (status: EventStatus): Promise<void> => {
      if (effectiveId == null || !serverIds.has(effectiveId)) return;
      const id = effectiveId;
      // 공개·비공개 전환 직전에 대기 중인 필드·아젠다 저장을 먼저 끝낸다 — 안 그러면
      // 방금 고친 제목·아젠다가 아직 서버에 안 나간 채로 공개돼 참가자에게 낡은
      // 내용이 먼저 보이고, 그 저장이 실패해도 공개 자체는 성공해버린다(팀원
      // 코드리뷰가 PR #63에서 발견). 둘 중 하나라도 실패하면 여기서 던져 공개
      // 자체를 막는다 — 호출자(StudioShell)가 실패 사유를 사용자에게 보여준다.
      // 한 저장이 먼저 실패해도 다른 저장의 늦은 성공 문구가 오류를 덮지 않도록 둘 다 기다린다.
      const saves = await Promise.allSettled([flushServerSave(id), flushSessionSave(id)]);
      const failed = saves.find((result) => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
      await patchStudioEventStatus(id, status);
      setS((prev) => {
        const idx = prev.events.findIndex((e) => e.id === id);
        if (idx < 0) return prev;
        const events = prev.events.slice();
        events[idx] = { ...events[idx], status };
        return { ...prev, events };
      });
    },
    [effectiveId, serverIds, flushServerSave, flushSessionSave],
  );
  const { addDocument, removeDocument } = useDocumentUpload({ s, setS, effectiveId, serverIds });

  const presets = useMemo(() => [...PRESETS, ...s.customPresets], [s.customPresets]);
  const value = useMemo(
    () => ({
      s,
      ev,
      presets,
      patch,
      patchEvent,
      isServerEvent,
      resetSessions,
      loadStatus,
      user,
      authStatus,
      logout,
      deleteAccount,
      createEvent,
      setEventStatus,
      serverIds,
      eventsListLoaded,
      addDocument,
      removeDocument,
      createPreset,
      isKnownPreset,
      importPrompt,
      importBusy,
      importMessage,
      confirmImport,
      dismissImport,
    }),
    [
      s,
      ev,
      presets,
      patch,
      patchEvent,
      isServerEvent,
      resetSessions,
      loadStatus,
      user,
      authStatus,
      logout,
      deleteAccount,
      createEvent,
      setEventStatus,
      serverIds,
      eventsListLoaded,
      addDocument,
      removeDocument,
      createPreset,
      isKnownPreset,
      importPrompt,
      importBusy,
      importMessage,
      confirmImport,
      dismissImport,
    ],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio는 StudioProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}
