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

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
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
