'use client';

import { useCallback } from 'react';
import { ApiClientError } from "@fe/shared/api/http";

import { seedEvents } from "@fe/entities/event";
import { fetchStudioEvents } from "@fe/entities/event";

import { deleteStudioAccount, logoutStudioUser } from "@fe/entities/account";
import { importGuestEvents, IMPORT_BATCH_SIZE, toImportBody, type ImportResultDTO } from "./import-api";

import type { AuthUser } from "@fe/entities/account";
import type { EventItem } from "@fe/entities/event";
import type { StudioState } from "./types";

import type { Dispatch, SetStateAction, RefObject } from 'react';
import { readGuestWorkspace, writeGuestWorkspace } from './guest-storage';
import { mergeDetailLoadedEvents } from './event-merge';

export function useAccountActions({ setUser, setServerIds, setEventsListLoaded, detailLoadedRef, setDetailLoadedIds, loggedOutRef, customPresetIdsRef, setS, guestHydratedRef, setImportPrompt, setImportMessage, importPrompt, importBusyRef, setImportBusy }: {
 setUser: Dispatch<SetStateAction<AuthUser | null>>;
 setServerIds: Dispatch<SetStateAction<Set<number>>>;
 setEventsListLoaded: Dispatch<SetStateAction<boolean>>;
 detailLoadedRef: RefObject<Set<number>>;
 setDetailLoadedIds: Dispatch<SetStateAction<Set<number>>>;
 loggedOutRef: RefObject<boolean>;
 customPresetIdsRef: RefObject<Set<string>>;
 setS: Dispatch<SetStateAction<StudioState>>;
 guestHydratedRef: RefObject<boolean>;
 setImportPrompt: Dispatch<SetStateAction<EventItem[] | null>>;
 setImportMessage: Dispatch<SetStateAction<string | null>>;
 importPrompt: EventItem[] | null;
 importBusyRef: RefObject<boolean>;
 setImportBusy: Dispatch<SetStateAction<boolean>>;
}) {

  // FE-15 — 로그아웃·FE-48 계정 삭제가 공유하는 로컬 정리. 둘 다 "서버에 더는 이
  // 사용자로 남을 것이 없다"는 같은 결과라 게스트로 되돌리는 방식이 같다 — 서버
  // 목록을 지우고 localStorage 워크스페이스를(있으면) 다시 읽어온다(로그인 전과
  // 같은 경로다).
  const resetToGuest = useCallback(() => {
    setUser(null);
    setServerIds(new Set());
    setEventsListLoaded(false);
    // serverIds와 같이 비운다 — 안 그러면 로그아웃 후에도 detailLoadedIds에 남은 id가
    // loadStatus를 'idle'로 잘못 판정해(아래 loadStatus 계산부 주석 참조), 방금
    // 초기화된 s.events(게스트/시드)에는 그 id가 없어 편집 화면이 로딩·에러 표시
    // 없이 곧장 notFound()로 떨어진다 — AccountMenu는 이 화면에서도 로그아웃이 가능하다.
    detailLoadedRef.current = new Set();
    setDetailLoadedIds(new Set());
    // 개인 추출 프리셋(이름·색)도 함께 비운다 — 안 그러면 공용 기기에서 로그아웃한
    // 뒤에도 이전 사용자의 프리셋이 테마 탭에 그대로 남는다(코드 리뷰 발견).
    // loggedOutRef를 먼저 세워 로그아웃 전에 시작된 조회·저장 응답이 뒤늦게 와도
    // 이 화면에 다시 채워 넣지 못하게 막는다(fetchStudioPresets·createPreset 참조).
    loggedOutRef.current = true;
    customPresetIdsRef.current = new Set();
    const stored = readGuestWorkspace();
    setS((prev) => ({ ...prev, events: stored ?? seedEvents(), customPresets: [] }));
    guestHydratedRef.current = true;
    // 로그인 중에만 의미 있는 배너다 — 로그아웃하면 지운다(다시 로그인하면 마운트
    // 이펙트가 다시 판정한다, 이 컴포넌트는 로그아웃으로 리마운트되지 않는다).
    setImportPrompt(null);
    setImportMessage(null);
  }, [customPresetIdsRef, detailLoadedRef, guestHydratedRef, loggedOutRef, setDetailLoadedIds, setEventsListLoaded, setImportMessage, setImportPrompt, setS, setServerIds, setUser]);

  const logout = useCallback(async () => {
    await logoutStudioUser();
    resetToGuest();
  }, [resetToGuest]);

  // FE-48 — 계정 삭제. 서버가 이벤트·아젠다·자료·질문·설문·로그·R2 파일·프리셋·Google
  // 연결·세션을 전부 지우고 세션 쿠키도 만료시키므로(BE-41), 별도로 로그아웃 API를
  // 부를 필요 없이 logout과 같은 로컬 정리만 하면 된다.
  const deleteAccount = useCallback(async (): Promise<void> => {
    await deleteStudioAccount();
    resetToGuest();
  }, [resetToGuest]);

  // FE-39 — 게스트 워크스페이스를 계정으로 가져온다. `IMPORT_BATCH_SIZE`씩 나눠
  // 보낸다(서버 상한). 성공(created·exists)한 항목만 로컬에서 지운다 — 실패분은
  // `importPrompt`에 남겨 재시도 경로를 만든다.
  const confirmImport = useCallback(async (): Promise<void> => {
    const pending = importPrompt;
    if (!pending || pending.length === 0 || importBusyRef.current) return;
    importBusyRef.current = true;
    setImportBusy(true);
    setImportMessage(null);
    try {
      const results: ImportResultDTO[] = [];
      for (let i = 0; i < pending.length; i += IMPORT_BATCH_SIZE) {
        const batch = pending.slice(i, i + IMPORT_BATCH_SIZE);
        try {
          results.push(...(await importGuestEvents(batch.map(toImportBody))));
        } catch (e) {
          // 배치 전체가 한 번에 검증된다(`validateImportBody`) — 묵은 게스트 데이터
          // 하나가 지금 서버 규칙(글자 수 등)을 어기면 그 하나 때문에 같은 배치의
          // 멀쩡한 나머지까지 통째로 거절된다. 건별로 다시 보내 문제 있는 것만
          // 가려낸다(`/code-review` 발견 — 안 그러면 같은 배치를 다시 시도해도
          // 영원히 같은 이유로 막혀, 건강한 나머지 19개도 영영 못 들어간다).
          const fallback = e instanceof ApiClientError ? e.message : '가져오기에 실패했습니다. 다시 시도해 주세요.';
          for (const ev of batch) {
            try {
              results.push(...(await importGuestEvents([toImportBody(ev)])));
            } catch (e2) {
              results.push({
                clientRef: ev.localRef!,
                status: 'failed',
                error: e2 instanceof ApiClientError ? e2.message : fallback,
              });
            }
          }
        }
      }

      // 로그인한 사이에 로그아웃했다면(응답을 기다리는 동안) 이 결과는 이미 끝난
      // 세션의 것이다 — 게스트로 돌아간 화면에 반영하면 안 된다(`/code-review`
      // 발견: 안 그러면 logout()이 비운 상태를 이 응답이 되살리고, 전 계정의
      // 이벤트가 guest-persist 이펙트를 타고 게스트 localStorage에까지 섞여 들어간다).
      if (loggedOutRef.current) return;

      const byRef = new Map(results.map((r) => [r.clientRef, r]));
      const imported = (status: string | undefined) => status === 'created' || status === 'exists';
      const retry = pending.filter((e) => !imported(byRef.get(e.localRef!)?.status));
      const succeeded = pending.length - retry.length;

      // 성공분만 게스트 워크스페이스에서 지운다 — 남기면 재로그인 때 중복 제안된다.
      const remaining = (readGuestWorkspace() ?? []).filter(
        (e) => !e.localRef || !imported(byRef.get(e.localRef)?.status),
      );
      writeGuestWorkspace(remaining);

      // 가져온 이벤트를 화면에 반영한다 — 목록을 다시 받아와 통째로 맞춘다
      // (가져오기 응답엔 id·slug뿐이라 테마·아젠다까지 포함한 완전한 모양이 아니다).
      // 이미 상세를 불러온 이벤트가 있으면 그 값을 지키며 병합한다(mergeDetailLoadedEvents —
      // 그냥 덮어쓰면 방금 본 이벤트의 키 비주얼·세션·자료가 사라질 뻔했다, 코드 리뷰 발견).
      if (succeeded > 0) {
        try {
          const events = await fetchStudioEvents();
          if (!loggedOutRef.current) {
            setS((prev) => ({
              ...prev,
              events: mergeDetailLoadedEvents(prev.events, events, detailLoadedRef.current),
            }));
            setServerIds(new Set(events.map((e) => e.id)));
          }
        } catch (e) {
          console.warn('가져오기 후 목록 재조회 실패:', e);
        }
      }

      const slugChanged = results.some((r) => r.slugChanged);
      // 서버에 없는 프리셋이라 테마 색이 빈 채로 저장된 경우(게스트가 로컬에서만
      // 만든 추출 프리셋) — 조용히 넘어가면 "가져왔는데 브랜드 색이 사라졌다"를
      // 사용자가 알 방법이 없다(코드 리뷰 발견).
      const presetDropped = results.some((r) => r.presetDropped);
      // 실패 사유는 서버가 돌려준 문구를 그대로 보여준다(여러 건이 같은 이유로
      // 실패하는 게 보통이라 중복은 한 번만) — StudioShell 일괄 작업의 실패 토스트와
      // 같은 패턴. 계정당 한도 초과처럼 다시 눌러도 똑같이 막히는 사유도 이걸로
      // 드러난다(코드 리뷰 발견: "다시 시도할 수 있습니다"라는 문구만 보면 재시도가
      // 통할 것처럼 읽힌다).
      const reasons = [...new Set(retry.map((e) => byRef.get(e.localRef!)?.error).filter((r): r is string => !!r))];
      setImportMessage(
        `${succeeded}개 가져왔습니다.`
          + (retry.length > 0
              ? ` ${retry.length}개는 가져오지 못했습니다${reasons.length > 0 ? ` — ${reasons.join(' / ')}` : ''}.`
              : '')
          + (slugChanged ? ' 주소가 겹쳐 일부 이벤트의 주소가 바뀌었습니다.' : '')
          + (presetDropped ? ' 일부 이벤트의 브랜드 테마는 서버에 없어 기본값으로 저장됐습니다.' : ''),
      );
      setImportPrompt(retry.length > 0 ? retry : null);
    } finally {
      importBusyRef.current = false;
      setImportBusy(false);
    }
  }, [detailLoadedRef, importBusyRef, importPrompt, loggedOutRef, setImportBusy, setImportMessage, setImportPrompt, setS, setServerIds]);

  // 거절 — 로컬 워크스페이스는 그대로 둔다("거절 시 로컬 보존").
  const dismissImport = useCallback(() => {
    setImportPrompt(null);
    setImportMessage(null);
  }, [setImportMessage, setImportPrompt]);
 return { logout, deleteAccount, confirmImport, dismissImport };
}
