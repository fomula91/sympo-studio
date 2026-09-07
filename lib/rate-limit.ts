import { ApiError } from './db';

// rate limit — 판정은 `rate_counters`의 (키, 창) 카운터로 한다(BE-21, ADR 0008).
//
// 원래는 대상 테이블의 당일 행을 셌다(BE-3~8). 그 방식이 **정상 운영에서**
// 비싸졌다 — 행사장 단일 IP가 상한에 닿으면 이후 모든 요청이 그 행들을 전부
// 훑는다(429로 거절되는 요청까지). 카운터는 PK 하나로 잡혀 대상 테이블 크기와
// 무관하다. KV/DO가 아니라 D1 테이블인 이유는 바인딩·과금 축을 늘리지 않기
// 위해서다(ADR 0006이 기각한 것은 저장소 추가였지 카운터 자체가 아니었다).
//
// **증가는 성공한 쓰기에만 한다** — 요청마다 세면 D1 쓰기 한도가 Workers 요청
// 한도와 1:1로 붙어, 플러드가 읽기 대신 쓰기 티어를 태운다. 쓰기가 마르면
// Q&A·설문·로그가 전부 죽는다.
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
 * 라우트별 rate limit 정책.
 *
 * `scope`는 카운터의 이름공간이다 — 정책이 서로의 한도를 갉지 않게 가른다.
 * 한도의 단위는 **쓰기 수**다(요청 하나가 만드는 행 수 = cost). 설문은 문항
 * 수만큼, 질문은 1이다.
 */
export interface RatePolicy {
  scope: 'questions' | 'survey' | 'logs';
  windowSeconds: number;
  /** 브라우저(또는 토큰 없는 IP) 버킷 한도 — 이 이벤트 안에서. */
  maxPerWindow: number;
  maxPerDay: number;
  /** IP 총량 상한 — 전역(이벤트를 가리지 않는다). */
  ipMaxPerWindow: number;
  ipMaxPerDay: number;
  /** 429 본문에 그대로 담는 사람이 읽을 사유. FE가 이 문구를 그대로 보여준다. */
  messages: { window: string; day: string; ipWindow: string; ipDay: string };
}

