import { BadRequest } from './db';

/** questions 테이블의 행. 컬럼명은 스키마와 1:1이다. */
export interface QuestionRow {
  id: number;
  event_id: number;
  session_id: number | null;
  body: string;
  author: string | null;
  status: string;
  client_hash: string | null;
  created_at: string;
}

export function toQuestionDTO(row: QuestionRow) {
  return {
    id: row.id,
    sessionId: row.session_id,
    body: row.body,
    author: row.author,
    createdAt: row.created_at,
  };
}

// 글자 수 제한 — 남용 통제이자 입력 가이드다. 참가자 대부분이 모바일이고
// 고령 사용자 기준(FE-3)에서도 질문은 짧다. 300자를 넘는 입력은 사람이 아니라
// 붙여넣기이거나 봇일 확률이 높다.
export const BODY_MIN = 2;
export const BODY_MAX = 300;
export const AUTHOR_MAX = 40;

// IP당 rate limit — 별도 저장소 없이 questions 테이블 자체로 판정한다
// (idx_questions_rate가 이 조회를 위한 인덱스다). KV를 붙이지 않는 이유는
// 무료 티어에서 바인딩 하나를 아끼는 것보다 "쓴 만큼만 센다"가 단순해서다.
export const RATE_WINDOW_SECONDS = 60;
export const RATE_MAX_PER_WINDOW = 3;
export const RATE_MAX_PER_DAY = 30;

/**
 * rate limit 판정용 클라이언트 해시.
 *
 * 원문 IP는 저장하지 않는다(스키마 주석 참조). SHA-256(ip|KST날짜)를 앞 16자로
 * 자른다 — 날짜를 섞어 해시가 매일 바뀌므로 회차를 넘는 추적이 안 되고,
 * "하루 N건" 판정은 해시당 총 건수 조회로 끝난다. 날짜가 KST인 것이 요점이다:
 * 시드 리셋 Cron(00:00 KST)과 해시 로테이션이 같은 순간이어야 하는데, UTC 날짜를
 * 쓰면 두 경계가 9시간 어긋나 카운터가 하루 두 번 리셋된다(IP당 실질 60건).
 */
export async function clientHash(request: Request): Promise<string> {
  // cf-connecting-ip는 CF 엣지가 채운다. x-forwarded-for 폴백은 엣지 밖
  // (next dev·wrangler preview) 전용이다 — 클라이언트가 위조할 수 있으므로
  // 운영에서 판정 근거가 되면 안 된다. ??가 아니라 ||인 이유: 빈 문자열
  // 헤더는 nullish가 아니라서 ??로는 'unknown'에 떨어지지 않는다.
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown';
  const day = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}|${day}`));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

/** 429로 되돌리기 위한 예외. BadRequest(400)와 구분한다. */
export class RateLimited extends Error {}

/**
 * 이 해시가 한도를 넘었는지 판정한다. 넘었으면 RateLimited를 던진다.
 *
 * 검사와 삽입 사이의 동시성 창은 감수한다 — 초과분 한두 건이 새는 것은
 * 남용 통제의 목적(무료 티어 소진 방지)에 영향이 없다.
 */
export async function assertRateLimit(db: D1Database, hash: string): Promise<void> {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS day_count,
         SUM(created_at >= datetime('now', ?)) AS recent_count
       FROM questions WHERE client_hash = ?`,
    )
    .bind(`-${RATE_WINDOW_SECONDS} seconds`, hash)
    .first<{ day_count: number; recent_count: number | null }>();

  if ((row?.recent_count ?? 0) >= RATE_MAX_PER_WINDOW) {
    throw new RateLimited(
      `잠시 후 다시 시도해 주세요. 질문은 ${RATE_WINDOW_SECONDS}초에 ${RATE_MAX_PER_WINDOW}건까지 남길 수 있습니다.`,
    );
  }
  if ((row?.day_count ?? 0) >= RATE_MAX_PER_DAY) {
    throw new RateLimited(`오늘 남길 수 있는 질문 수(${RATE_MAX_PER_DAY}건)를 모두 사용했습니다.`);
  }
}

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
