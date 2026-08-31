import { BadRequest } from './db';
import type { RatePolicy } from './rate-limit';

/** 검증을 통과한 응답 문항 하나. survey_responses 행 하나가 된다. */
export interface SurveyAnswer {
  questionKey: string;
  answer: string;
  sessionId: number | null;
}

// 문항 키는 FE-4가 정의하는 계약이다(예: 'overall_satisfaction',
// 'session_rating'). 서버는 형식만 검증하고 목록을 강제하지 않는다 —
// 설문 구조를 바꿔도 마이그레이션이 필요 없어야 한다는 스키마 설계
// (0001_init.sql의 survey_responses 주석)를 API에서도 유지한다.
export const KEY_MAX = 64;
export const KEY_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

// 응답 값 상한 — 객관식 값('5', 'yes')은 짧고, 주관식 의견도 질문(300자)보다
// 길 이유가 없다. 넘는 입력은 붙여넣기이거나 봇이다.
export const ANSWER_MAX = 300;

// 요청당 문항 수 상한 — 2단 설문(행사 전체) + 세션별 1문항(세션 6개)을 다
// 합쳐도 20을 넘지 않는다. 넘는 요청은 정상 FE가 만들 수 없다.
export const MAX_ANSWERS_PER_REQUEST = 20;

// rate limit — 판정 구조(2층 키·KST 하루 경계)는 질문과 동일 정책(BE-3)이되,
// 수치는 행 기준으로 환산한다: 질문은 요청 1건 = 행 1건이지만 설문은 요청
// 1건이 문항 수만큼 행을 만든다.
//   브라우저 60초 60행 = 질문의 3건/60초 × 최대 문항 20
//   브라우저 하루 200행 = 전체 설문(≤20문항) 기준 재제출 10회
//   IP 60초 400행 = 질문의 20건/60초 × 20 — 단일 Wi-Fi의 제출 피크를 막지 않는 선
//   IP 하루 2,000행 — 세션별 1문항 흐름(문항 ~10개)이면 120명 행사 전원을
//     담는다. D1 쓰기 무료 티어(10만/일)의 2%라 상한까지 남용돼도 티어는 안전하다.
export const SURVEY_RATE_POLICY: RatePolicy = {
  table: 'survey_responses',
  // 재제출이 upsert라 created_at(최초 제출)로는 재제출이 판정에 안 잡힌다.
  timeColumn: 'updated_at',
  windowSeconds: 60,
  maxPerWindow: 60,
  maxPerDay: 200,
  ipMaxPerWindow: 400,
  ipMaxPerDay: 2000,
  // 재제출은 upsert라 행이 안 는다 — 하루 한도는 행 수가 아니라 쓰기 누적
  // (write_count 합)으로 센다. 아니면 같은 문항 반복 제출이 어떤 한도에도
  // 안 걸린 채 D1 쓰기를 무한정 소모한다(RatePolicy.countWrites 주석 참조).
  countWrites: true,
  messages: {
    window: '잠시 후 다시 시도해 주세요. 설문 제출이 너무 잦습니다.',
    day: '오늘 제출할 수 있는 설문 응답 수를 모두 사용했습니다.',
    ipWindow: '현재 네트워크에서 잠시 설문 제출이 몰렸습니다. 잠시 후 다시 시도해 주세요.',
    ipDay: '오늘 이 네트워크에서 제출할 수 있는 설문 응답 수를 모두 사용했습니다.',
  },
};

/**
 * POST 본문을 검증해 정리된 문항 목록을 돌려준다.
 *
 * 기대 형태: { answers: [{ questionKey, answer, sessionId? }, …] }
 * answer는 문자열 외에 유한한 숫자도 받는다 — 별점·NPS류는 FE에서 숫자로
 * 다루는 것이 자연스럽고, 저장은 스키마대로 TEXT로 통일한다.
 */
export function validateSurveyBody(raw: unknown): SurveyAnswer[] {
  if (raw === null || typeof raw !== 'object') {
    throw new BadRequest('요청 본문은 JSON 객체여야 합니다.');
  }
  const answers = (raw as { answers?: unknown }).answers;
  if (!Array.isArray(answers) || answers.length === 0) {
    throw new BadRequest('answers는 1개 이상의 배열이어야 합니다.');
  }
  if (answers.length > MAX_ANSWERS_PER_REQUEST) {
    throw new BadRequest(`한 번에 제출할 수 있는 문항은 ${MAX_ANSWERS_PER_REQUEST}개까지입니다.`);
  }

  const seen = new Set<string>();
  return answers.map((item, i) => {
    if (item === null || typeof item !== 'object') {
      throw new BadRequest(`answers[${i}]는 객체여야 합니다.`);
    }
    const { questionKey, answer, sessionId } = item as {
      questionKey?: unknown;
      answer?: unknown;
      sessionId?: unknown;
    };

    if (typeof questionKey !== 'string' || !KEY_PATTERN.test(questionKey)) {
      throw new BadRequest(
        `answers[${i}].questionKey는 영문·숫자·'_','-','.' ${KEY_MAX}자 이내여야 합니다.`,
      );
    }

    let answerClean: string;
    if (typeof answer === 'number' && Number.isFinite(answer)) {
      answerClean = String(answer);
    } else if (typeof answer === 'string') {
      answerClean = answer.trim();
    } else {
      throw new BadRequest(`answers[${i}].answer는 문자열 또는 숫자여야 합니다.`);
    }
    if (answerClean.length === 0) throw new BadRequest(`answers[${i}].answer가 비어 있습니다.`);
    if (answerClean.length > ANSWER_MAX) {
      throw new BadRequest(`answers[${i}].answer는 ${ANSWER_MAX}자 이하여야 합니다.`);
    }

    let sessionClean: number | null = null;
    if (sessionId !== undefined && sessionId !== null) {
      if (typeof sessionId !== 'number' || !Number.isInteger(sessionId)) {
        throw new BadRequest(`answers[${i}].sessionId는 정수여야 합니다.`);
      }
      sessionClean = sessionId;
    }

    // 같은 (문항, 세션) 쌍이 한 요청에 두 번 오면 upsert가 조용히 뒤엣것으로
    // 덮는다 — FE 버그를 숨기지 않도록 400으로 드러낸다.
    const dupKey = `${questionKey}|${sessionClean ?? -1}`;
    if (seen.has(dupKey)) {
      throw new BadRequest(`answers[${i}]가 같은 문항(${questionKey})을 중복 제출합니다.`);
    }
    seen.add(dupKey);

    return { questionKey, answer: answerClean, sessionId: sessionClean };
  });
}