/** KST 기준 'YYYY-MM-DDTHH:MM'. 하루 경계도 여기서 잘라 쓴다. */
function kstStamp(now = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function windowKeys(now = Date.now()) {
  const stamp = kstStamp(now);
  // 하루 경계가 KST인 것이 요점이다 — 시드 리셋 Cron(00:00 KST)과 같은 순간에
  // 카운터도 갈려야 한다. UTC면 두 경계가 9시간 어긋난다.
  return { day: `d:${stamp.slice(0, 10)}`, window: `m:${stamp}` };
}

/**
 * 브라우저 버킷은 이벤트별, IP 총량은 전역이다(BE-19).
 *
 * 범위가 층마다 다른 이유: 브라우저 버킷은 "사람의 제출 속도"라 행사가 바뀌면
 * 다시 세는 게 자연스럽고, IP 총량은 위조 방어라 전역이어야 의미가 있다
 * (이벤트별이면 봇이 이벤트를 여러 개 만들어 한도를 곱한다).
 */
function scopes(policy: RatePolicy, eventId: number) {
  return { token: `${policy.scope}:e${eventId}`, ip: policy.scope };
}

interface CounterRow {
  key_hash: string;
  scope: string;
  window_key: string;
  count: number;
}

/**
 * 판정에 필요한 카운터를 한 번에 읽는 statement. 라우트가 이벤트 조회와 같은
 * batch에 실어 **요청당 D1 왕복 1회**로 묶는다.
 *
 * 최대 4행이다(토큰 버킷 하루·창 + IP 하루·창). 대상 테이블이 아무리 커도
 * 이 수는 변하지 않는다 — 그것이 이 구조를 도입한 이유다.
 */
export function rateCounterStatement(
  db: D1Database,
  keys: RateKeys,
  policy: RatePolicy,
  eventId: number,
): D1PreparedStatement {
  const w = windowKeys();
  const sc = scopes(policy, eventId);
  // 토큰이 없으면 IP 단독 버킷 하나뿐이라 그 scope만 본다.
  return db
    .prepare(
      `SELECT key_hash, scope, window_key, count FROM rate_counters
        WHERE key_hash IN (?1, ?2) AND scope IN (?3, ?4) AND window_key IN (?5, ?6)`,
    )
    .bind(keys.tokenHash ?? '', keys.ipHash, sc.token, sc.ip, w.day, w.window);
}

function pick(rows: CounterRow[], keyHash: string | null, scope: string, windowKey: string): number {
  if (!keyHash) return 0;
  const hit = rows.find(
    (r) => r.key_hash === keyHash && r.scope === scope && r.window_key === windowKey,
  );
  return hit?.count ?? 0;
}

/**
 * 카운터를 정책과 대조해 초과면 RateLimited를 던진다.
 *
 * cost는 이 요청이 만들 쓰기 수다 — 배치 하나가 한도를 통째로 뛰어넘지 못하게
 * "지금까지 + 이번"으로 판정한다.
 *
 * 토큰이 없으면 IP 단독 버킷 하나로 강등한다. 한도는 브라우저 버킷과 같게 둬
 * **토큰 생략이 우회가 되지 않게** 하고, 범위도 전역이다(이벤트별로 좁히면
 * 토큰을 빼는 것만으로 한도가 이벤트 수만큼 곱해진다).
 */
export function evaluateRateLimit(
  rows: CounterRow[],
  keys: RateKeys,
  policy: RatePolicy,
  eventId: number,
  cost = 1,
): void {
  const w = windowKeys();
  const sc = scopes(policy, eventId);
  const { messages } = policy;

  if (!keys.tokenHash) {
    if (pick(rows, keys.ipHash, sc.ip, w.window) + cost > policy.maxPerWindow) {
      throw new RateLimited(messages.window);
    }
    if (pick(rows, keys.ipHash, sc.ip, w.day) + cost > policy.maxPerDay) {
      throw new RateLimited(messages.day);
    }
    return;
  }

  if (pick(rows, keys.tokenHash, sc.token, w.window) + cost > policy.maxPerWindow) {
    throw new RateLimited(messages.window);
  }
  if (pick(rows, keys.tokenHash, sc.token, w.day) + cost > policy.maxPerDay) {
    throw new RateLimited(messages.day);
  }
  if (pick(rows, keys.ipHash, sc.ip, w.window) + cost > policy.ipMaxPerWindow) {
    throw new RateLimited(messages.ipWindow);
  }
  if (pick(rows, keys.ipHash, sc.ip, w.day) + cost > policy.ipMaxPerDay) {
    throw new RateLimited(messages.ipDay);
  }
}

/**
 * 카운터를 올리는 statement들. **쓰기가 실제로 성공한 뒤에** 같은 batch에 실어
 * 보낸다 — 요청마다 올리면 무효 요청이 쓰기 티어를 태운다(ADR 0008).
 *
 * 만료는 창 길이보다 넉넉히 잡는다. 하루 카운터는 KST 하루가 끝난 뒤,
 * 분 카운터는 창이 지난 뒤 정리 대상이 된다.
 */
export function rateUsageStatements(
  db: D1Database,
  keys: RateKeys,
  policy: RatePolicy,
  eventId: number,
  cost = 1,
): D1PreparedStatement[] {
  const w = windowKeys();
  const sc = scopes(policy, eventId);
  const bump = (keyHash: string, scope: string, windowKey: string, ttl: string) =>
    db
      .prepare(
        `INSERT INTO rate_counters (key_hash, scope, window_key, count, expires_at)
         VALUES (?, ?, ?, ?, datetime('now', ?))
         ON CONFLICT(key_hash, scope, window_key) DO UPDATE SET count = count + excluded.count`,
      )
      .bind(keyHash, scope, windowKey, cost, ttl);

  const dayTtl = '+2 days';
  const winTtl = `+${Math.max(policy.windowSeconds * 4, 300)} seconds`;

  const out = [bump(keys.ipHash, sc.ip, w.day, dayTtl), bump(keys.ipHash, sc.ip, w.window, winTtl)];
  if (keys.tokenHash) {
    out.push(bump(keys.tokenHash, sc.token, w.day, dayTtl));
    out.push(bump(keys.tokenHash, sc.token, w.window, winTtl));
  }
  return out;
}

/** 만료 카운터 정리. 자정 Cron이 부른다 — 방치하면 단조 증가한다. */
export async function purgeExpiredCounters(db: D1Database): Promise<number> {
  const res = await db
    .prepare("DELETE FROM rate_counters WHERE expires_at <= datetime('now')")
    .run();
  return res.meta.changes ?? 0;
}
