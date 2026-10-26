import { ApiClientError, getClientToken, readError, fetchWithTimeout } from '@fe/shared/api/http';

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
