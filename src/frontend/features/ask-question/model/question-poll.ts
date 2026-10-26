import type { Question } from '../api';

// 요청 도중 등록된 질문만 잠시 보존한다. 요청 전에 등록을 마친 질문의 공개 여부는
// 서버 목록이 정본이다. 서버에서 한 번도 보지 못했더라도 숨긴 질문을 계속 붙이지 않는다.
export function reconcileQuestionPoll(
  serverQuestions: Question[],
  pendingQuestions: Question[],
  pendingAtRequestStart: ReadonlySet<number>,
) {
  const serverIds = new Set(serverQuestions.map((question) => question.id));
  const pending = pendingQuestions.filter((question) =>
    !pendingAtRequestStart.has(question.id) && !serverIds.has(question.id),
  );
  return { pending, questions: [...serverQuestions, ...pending] };
}
