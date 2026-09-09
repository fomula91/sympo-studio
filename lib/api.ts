// BE-3 Q&A API용 fetch 헬퍼와 브라우저 익명 토큰 유틸 (llm-wiki/API-Guide-FE.md 계약)

export interface Question {
  id: number;
  sessionId: number | null;
  body: string;
  author: string | null;
  createdAt: string;
}

export class ApiClientError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = 'sympo-client-token';
// 응답 없이 매달리는 요청이 폴링을 영구히 멈추지 않도록 상한을 둔다(교차 리뷰 C2).
const FETCH_TIMEOUT_MS = 8000;

let memoryToken: string | null = null;

export function getClientToken(): string {
  if (memoryToken) return memoryToken;
  try {
    let token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem(TOKEN_KEY, token);
    }
    memoryToken = token;
    return token;
  } catch {
    // 프라이빗 모드 등 storage가 막힌 브라우저 — 매 요청 새 토큰이라 남용 통제는
    // IP 버킷으로 강등되지만(ADR 0006), 최소한 "전송 실패"로 끝나지 않는다.
    memoryToken = crypto.randomUUID();
    return memoryToken;
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || `요청이 실패했습니다 (${res.status})`;
  } catch {
    return `요청이 실패했습니다 (${res.status})`;
  }
}

export async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiClientError(0, '요청이 시간 초과됐습니다. 다시 시도해주세요.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchQuestions(eventId: number): Promise<Question[]> {
  // 3~5초 폴링이 오래된 응답을 재사용하지 않도록 명시(질문 API에는 아직 ETag 계약이 없다).
  const res = await fetchWithTimeout(`/api/events/${eventId}/questions`, { cache: 'no-store' });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  const data = (await res.json()) as { questions: Question[] };
  return data.questions;
}

export async function postQuestion(eventId: number, body: string): Promise<Question> {
  const res = await fetchWithTimeout(`/api/events/${eventId}/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-client-token': getClientToken() },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  return (await res.json()) as Question;
}

export interface SurveyAnswer {
  questionKey: string;
  answer: string | number;
  sessionId?: number;
}

// lib/survey.ts의 MAX_ANSWERS_PER_REQUEST와 같은 값 — 세션이 20개를 넘는 이벤트에서
// 참가자가 전 세션을 평가하면 answers가 20개를 넘어 서버가 통째로 400 거부한다.
const MAX_ANSWERS_PER_REQUEST = 20;

export async function submitSurvey(eventId: number, answers: SurveyAnswer[]): Promise<number> {
  let saved = 0;
  for (let i = 0; i < answers.length; i += MAX_ANSWERS_PER_REQUEST) {
    const chunk = answers.slice(i, i + MAX_ANSWERS_PER_REQUEST);
    const res = await fetchWithTimeout(`/api/events/${eventId}/survey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-client-token': getClientToken() },
      body: JSON.stringify({ answers: chunk }),
    });
    if (!res.ok) throw new ApiClientError(res.status, await readError(res));
    const data = (await res.json()) as { saved: number };
    saved += data.saved;
  }
  return saved;
}

export interface EventOps {
  capacity: number | null;
  visitors: number;
  pageViews: number;
  surveyCompleted: number;
  attendanceRate: number | null;
  sessions: { sessionId: number; visitors: number; hits: number }[];
  documents: { documentId: number; visitors: number; hits: number }[];
}

export async function fetchEventOps(eventId: number): Promise<EventOps> {
  const res = await fetchWithTimeout(`/api/events/${eventId}/ops`);
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
