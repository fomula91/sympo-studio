'use client';

// Q&A 목록 폴링 + 질문 등록 폼 — Microsite의 "질문 남기기" 패널
import { useEffect, useRef, useState } from 'react';
import { ApiClientError, fetchQuestions, postQuestion, type Question } from '@/lib/api';
import type { Theme } from '@/lib/theme';

interface QaPanelProps {
  theme: Theme;
  online: boolean;
  eventId: number;
}

export default function QaPanel({ theme: t, online, eventId }: QaPanelProps) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const [qaDisabled, setQaDisabled] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef(false);
  // 로컬에서 막 등록했지만 아직 서버 GET 응답에서 확인 안 된 질문들 — 확인되기 전까지
  // 폴링이 통째로 덮어써도 사라지지 않게 보존한다(여러 폴링 주기에 걸쳐도 안전).
  const pendingRef = useRef<Question[]>([]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    const load = async () => {
      // 탭이 백그라운드면 쉰다 — 참가자가 탭을 열어두기만 해도 계속 돌면 D1 읽기 티어를 갉아먹는다.
      if (document.hidden || inFlight.current) return;
      inFlight.current = true;
      try {
        const qs = await fetchQuestions(eventId);
        if (!cancelled) {
          pendingRef.current = pendingRef.current.filter((p) => !qs.some((existing) => existing.id === p.id));
          setQuestions(pendingRef.current.length > 0 ? [...qs, ...pendingRef.current] : qs);
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof ApiClientError ? e.message : '질문을 불러오지 못했습니다.');
      } finally {
        inFlight.current = false;
      }
    };
    load();
    const id = setInterval(load, 4000);
    const onVisible = () => {
      if (!document.hidden) load(); // 다시 보이면 바로 한 번 갱신
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [online, eventId]);

  async function handleSubmit() {
    const trimmed = draft.trim();
    if (trimmed.length < 2 || trimmed.length > 300) {
      setSubmitError('질문은 2~300자로 입력해주세요.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const question = await postQuestion(eventId, trimmed);
      setDraft('');
      pendingRef.current = [...pendingRef.current, question];
      // 다음 폴링(최대 4초)까지 기다리지 않고 목록에 바로 반영 — 같은 질문이 폴링으로 다시 와도 id로 중복 제거
      setQuestions((current) => {
        const list = current ?? [];
        return list.some((q) => q.id === question.id) ? list : [...list, question];
      });
    } catch (e) {
      if (e instanceof ApiClientError) {
        setSubmitError(e.message);
        if (e.status === 429) {
          // 하루 한도 문구는 60초 뒤에 다시 눌러도 똑같이 막힌다 — 그 경우엔 자동으로 풀어주지 않는다
          // (거짓 희망을 주지 않는다). 60초 창 한도만 자동으로 풀어준다.
          const isDailyLimit = e.message.includes('오늘');
          setCooldown(true);
          if (!isDailyLimit) setTimeout(() => setCooldown(false), 60000);
        }
        if (e.status === 403) setQaDisabled(true);
      } else {
        setSubmitError('전송에 실패했습니다.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const cardStyle = {
    background: t.surface,
    border: `1px solid ${t.line}`,
    borderRadius: 13,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
      <div style={{ ...cardStyle, padding: '12px 13px', maxHeight: 220, overflowY: 'auto' }}>
        {loadError ? (
          <div role="alert" style={{ fontSize: 13, color: t.muted }}>
            {loadError}
          </div>
        ) : questions === null ? (
          <div style={{ fontSize: 13, color: t.muted }}>불러오는 중…</div>
        ) : questions.length === 0 ? (
          <div style={{ fontSize: 13, color: t.muted }}>아직 질문이 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {questions.map((q) => (
              <div key={q.id}>
                <div style={{ fontSize: 11.5, color: t.muted, marginBottom: 2 }}>{q.author ?? '익명'}</div>
                <div style={{ fontSize: 13.5, color: t.ink, lineHeight: 1.45, textWrap: 'pretty' }}>{q.body}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ fontSize: 11.5, color: t.muted }}>질문을 남기면 잠시 후 아래 목록에 표시됩니다.</div>

      {qaDisabled ? (
        <div style={{ fontSize: 13, color: t.muted, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Q&A가 비활성화된 이벤트입니다.</span>
          <button
            type="button"
            onClick={() => setQaDisabled(false)}
            style={{
              fontSize: 12,
              textDecoration: 'underline',
              background: 'none',
              border: 'none',
              color: t.brand,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            다시 시도
          </button>
        </div>
      ) : (
        <>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!online || submitting}
            placeholder="궁금한 점을 남겨주세요"
            maxLength={300}
            rows={3}
            style={{
              ...cardStyle,
              padding: '11px 13px',
              fontSize: 15,
              fontFamily: 'inherit',
              color: t.ink,
              resize: 'vertical',
              minHeight: 44,
            }}
          />
          {submitError ? (
            <div role="alert" style={{ fontSize: 12.5, color: t.muted }}>
              {submitError}
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!online || submitting || cooldown || draft.trim().length === 0}
            style={{
              height: 48,
              borderRadius: 14,
              border: 'none',
              background: t.brand,
              color: t.onBrand,
              fontSize: 14.5,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              cursor: !online || submitting || cooldown ? 'not-allowed' : 'pointer',
              opacity: !online || submitting || cooldown ? 0.5 : 1,
            }}
          >
            {submitting ? '전송 중…' : '질문 보내기'}
          </button>
        </>
      )}
    </div>
  );
}
