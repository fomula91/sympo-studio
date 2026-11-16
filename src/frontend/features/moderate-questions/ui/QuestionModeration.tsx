'use client';

// 운영자는 참가자에게 보이는 질문과 숨긴 질문을 같은 화면에서 관리한다.
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@fe/shared/ui/Badge';
import { Card } from '@fe/shared/ui/Card';
import { ghostBtn, UI } from '@fe/shared/config/ui';
import { fetchModerationQuestions, setQuestionStatus, type ModerationQuestion, type QuestionStatus } from '../api';

const FILTERS = [{ value: 'all', label: '전체' }, { value: 'published', label: '공개 중' }, { value: 'hidden', label: '숨김' }] as const;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '요청에 실패했습니다. 연결을 확인하고 다시 시도해주세요.';

export default function QuestionModeration({ eventId }: { eventId: number }) {
  const [questions, setQuestions] = useState<ModerationQuestion[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<'all' | QuestionStatus>('all');
  const busyRef = useRef(true);

  useEffect(() => {
    const controller = new AbortController();
    fetchModerationQuestions(eventId, undefined, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      setQuestions(data.questions);
      setNextCursor(data.nextCursor);
    }).catch((e: unknown) => {
      if (!controller.signal.aborted) setError(errorMessage(e));
    }).finally(() => {
      if (!controller.signal.aborted) { setLoading(false); busyRef.current = false; }
    });
    return () => controller.abort();
  }, [eventId]);

  async function loadMore(before?: number) {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setError(null);
    setNotice('');
    try {
      const data = await fetchModerationQuestions(eventId, before);
      setQuestions((current) => before ? [...current, ...data.questions] : data.questions);
      setNextCursor(data.nextCursor);
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); busyRef.current = false; }
  }

  async function moderate(question: ModerationQuestion) {
    if (busyRef.current) return;
    busyRef.current = true;
    setPendingId(question.id);
    setError(null);
    setNotice('');
    const status = question.status === 'published' ? 'hidden' : 'published';
    try {
      const updated = await setQuestionStatus(eventId, question.id, status);
      setQuestions((current) => current.map((q) => q.id === updated.id ? { ...q, status: updated.status } : q));
      setNotice(status === 'hidden' ? '질문을 숨겼습니다. 참가자 화면에는 다음 갱신 때 반영됩니다.' : '질문을 복구했습니다. 참가자 화면에는 다음 갱신 때 반영됩니다.');
    } catch (e) { setError(errorMessage(e)); }
    finally { setPendingId(null); busyRef.current = false; }
  }

  const busy = loading || pendingId !== null;
  const visible = questions.filter((q) => filter === 'all' || q.status === filter);
  return (
    <Card padding={16} radius={12} style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>질문 관리</h3>
        <button type="button" style={ghostBtn} disabled={busy} onClick={() => void loadMore()}>새로고침</button>
      </div>
      <p style={{ fontSize: 13, color: UI.muted, lineHeight: 1.6 }}>
        최신 질문부터 표시합니다. 숨긴 질문은 참가자에게 표시되지 않으며 다시 복구할 수 있습니다. 새 질문은 새로고침으로 확인하세요.
      </p>
      <div role="group" aria-label="질문 상태 필터" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {FILTERS.map((item) => (
          <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}
            style={{ ...ghostBtn, borderColor: filter === item.value ? UI.brand : UI.line, color: filter === item.value ? UI.brand : UI.ink }}>
            {item.label}
          </button>
        ))}
      </div>
      {error ? <div role="alert" style={{ color: UI.toneDangerFg, fontSize: 13, marginBottom: 12 }}>{error}</div> : null}
      <div role="status" style={{ fontSize: 13, color: UI.muted, lineHeight: 1.5 }}>{loading ? '질문을 불러오는 중…' : notice}</div>
      {!loading && !error && visible.length === 0 ? <p style={{ fontSize: 14, color: UI.muted }}>{questions.length === 0 ? '아직 등록된 질문이 없습니다.' : '불러온 질문 중 이 상태의 질문이 없습니다.'}</p> : null}
      <ul aria-label="관리할 질문" aria-busy={busy} style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
        {visible.map((q) => (
          <li key={q.id} style={{ borderTop: `1px solid ${UI.line}`, padding: '14px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: UI.muted }}>
              <Badge tone={q.status === 'hidden' ? 'muted' : 'success'}>{q.status === 'hidden' ? '숨김' : '공개 중'}</Badge>
              <span>{q.author || '익명'}</span>
              <time dateTime={q.createdAt}>{new Date(q.createdAt).toLocaleString('ko-KR')}</time>
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '10px 0', color: UI.ink }}>{q.body}</p>
            <button type="button" disabled={busy} style={ghostBtn} onClick={() => void moderate(q)} aria-label={`질문 ${q.id} ${q.status === 'hidden' ? '복구' : '숨기기'}`}>
              {pendingId === q.id ? '처리 중…' : q.status === 'hidden' ? '복구' : '숨기기'}
            </button>
          </li>
        ))}
      </ul>
      {nextCursor !== null ? <button type="button" style={ghostBtn} disabled={busy} onClick={() => void loadMore(nextCursor)}>이전 질문 더 보기</button> : null}
    </Card>
  );
}
