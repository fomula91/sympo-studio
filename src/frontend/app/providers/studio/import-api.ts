import { readError } from '@fe/shared/api/studio-error';
import { ApiClientError, fetchWithTimeout } from '@fe/shared/api/http';
import type { EventItem } from "@fe/entities/event";

/** 한 번에 가져올 수 있는 이벤트 수(POST /api/events/import, `lib/import.ts`의 `MAX_IMPORT_EVENTS`와
 * 같은 값). 그 모듈을 그대로 import하지 않는다 — 서버 전용 `lib/db.ts`를 끌어와 클라이언트
 * 번들에 들어간다(`lib/event-limits.ts`가 상수만 분리해 둔 것과 같은 이유). */
export const IMPORT_BATCH_SIZE = 20;

export interface ImportEventInput {
  clientRef: string;
  brand: string;
  title: string;
  venue: string | null;
  date: string | null;
  host: string | null;
  capacity: number | null;
  status: string;
  slug: string | null;
  theme: {
    presetId: string | null;
    mode: string;
    iconSet: string;
    density: string;
    keyVisual: string | null;
    kvPattern: string;
  };
  // 참여 설정 — 서버가 엄격한 boolean으로 받아 그대로 저장한다(BE-40). 빠뜨리면
  // 가져온 이벤트의 Q&A·설문·수료증이 전부 꺼진 채 들어간다.
  engage: { qa: boolean; survey: boolean; chat: boolean; cert: boolean };
  sessions: { time: string | null; title: string; speaker: string | null; kind: string }[];
}

export interface ImportResultDTO {
  clientRef: string;
  status: 'created' | 'exists' | 'failed';
  id?: number;
  slug?: string;
  slugChanged?: boolean;
  presetDropped?: boolean;
  error?: string;
}

/**
 * 게스트 로컬 이벤트(`localRef` 있음) → POST /api/events/import 본문(FE-39).
 *
 * **키 비주얼은 보내지 않는다** — `lib/import.ts`의 `theme.keyVisual` 검증 상한이
 * 2000자라, FE-19 이후의 실제 base64 이미지(몇백KB~1MB대)는 애초에 통과하지 못한다.
 * `localStorage` 용량 판단: 이미지를 가져오기에 실어 보내는 대신 **제외**하고,
 * 로그인 후 다시 올리게 한다 — 참조(서버가 모르는 blob URL)나 IndexedDB 경유는
 * 이 특수 문자뿐인 좁은 입력에 비해 과하다.
 */
export function toImportBody(e: EventItem): ImportEventInput {
  const capNum = e.cap === '' ? null : Number(e.cap);
  return {
    clientRef: e.localRef!,
    brand: e.brand,
    title: e.title,
    venue: e.venue || null,
    date: e.date || null,
    host: e.host || null,
    capacity: capNum != null && !Number.isNaN(capNum) ? capNum : null,
    status: e.status,
    slug: e.slug || null,
    theme: {
      presetId: e.presetId || null,
      mode: e.mode,
      iconSet: e.iconSet,
      density: e.density,
      keyVisual: null,
      kvPattern: e.kvPattern,
    },
    engage: e.engage,
    sessions: e.sessions.map((s) => ({
      time: s.time || null,
      title: s.title,
      speaker: s.speaker || null,
      kind: s.kind,
    })),
  };
}

/**
 * POST /api/events/import — 게스트 워크스페이스를 계정으로 가져온다(FE-39, BE-15).
 * 호출자가 `IMPORT_BATCH_SIZE` 이하로 나눠 보낸다 — 서버가 한 번에 받는 상한이다.
 */
export async function importGuestEvents(events: ImportEventInput[]): Promise<ImportResultDTO[]> {
  const res = await fetchWithTimeout('/api/events/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  const data = (await res.json()) as { results: ImportResultDTO[] };
  return data.results;
}
