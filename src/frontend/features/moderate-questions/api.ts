import { ApiClientError, fetchWithTimeout, readError } from '@fe/shared/api/http';

export type QuestionStatus = 'published' | 'hidden';
export interface ModerationQuestion {
  id: number;
  sessionId: number | null;
  body: string;
  author: string | null;
  createdAt: string;
  status: QuestionStatus;
}

export async function fetchModerationQuestions(eventId: number, before?: number, signal?: AbortSignal) {
  const res = await fetchWithTimeout(`/api/events/${eventId}/questions/moderation${before ? `?before=${before}` : ''}`, {
    cache: 'no-store', signal,
  });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  return await res.json() as { questions: ModerationQuestion[]; nextCursor: number | null };
}

export async function setQuestionStatus(eventId: number, questionId: number, status: QuestionStatus) {
  const res = await fetchWithTimeout(`/api/events/${eventId}/questions/${questionId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new ApiClientError(res.status, await readError(res));
  return await res.json() as { id: number; status: QuestionStatus };
}
