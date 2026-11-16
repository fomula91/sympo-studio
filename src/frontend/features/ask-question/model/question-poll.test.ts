import { describe, expect, it } from 'vitest';
import type { Question } from '../api';
import { reconcileQuestionPoll } from './question-poll';

const question = (id: number): Question => ({ id, sessionId: null, body: `질문 ${id}`, author: null, createdAt: '2026-10-26T07:00:00Z' });

describe('질문 등록과 공개 목록 갱신의 경합', () => {
  it('등록 직후 첫 목록 조회 전에 숨겼다면 다시 붙이지 않는다', () => {
    const posted = question(1);
    const result = reconcileQuestionPoll([], [posted], new Set([posted.id]));
    expect(result).toEqual({ pending: [], questions: [] });
    expect(reconcileQuestionPoll([], result.pending, new Set()).questions).toEqual([]);
  });

  it('목록 요청 도중 등록한 질문은 오래된 응답이 지우지 않는다', () => {
    const posted = question(2);
    const first = reconcileQuestionPoll([question(1)], [posted], new Set());
    expect(first.questions.map((q) => q.id)).toEqual([1, 2]);
    expect(first.pending).toEqual([posted]);
    // 이후 요청부터 서버가 공개 여부를 결정한다. 숨겨졌다면 제거한다.
    const next = reconcileQuestionPoll([question(1)], first.pending, new Set([2]));
    expect(next.questions.map((q) => q.id)).toEqual([1]);
    expect(next.pending).toEqual([]);
  });

  it('서버에 확인된 질문은 임시 목록에서 제거하고 중복 없이 표시한다', () => {
    const posted = question(1);
    expect(reconcileQuestionPoll([posted], [posted], new Set())).toEqual({ pending: [], questions: [posted] });
  });

  it('여러 질문 중 요청 전에 등록된 질문만 서버 목록에 맡긴다', () => {
    const first = question(1);
    const second = question(2);
    const result = reconcileQuestionPoll([], [first, second], new Set([1]));
    expect(result).toEqual({ pending: [second], questions: [second] });
  });

  it('숨긴 질문을 복구하면 서버 목록을 통해 다시 표시한다', () => {
    const posted = question(1);
    const hidden = reconcileQuestionPoll([], [posted], new Set([1]));
    expect(reconcileQuestionPoll([posted], hidden.pending, new Set()).questions).toEqual([posted]);
  });
});
