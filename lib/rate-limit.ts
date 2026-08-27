import { ApiError } from './db';

// rate limit — 별도 저장소 없이 판정 대상 테이블 자체로 센다(BE-3에서 시작해
// BE-4가 재사용). KV를 붙이지 않는 이유는 무료 티어에서 바인딩 하나를 아끼는
// 것보다 "쓴 만큼만 센다"가 단순해서다.
//
// 키는 2층이다(ADR 0006): 브라우저 토큰 버킷(사람의 제출 속도) + IP 총량
// 상한(위조 토큰 방어). 행사장 Wi-Fi는 단일 egress IP라 IP 단독 키로는
// 참가자 전원이 버킷 하나를 공유하게 된다.
//
// 한도·메시지·대상 테이블은 정책(RatePolicy)으로 라우트마다 다르다 —
// 질문은 요청 1건 = 행 1건이지만 설문은 요청 1건이 문항 수만큼 행을 만들므로
// 같은 수치를 쓸 수 없다. 판정 구조(2층 키·KST 하루 경계)만 공통이다.

/**
 * 브라우저 토큰(x-client-token 헤더) 형식. FE가 localStorage에 보관하는 익명
 * UUID류다. 형식이 틀리면 400이 아니라 "토큰 없음"으로 강등한다 — 형식 오류가
 * 거절 사유가 되면 FE의 토큰 생성 버그가 기능 전체를 막는다.
 * (설문처럼 토큰이 저장 자체에 필요한 라우트는 예외 — 그쪽 주석 참조.)
 */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** KST 하루가 판정·로테이션의 공통 경계다(시드 리셋 Cron = 00:00 KST). */
const KST_DAY_START_SQL = "datetime('now', '+9 hours', 'start of day', '-9 hours')";

export async function sha16(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

export interface RateKeys {
  /** SHA-256(ip|KST날짜) 앞 16자 — IP 총량 상한 판정. client_hash 컬럼에 저장. */
  ipHash: string;
  /** SHA-256(토큰|KST날짜) 앞 16자 — 브라우저 버킷 판정. 토큰 없으면 null. token_hash 컬럼에 저장. */
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
 * 라우트별 rate limit 정책. 대상 테이블은 client_hash·token_hash·created_at
 * 컬럼과 (client_hash, created_at)·(token_hash, created_at) 인덱스를 갖춰야
 * 한다. table은 여기 유니온에 있는 상수만 허용된다 — SQL에 문자열로 삽입되므로
 * 임의 값이 들어오는 경로를 타입에서 막는다.
 */
export interface RatePolicy {
  table: 'questions' | 'survey_responses';
  windowSeconds: number;
  /** 브라우저(또는 토큰 없는 IP) 버킷 한도 — 행 기준. */
  maxPerWindow: number;
  maxPerDay: number;
  /** IP 총량 상한 — 행 기준. */
  ipMaxPerWindow: number;
  ipMaxPerDay: number;
  /**
   * true면 하루 한도를 행 수가 아니라 write_count 누적 합으로 센다(테이블에
   * write_count 컬럼 필요). upsert하는 테이블(설문)은 재제출이 행을 늘리지
   * 않아 행 수 판정으로는 "같은 문항 반복 제출"이 D1 쓰기를 무한정 소모한다 —
   * 쓰기 누적이 하루 캡에서 잡혀야 남용 통제가 성립한다. 60초 창은 순간
   * 폭주(새 행 burst) 방지가 목적이라 행 기준을 유지한다.
   */
  countWrites?: boolean;
  /** 429 본문에 그대로 담는 사람이 읽을 사유. FE가 이 문구를 그대로 보여준다. */
  messages: { window: string; day: string; ipWindow: string; ipDay: string };
}

/**
 * 두 층의 한도를 모두 검사한다. 넘었으면 RateLimited를 던진다(ADR 0006).
 *
 *   - 토큰 있음: 브라우저 버킷(token_hash) + IP 총량(client_hash)
 *   - 토큰 없음/형식 오류: IP 단독 버킷(client_hash) — 생략이 우회가 되지 않게
 *     한도는 브라우저 버킷과 같다.
 *
 * cost는 이 요청이 만들 행 수다 — 설문은 요청 1건이 문항 수만큼 행을 만들므로
 * "지금까지 쓴 행 + 이번 행"이 한도를 넘는지로 판정해야 배치 하나가 한도를
 * 통째로 뛰어넘지 못한다. 질문은 1이다.
 *
 * "하루"의 경계를 쿼리 자체에 둔다(KST 하루 시작) — 해시의 날짜 소금만 믿으면
 * 키 설계가 바뀔 때 COUNT가 조용히 전체 기간 카운트가 된다. 검사와 삽입 사이의
 * 동시성 창은 감수한다 — 초과분 한두 건이 새는 것은 남용 통제의 목적(무료 티어
 * 소진 방지)에 영향이 없다.
 */
export async function assertRateLimit(
  db: D1Database,
  keys: RateKeys,
  policy: RatePolicy,
  cost = 1,
): Promise<void> {
  const windowBind = `-${policy.windowSeconds} seconds`;
  const { table, messages } = policy;
  // 하루 한도의 단위: 행 1개(기본) 또는 그 행의 누적 쓰기 수(countWrites).
  const unit = policy.countWrites ? 'write_count' : '1';

  if (!keys.tokenHash) {
    const row = await db
      .prepare(
        `SELECT
           SUM(${unit}) AS day_count,
           SUM(created_at >= datetime('now', ?)) AS recent_count
         FROM ${table}
         WHERE client_hash = ? AND created_at >= ${KST_DAY_START_SQL}`,
      )
      .bind(windowBind, keys.ipHash)
      .first<{ day_count: number | null; recent_count: number | null }>();

    if ((row?.recent_count ?? 0) + cost > policy.maxPerWindow) {
      throw new RateLimited(messages.window);
    }
    if ((row?.day_count ?? 0) + cost > policy.maxPerDay) {
      throw new RateLimited(messages.day);
    }
    return;
  }

  const row = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN token_hash = ?1 THEN ${unit} ELSE 0 END) AS browser_day,
         SUM(token_hash = ?1 AND created_at >= datetime('now', ?3)) AS browser_recent,
         SUM(CASE WHEN client_hash = ?2 THEN ${unit} ELSE 0 END) AS ip_day,
         SUM(client_hash = ?2 AND created_at >= datetime('now', ?3)) AS ip_recent
       FROM ${table}
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

  if ((row?.browser_recent ?? 0) + cost > policy.maxPerWindow) {
    throw new RateLimited(messages.window);
  }
  if ((row?.browser_day ?? 0) + cost > policy.maxPerDay) {
    throw new RateLimited(messages.day);
  }
  if ((row?.ip_recent ?? 0) + cost > policy.ipMaxPerWindow) {
    throw new RateLimited(messages.ipWindow);
  }
  if ((row?.ip_day ?? 0) + cost > policy.ipMaxPerDay) {
    throw new RateLimited(messages.ipDay);
  }
}
