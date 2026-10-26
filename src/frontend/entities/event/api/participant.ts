import { ApiClientError, getClientToken, readError, fetchWithTimeout } from '@fe/shared/api/http';

export interface EventOps {
  capacity: number | null;
  visitors: number;
  pageViews: number;
  surveyCompleted: number;
  attendanceRate: number | null;
  sessions: { sessionId: number; visitors: number; hits: number }[];
  documents: { documentId: number; visitors: number; hits: number }[];
}

/**
 * 운영자용 집계 — **로그인한 소유자만** 받을 수 있다(BE-24). 남의 것이면 404다.
 * 참가자 공개 리포트는 `fetchPublicReport`를 쓴다.
 */
export async function fetchEventOps(eventId: number): Promise<EventOps> {
  const res = await fetchWithTimeout(`/api/events/${eventId}/ops`);
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  return (await res.json()) as EventOps;
}

/**
 * 공개 행사의 실측 집계 — 무인증이고 **slug로** 지목한다 (BE-24).
 *
 * `/[slug]/report`가 쓰던 `/api/events/[id]/ops`가 소유자 전용이 되면서 갈라졌다.
 * 이벤트 id를 알 필요가 없어진 것이 부수 효과다 — 공개 페이지가 이미 slug를 쥐고 있다.
 */
export async function fetchPublicReport(slug: string): Promise<EventOps> {
  const res = await fetchWithTimeout(`/api/public/${slug}/report`, { cache: 'no-store' });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  return (await res.json()) as EventOps;
}

// kind별로 필요한 필드가 달라 유니온으로 강제한다 — sessionId?: number 식으로 전부 옵셔널이면
// doc_view에 documentId를 빼먹어도 컴파일은 통과하고 서버 400(lib/logs.ts validateLogsBody)으로만
// 드러나는데, sendEventLogs가 실패를 조용히 삼켜 개발 중에도 안 보인다.
export type EventLogEntry =
  | { kind: 'page_view' }
  | { kind: 'session_view'; sessionId: number }
  | { kind: 'doc_view'; documentId: number }
  | { kind: 'survey_complete' };

// lib/logs.ts의 MAX_LOGS_PER_REQUEST와 같은 값 — 서버가 이 개수를 넘는 요청을 통째로 400 거부하므로
// 클라이언트에서 먼저 잘라 보낸다(안 자르면 30개를 넘기는 순간 배치 전체가 조용히 유실된다).
const MAX_LOGS_PER_REQUEST = 30;

// 계측이지 참여 기능이 아니다 — 실패해도 화면 동작을 막지 않는다. 대신 호출자가 "보냈음" 표시를
// 되돌려 FE-9의 재연결 재조회 때 다시 시도할 수 있도록 성공 여부는 알려준다(FE-20/FE-21).
export async function sendEventLogs(eventId: number, logs: EventLogEntry[]): Promise<boolean> {
  let allOk = true;
  for (let i = 0; i < logs.length; i += MAX_LOGS_PER_REQUEST) {
    const chunk = logs.slice(i, i + MAX_LOGS_PER_REQUEST);
    try {
      const res = await fetchWithTimeout(`/api/events/${eventId}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-token': getClientToken() },
        body: JSON.stringify({ logs: chunk }),
        keepalive: true, // 페이지 이탈 직전에 쏜 요청이 브라우저에 의해 취소되지 않게
      });
      if (!res.ok) allOk = false;
    } catch {
      allOk = false;
    }
  }
  return allOk;
}
