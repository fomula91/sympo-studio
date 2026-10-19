import { ApiClientError, getClientToken, readError, fetchWithTimeout } from '@fe/shared/api/http';

// BE-3 Q&A API용 fetch 헬퍼와 브라우저 익명 토큰 유틸 (llm-wiki/API-Guide-FE.md 계약)

export interface Question {
  id: number;
  sessionId: number | null;
  body: string;
  author: string | null;
  createdAt: string;
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
