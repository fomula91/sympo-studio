'use client';

// 설문 참여 패널 — 2단(행사 전체 만족도 → 세션별 평가) 후 수료증 다운로드로 이어지는 흐름.
// 고령 참가자가 주 대상이라(field-experience.md) 문항 수를 최소화하고 버튼을 크게 잡았다.
import { useEffect, useRef, useState } from 'react';
import { ApiClientError, submitSurvey, type SurveyAnswer } from '@/lib/api';
import { generateCertificate } from '@/lib/certificate';
import type { Session } from '@/lib/types';
import type { Theme } from '@/lib/theme';

interface SurveyPanelProps {
  theme: Theme;
  online: boolean;
  eventId: number;
  sessions: Session[];
  eventTitle: string;
  venue: string;
  date: string;
  /** engage.cert — 꺼진 이벤트는 완료 화면에 수료증 다운로드를 보여주지 않는다. */
  certEnabled: boolean;
  onComplete?: () => void;
}

const RATING_LABELS = ['매우 아쉬움', '아쉬움', '보통', '만족', '매우 만족'];

function RatingRow({
  value,
  onChange,
  theme: t,
  size = 'normal',
}: {
  value: number | null;
  onChange: (v: number) => void;
  theme: Theme;
  size?: 'normal' | 'compact';
}) {
  const height = size === 'compact' ? 44 : 56;
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={on}
            aria-label={`${n}점 — ${RATING_LABELS[n - 1]}`}
            style={{
              flex: 1,
              height,
              borderRadius: 12,
              border: `1.5px solid ${on ? t.brand : t.line}`,
              background: on ? t.brand : t.surface,
              color: on ? t.onBrand : t.ink,
              fontSize: size === 'compact' ? 15 : 18,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

export default function SurveyPanel({
  theme: t,
  online,
  eventId,
  sessions,
  eventTitle,
  venue,
  date,
  certEnabled,
  onComplete,
}: SurveyPanelProps) {
  const [step, setStep] = useState<1 | 2 | 'done'>(1);
  const [overall, setOverall] = useState<number | null>(null);
  const [sessionRatings, setSessionRatings] = useState<Record<number, number>>({});
  const [participantName, setParticipantName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [surveyDisabled, setSurveyDisabled] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 60초 창 한도 해제 타이머가 언마운트(설문 패널 닫기·페이지 이탈) 후에도 남아있으면
    // 사라진 컴포넌트에 setState를 호출한다 — 언마운트 시 정리한다.
    return () => {
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, []);

  async function handleSubmit() {
    if (overall == null) return;
    setSubmitting(true);
    setSubmitError(null);
    const answers: SurveyAnswer[] = [
      { questionKey: 'overall_satisfaction', answer: overall },
      ...Object.entries(sessionRatings).map(([sessionId, rating]) => ({
        questionKey: 'session_rating',
        answer: rating,
        sessionId: Number(sessionId),
      })),
    ];
    try {
      await submitSurvey(eventId, answers);
      setStep('done');
      onComplete?.();
    } catch (e) {
      if (e instanceof ApiClientError) {
        setSubmitError(e.message);
        if (e.status === 429) {
          const isDailyLimit = e.message.includes('오늘');
          setCooldown(true);
          if (!isDailyLimit) cooldownTimerRef.current = setTimeout(() => setCooldown(false), 60000);
        }
        if (e.status === 403) setSurveyDisabled(true);
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
    padding: '16px 15px',
  };

  if (surveyDisabled) {
    return (
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: t.muted, flex: 1 }}>설문이 비활성화된 이벤트입니다.</span>
        <button
          type="button"
          onClick={() => setSurveyDisabled(false)}
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
    );
  }

  if (step === 'done') {
    return (
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: t.ink }}>설문에 참여해주셔서 감사합니다</div>
        {certEnabled ? (
          <>
            <div>
              <label style={{ fontSize: 12.5, color: t.muted, display: 'block', marginBottom: 6 }}>
                이름을 남겨주시면 수료증에 표시됩니다 (선택)
              </label>
              <input
                value={participantName}
                onChange={(e) => setParticipantName(e.target.value)}
                placeholder="이름"
                maxLength={40}
                style={{
                  width: '100%',
                  height: 44,
                  borderRadius: 10,
                  border: `1px solid ${t.line}`,
                  background: t.bg,
                  color: t.ink,
                  fontSize: 15,
                  padding: '0 12px',
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => generateCertificate({ eventTitle, venue, date, participantName })}
              style={{
                height: 54,
                borderRadius: 14,
                border: 'none',
                background: t.brand,
                color: t.onBrand,
                fontSize: 14.5,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                cursor: 'pointer',
              }}
            >
              수료증 다운로드
            </button>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 10 }}>
      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: t.muted, letterSpacing: '0.06em' }}>
        {step}/2 단계
      </div>

      {step === 1 ? (
        <>
          <div style={{ fontSize: 16, fontWeight: 700, color: t.ink, lineHeight: 1.4 }}>
            오늘 행사, 전반적으로 만족하셨나요?
          </div>
          <RatingRow value={overall} onChange={setOverall} theme={t} />
          {overall != null ? (
            <div style={{ fontSize: 13, color: t.muted, textAlign: 'center' }}>{RATING_LABELS[overall - 1]}</div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setSubmitError(null);
              setStep(2);
            }}
            disabled={overall == null}
            style={{
              height: 54,
              borderRadius: 14,
              border: 'none',
              background: t.brand,
              color: t.onBrand,
              fontSize: 14.5,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              cursor: overall == null ? 'not-allowed' : 'pointer',
              opacity: overall == null ? 0.5 : 1,
            }}
          >
            다음
          </button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 16, fontWeight: 700, color: t.ink, lineHeight: 1.4 }}>
            각 세션이 도움이 되셨나요?
          </div>
          <div style={{ fontSize: 12, color: t.muted, marginTop: -10 }}>평가하고 싶은 세션만 답해도 됩니다</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {sessions.map((s) => (
              <div key={s.id}>
                <div style={{ fontSize: 13.5, fontWeight: 650, color: t.ink, marginBottom: 8 }}>{s.title}</div>
                <RatingRow
                  value={sessionRatings[s.id] ?? null}
                  onChange={(v) => setSessionRatings((prev) => ({ ...prev, [s.id]: v }))}
                  theme={t}
                  size="compact"
                />
              </div>
            ))}
          </div>
          {submitError ? (
            <div role="alert" style={{ fontSize: 12.5, color: t.muted }}>
              {submitError}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setSubmitError(null);
                setStep(1);
              }}
              style={{
                height: 54,
                width: 88,
                borderRadius: 14,
                border: `1px solid ${t.line}`,
                background: 'transparent',
                color: t.ink,
                fontSize: 14,
                fontWeight: 650,
                cursor: 'pointer',
              }}
            >
              이전
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!online || submitting || cooldown}
              style={{
                flex: 1,
                height: 54,
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
              {submitting ? '제출 중…' : '제출하기'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
