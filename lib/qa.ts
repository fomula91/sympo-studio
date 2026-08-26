import { ApiError, BadRequest } from './db';

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

// rate limit — 별도 저장소 없이 questions 테이블 자체로 판정한다
// (idx_questions_rate·idx_questions_rate_token이 이 조회를 위한 인덱스다).
// KV를 붙이지 않는 이유는 무료 티어에서 바인딩 하나를 아끼는 것보다
// "쓴 만큼만 센다"가 단순해서다.
//
// 키는 2층이다(ADR 0006): 브라우저 토큰 버킷(사람의 질문 속도) + IP 총량
// 상한(위조 토큰 방어). 행사장 Wi-Fi는 단일 egress IP라 IP 단독 키로는
// 참가자 전원이 버킷 하나를 공유하게 된다.
export const RATE_WINDOW_SECONDS = 60;
export const RATE_MAX_PER_WINDOW = 3; // 브라우저(또는 토큰 없는 IP)당 60초
export const RATE_MAX_PER_DAY = 30; // 브라우저(또는 토큰 없는 IP)당 하루
export const IP_MAX_PER_WINDOW = 20; // IP 총량 60초 — 120명 행사의 Q&A 피크를 막지 않는 선
export const IP_MAX_PER_DAY = 300; // IP 총량 하루 — 브라우저 일 한도의 10배, D1 쓰기 무료 티어의 0.3%

// 브라우저 토큰(x-client-token 헤더) 형식. FE가 localStorage에 보관하는 익명
// UUID류다. 형식이 틀리면 400이 아니라 "토큰 없음"으로 강등한다 — 형식 오류가
// 거절 사유가 되면 FE의 토큰 생성 버그가 질문 기능 전체를 막는다.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** KST 하루가 판정·로테이션의 공통 경계다(시드 리셋 Cron = 00:00 KST). */
const KST_DAY_START_SQL = "datetime('now', '+9 hours', 'start of day', '-9 hours')";

