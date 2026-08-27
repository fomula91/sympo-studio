import { BadRequest } from './db';
import type { RatePolicy } from './rate-limit';

/** questions 테이블의 행. 컬럼명은 스키마와 1:1이다. */
export interface QuestionRow {
  id: number;
  event_id: number;
  session_id: number | null;
  body: string;
  author: string | null;
  status: string;
  client_hash: string | null;
  token_hash: string | null;
  created_at: string;
}

/** DTO가 실제로 읽는 컬럼만 — 목록 조회가 이 부분집합만 SELECT할 수 있게 한다. */
export type QuestionDTOInput = Pick<
  QuestionRow,
  'id' | 'session_id' | 'body' | 'author' | 'created_at'
>;

export function toQuestionDTO(row: QuestionDTOInput) {
  return {
    id: row.id,
    sessionId: row.session_id,
    body: row.body,
    author: row.author,
    // SQLite의 datetime('now')은 존 표기 없는 UTC('YYYY-MM-DD HH:MM:SS')다.
    // 그대로 내보내면 클라이언트 new Date()가 로컬 시간으로 오해해 KST에서
    // 9시간 어긋난다 — ISO-8601 + 'Z'로 바꿔 내보낸다.
    createdAt: row.created_at.replace(' ', 'T') + 'Z',
  };
}

// 글자 수 제한 — 남용 통제이자 입력 가이드다. 참가자 대부분이 모바일이고
// 고령 사용자 기준(FE-3)에서도 질문은 짧다. 300자를 넘는 입력은 사람이 아니라
// 붙여넣기이거나 봇일 확률이 높다.
export const BODY_MIN = 2;
export const BODY_MAX = 300;
export const AUTHOR_MAX = 40;

export const RATE_WINDOW_SECONDS = 60;
export const RATE_MAX_PER_WINDOW = 3; // 브라우저(또는 토큰 없는 IP)당 60초
export const RATE_MAX_PER_DAY = 30; // 브라우저(또는 토큰 없는 IP)당 하루
export const IP_MAX_PER_WINDOW = 20; // IP 총량 60초 — 120명 행사의 Q&A 피크를 막지 않는 선
export const IP_MAX_PER_DAY = 300; // IP 총량 하루 — 브라우저 일 한도의 10배, D1 쓰기 무료 티어의 0.3%

/** 질문 POST의 rate limit 정책 — 판정 구조는 lib/rate-limit.ts 공통. */
export const QUESTION_RATE_POLICY: RatePolicy = {
  table: 'questions',
  windowSeconds: RATE_WINDOW_SECONDS,
  maxPerWindow: RATE_MAX_PER_WINDOW,
  maxPerDay: RATE_MAX_PER_DAY,
  ipMaxPerWindow: IP_MAX_PER_WINDOW,
  ipMaxPerDay: IP_MAX_PER_DAY,
  messages: {
    window: `잠시 후 다시 시도해 주세요. 질문은 ${RATE_WINDOW_SECONDS}초에 ${RATE_MAX_PER_WINDOW}건까지 남길 수 있습니다.`,
    day: `오늘 남길 수 있는 질문 수(${RATE_MAX_PER_DAY}건)를 모두 사용했습니다.`,
    ipWindow: '현재 네트워크에서 잠시 질문이 몰렸습니다. 잠시 후 다시 시도해 주세요.',
    ipDay: '오늘 이 네트워크에서 남길 수 있는 질문 수를 모두 사용했습니다.',
  },
};

/** 본문·작성자 입력을 검증해 정리된 값을 돌려준다. */
export function validateQuestionInput(body: unknown, author: unknown): { body: string; author: string | null } {
  if (typeof body !== 'string') throw new BadRequest('body는 문자열이어야 합니다.');
  const trimmed = body.trim();
  if (trimmed.length < BODY_MIN) throw new BadRequest(`질문은 ${BODY_MIN}자 이상이어야 합니다.`);
  if (trimmed.length > BODY_MAX) throw new BadRequest(`질문은 ${BODY_MAX}자 이하여야 합니다.`);

  let authorClean: string | null = null;
  if (author !== undefined && author !== null && author !== '') {
    if (typeof author !== 'string') throw new BadRequest('author는 문자열이어야 합니다.');
    authorClean = author.trim();
    if (authorClean.length > AUTHOR_MAX) throw new BadRequest(`이름은 ${AUTHOR_MAX}자 이하여야 합니다.`);
    if (authorClean.length === 0) authorClean = null;
  }
  return { body: trimmed, author: authorClean };
}