async function sha16(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

export interface RateKeys {
  /** SHA-256(ip|KST날짜) 앞 16자 — IP 총량 상한 판정. questions.client_hash에 저장. */
  ipHash: string;
  /** SHA-256(토큰|KST날짜) 앞 16자 — 브라우저 버킷 판정. 토큰 없으면 null. questions.token_hash에 저장. */
  tokenHash: string | null;
}

/**
 * rate limit 판정용 키 2층(ADR 0006).
 *
 * 원문 IP·토큰은 저장하지 않는다(스키마 주석 참조) — 날짜를 섞어 해시가 매일
 * 바뀌므로 회차를 넘는 추적이 안 되고, "하루 N건" 판정은 해시당 건수 조회로
 * 끝난다. 날짜가 KST인 것이 요점이다: 시드 리셋 Cron(00:00 KST)과 로테이션이
 * 같은 순간이어야 하는데, UTC 날짜를 쓰면 두 경계가 9시간 어긋나 카운터가
 * 하루 두 번 리셋된다.
 *
 * 토큰 해시에 IP를 섞지 않는다 — 참가자가 Wi-Fi↔LTE를 오가도 버킷이 유지된다.
 * 위조 토큰의 무제한 시도는 IP 상한이 잡는다.
 */
export async function rateKeys(request: Request): Promise<RateKeys> {
  // cf-connecting-ip는 CF 엣지가 채운다. x-forwarded-for 폴백은 엣지 밖
  // (next dev·wrangler preview) 전용이다 — 클라이언트가 위조할 수 있으므로
  // 운영에서 판정 근거가 되면 안 된다. ??가 아니라 ||인 이유: 빈 문자열
  // 헤더는 nullish가 아니라서 ??로는 'unknown'에 떨어지지 않는다.
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown';
  const day = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const token = request.headers.get('x-client-token');
  return {
    ipHash: await sha16(`${ip}|${day}`),
    tokenHash: token && TOKEN_PATTERN.test(token) ? await sha16(`${token}|${day}`) : null,
  };
}

/** rate limit 초과 → 429. withRoute가 상태코드를 읽는다. */
export class RateLimited extends ApiError {
  constructor(message: string) {
    super(message, 429);
  }
}

/**
 * 두 층의 한도를 모두 검사한다. 넘었으면 RateLimited를 던진다(ADR 0006).
 *
 *   - 토큰 있음: 브라우저 버킷(token_hash, 3/60초·30/일) + IP 총량(client_hash, 20/60초·300/일)
 *   - 토큰 없음/형식 오류: IP 단독 버킷(3/60초·30/일) — 생략이 우회가 되지 않게
 *     한도는 브라우저 버킷과 같다.
 *
 * "하루"의 경계를 쿼리 자체에 둔다(KST 하루 시작) — 해시의 날짜 소금만 믿으면
 * 키 설계가 바뀔 때 COUNT가 조용히 전체 기간 카운트가 된다. 검사와 삽입 사이의
 * 동시성 창은 감수한다 — 초과분 한두 건이 새는 것은 남용 통제의 목적(무료 티어
 * 소진 방지)에 영향이 없다.
 */
export async function assertRateLimit(db: D1Database, keys: RateKeys): Promise<void> {
  const windowBind = `-${RATE_WINDOW_SECONDS} seconds`;

  if (!keys.tokenHash) {
    const row = await db
      .prepare(
        `SELECT
           COUNT(*) AS day_count,
           SUM(created_at >= datetime('now', ?)) AS recent_count
         FROM questions
         WHERE client_hash = ? AND created_at >= ${KST_DAY_START_SQL}`,
      )
      .bind(windowBind, keys.ipHash)
      .first<{ day_count: number; recent_count: number | null }>();

    if ((row?.recent_count ?? 0) >= RATE_MAX_PER_WINDOW) {
      throw new RateLimited(
        `잠시 후 다시 시도해 주세요. 질문은 ${RATE_WINDOW_SECONDS}초에 ${RATE_MAX_PER_WINDOW}건까지 남길 수 있습니다.`,
      );
    }
    if ((row?.day_count ?? 0) >= RATE_MAX_PER_DAY) {
      throw new RateLimited(`오늘 남길 수 있는 질문 수(${RATE_MAX_PER_DAY}건)를 모두 사용했습니다.`);
    }
    return;
  }

  const row = await db
    .prepare(
      `SELECT
         SUM(token_hash = ?1) AS browser_day,
         SUM(token_hash = ?1 AND created_at >= datetime('now', ?3)) AS browser_recent,
         SUM(client_hash = ?2) AS ip_day,
         SUM(client_hash = ?2 AND created_at >= datetime('now', ?3)) AS ip_recent
       FROM questions
       WHERE (token_hash = ?1 OR client_hash = ?2)
         AND created_at >= ${KST_DAY_START_SQL}`,
    )
    .bind(keys.tokenHash, keys.ipHash, windowBind)
    .first<{
      browser_day: number | null;
      browser_recent: number | null;
      ip_day: number | null;
      ip_recent: number | null;
    }>();

  if ((row?.browser_recent ?? 0) >= RATE_MAX_PER_WINDOW) {
    throw new RateLimited(
      `잠시 후 다시 시도해 주세요. 질문은 ${RATE_WINDOW_SECONDS}초에 ${RATE_MAX_PER_WINDOW}건까지 남길 수 있습니다.`,
    );
  }
  if ((row?.browser_day ?? 0) >= RATE_MAX_PER_DAY) {
    throw new RateLimited(`오늘 남길 수 있는 질문 수(${RATE_MAX_PER_DAY}건)를 모두 사용했습니다.`);
  }
  if ((row?.ip_recent ?? 0) >= IP_MAX_PER_WINDOW) {
    throw new RateLimited('현재 네트워크에서 잠시 질문이 몰렸습니다. 잠시 후 다시 시도해 주세요.');
  }
  if ((row?.ip_day ?? 0) >= IP_MAX_PER_DAY) {
    throw new RateLimited('오늘 이 네트워크에서 남길 수 있는 질문 수를 모두 사용했습니다.');
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
