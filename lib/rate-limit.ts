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
export async function rateKeys(request: Request, now = Date.now()): Promise<RateKeys> {
  // cf-connecting-ip는 CF 엣지가 채운다. x-forwarded-for 폴백은 엣지 밖
  // (next dev·wrangler preview) 전용이다 — 클라이언트가 위조할 수 있으므로
  // 운영에서 판정 근거가 되면 안 된다. ??가 아니라 ||인 이유: 빈 문자열
  // 헤더는 nullish가 아니라서 ??로는 'unknown'에 떨어지지 않는다.
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown';
  const day = new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const token = request.headers.get('x-client-token');
  return {
    ipHash: await sha16(`${ip}|${day}`),
    tokenHash: token && TOKEN_PATTERN.test(token) ? await sha16(`${token}|${day}`) : null,
  };
}

/**
 * 로그인 사용자용 키 (BE-13 ⑦).
 *
 * 토큰 버킷 자리에 **브라우저 토큰 대신 user_id**를 넣는다 — 운영자 쓰기에서 막고
 * 싶은 것은 "이 브라우저"가 아니라 "이 계정"이고, 계정은 기기를 바꿔도 같다.
 * 날짜를 섞는 것은 다른 키와 같다(매일 로테이션, 원문 저장 안 함).
 *
 * IP 층은 그대로 둔다 — 계정을 여러 개 만들어 도는 경우를 잡는 것은 그쪽이다.
 */
export async function userRateKeys(
  request: Request,
  userId: number,
  now = Date.now(),
): Promise<RateKeys> {
  const { ipHash } = await rateKeys(request, now);
  const day = new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { ipHash, tokenHash: await sha16(`user|${userId}|${day}`) };
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
 * 한도의 단위는 보통 **쓰기 수**다(요청 하나가 만드는 행 수 = cost). 설문은 문항
 * 수만큼, 질문은 1이다.
 *
 * **`upload`만 단위가 MB다**(BE-29) — 지키려는 자원이 D1 행이 아니라 R2의
 * 저장량·Class A 연산이라, 요청 수로 세면 1MB와 20MB가 같은 비용이 된다.
 * 판정 구조는 그대로 쓰고 cost의 의미만 정책이 정한다(`uploadCostMb()`).
 */
export interface RatePolicy {
  scope: 'questions' | 'survey' | 'logs' | 'upload' | 'events';
  windowSeconds: number;
  /** 브라우저(또는 토큰 없는 IP) 버킷 한도 — 이 이벤트 안에서. */
  maxPerWindow: number;
  maxPerDay: number;
  /** IP 총량 상한 — 전역(이벤트를 가리지 않는다). */
  ipMaxPerWindow: number;
  ipMaxPerDay: number;
  /**
   * 토큰 버킷의 범위. 기본은 이벤트별(`'event'`)이다 — "사람의 제출 속도"라
   * 행사가 바뀌면 다시 세는 게 자연스럽다(BE-19).
   *
   * **업로드만 `'global'`이다**(Codex 교차 리뷰): 거기서 아끼는 자원은 이 행사의
   * D1 행이 아니라 **R2 전체**라, 이벤트별로 두면 이벤트를 갈아타는 것만으로 토큰
   * 한도가 초기화된다. 익명으로도 이벤트를 만들 수 있어 재현이 쉽고, 남는 방어선이
   * IP 상한뿐이라 실질 한도가 2배로 늘어난다.
   */
  tokenScope?: 'event' | 'global';
  /** 429 본문에 그대로 담는 사람이 읽을 사유. FE가 이 문구를 그대로 보여준다. */
  messages: { window: string; day: string; ipWindow: string; ipDay: string };
}

/** KST 기준 'YYYY-MM-DDTHH:MM'. 하루 경계도 여기서 잘라 쓴다. */
function kstStamp(now: number): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

/**
 * 카운터 버킷 이름. **`policy.windowSeconds`만큼 바닥으로 내림한 시각**이 창 이름이다.
 *
 * 예전에는 분 단위 스탬프를 그대로 썼고 `windowSeconds`는 카운터 TTL에만 쓰였다.
 * 정책이 전부 60초였던 동안은 우연히 일치했지만, **BE-29가 처음으로 300초를 쓰면서
 * 어긋났다** — 문구는 "5분에 200MB"인데 실제로는 1분마다 리셋돼 5배 느슨했다
 * (`/code-review` 발견). 창 길이가 정책의 값이 되도록 여기서 내림한다.
 *
 * 60초 정책은 내림 결과가 예전과 같은 분 경계라 **동작이 바뀌지 않는다.**
 *
 * 하루 경계가 KST인 것이 요점이다 — 시드 리셋 Cron(00:00 KST)과 같은 순간에
 * 카운터도 갈려야 한다. UTC면 두 경계가 9시간 어긋난다.
 */
function windowKeys(policy: RatePolicy, now: number) {
  const span = Math.max(1, policy.windowSeconds) * 1000;
  const floored = Math.floor((now + 9 * 60 * 60 * 1000) / span) * span - 9 * 60 * 60 * 1000;
  return { day: `d:${kstStamp(now).slice(0, 10)}`, window: `m:${kstStamp(floored)}` };
}

/**
 * 브라우저 버킷은 이벤트별, IP 총량은 전역이다(BE-19).
 *
 * 범위가 층마다 다른 이유: 브라우저 버킷은 "사람의 제출 속도"라 행사가 바뀌면
 * 다시 세는 게 자연스럽고, IP 총량은 위조 방어라 전역이어야 의미가 있다
 * (이벤트별이면 봇이 이벤트를 여러 개 만들어 한도를 곱한다).
 */
function scopes(policy: RatePolicy, eventId: number) {
  const token =
    policy.tokenScope === 'global' ? `${policy.scope}:all` : `${policy.scope}:e${eventId}`;
  return { token, ip: policy.scope };
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
  now = Date.now(),
): D1PreparedStatement {
  const w = windowKeys(policy, now);
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
 *
 * `now`를 받는 이유는 **요청 하나가 읽기·판정·증가에서 같은 창을 봐야** 하기
 * 때문이다(`/code-review` 발견). 각자 `Date.now()`를 부르면 그 사이에 창이 넘어갈
 * 수 있고, 그러면 판정이 **새 창의 카운터를 0으로 읽어 무조건 통과**시킨다.
 * 업로드처럼 본문 읽기가 오래 걸리는 라우트에서는 느린 전송만으로 재현된다
 * (하루 경계에서는 증가분이 아무도 안 읽는 행에 쌓여 그날 사용량이 사라진다).
 * 라우트가 요청 시작 시각을 고정해 넘긴다.
 */
export function evaluateRateLimit(
  rows: CounterRow[],
  keys: RateKeys,
  policy: RatePolicy,
  eventId: number,
  cost = 1,
  now = Date.now(),
): void {
  const w = windowKeys(policy, now);
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
  now = Date.now(),
): D1PreparedStatement[] {
  const w = windowKeys(policy, now);
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

/**
 * 예약(admission) — **판정과 증가를 한 문장으로 묶는다** (BE-31).
 *
 * `evaluateRateLimit` + `rateUsageStatements`는 **읽고 → 부작용을 일으키고 → 올리는**
 * 순서다. 동시에 들어온 요청이 전부 같은 카운터를 0으로 읽고 전부 통과하므로,
 * 초과량이 동시성만큼 생긴다(Codex 교차 리뷰가 16개 동시 업로드로 재현 경로 제시).
 * 업로드는 그 초과가 R2 연산·대역폭으로 새기 때문에 여기만 예약으로 바꾼다 —
 * **Q&A·설문·로그·이벤트 생성은 그대로 둔다**(그쪽이 지키는 것은 D1 행이고,
 * 이벤트당 총량처럼 커밋 시점에 평가되는 술어가 이미 천장 역할을 한다).
 *
 * ## 왜 버킷마다 한 문장이 아니라 통째로 한 문장인가
 *
 * 버킷(토큰 창·토큰 일·IP 창·IP 일)마다 조건부 upsert를 따로 보내면 **일부만 통과**한다.
 * 그러면 통과한 것을 되돌리는 보상 쓰기가 생기는데, 플러드에서 그게 요청마다 반복되면
 * **거절된 요청이 D1 쓰기를 태운다** — [[0008-rate-limit-counter]]가 "무효 요청이 쓰기
 * 티어를 태우면 Q&A·설문·로그가 전부 죽는다"며 명시적으로 기각한 바로 그 구조다.
 *
 * 그래서 게이트를 **SELECT의 WHERE 한 곳**에 모으고 버킷 행들을 그 SELECT가 만들게 한다.
 * 조건이 거짓이면 SELECT가 0행을 내놓아 **어떤 버킷도 오르지 않는다**(실측: `changes=0`,
 * 네 버킷 값 불변). 즉 거절 경로의 쓰기 비용이 0이라 0008의 성질이 유지된다.
 *
 * 게이트가 참이면 네 행이 한 문장 안에서 오른다(실측: `changes=4`, 각 버킷 정확히 cost).
 * SQLite가 **대상 테이블을 읽는 INSERT…SELECT를 먼저 물질화**하기 때문에, 첫 행이 오른
 * 값을 뒤 행의 조건이 되읽는 일(자기 관찰)이 없다 — 되읽었다면 `195+5<=200`이 참인 채
 * 첫 행만 오르고 나머지가 누락돼 `changes=1`이 됐을 것이다. 그 경계를 일부러 짚어 쟀다.
 *
 * **그래도 엔진 동작에 기대지 않는다**: `RETURNING`으로 **실제로 오른 버킷**을 받아,
 * 전부가 아니면 오른 것만 정확히 되돌리고 거절한다. 위 물질화가 언젠가 달라져도
 * 카운터가 어긋난 채로 남지 않는다.
 *
 * `cost`가 한도보다 큰 경우도 게이트가 그대로 잡는다 — 새 버킷이면 `0 + cost <= limit`이
 * 거짓이라 행이 아예 안 생긴다(버킷별 upsert 형태에서는 INSERT 분기에 조건을 걸 수 없어
 * 따로 막아야 했다).
 */
export interface RateReservation {
  /**
   * 예약한 몫을 되돌린다. **보호 대상 부작용이 실제로 일어나지 않았을 때만** 부른다.
   * 이미 R2에 넣은 뒤 뒤쪽에서 실패한 경우는 되돌리지 않는다 — `put`이 일어난 이상
   * Class A 연산은 이미 썼고, 그 비용을 청구하는 것이 이 정책이 지키려는 자원과 맞다.
   */
  release(): Promise<void>;
}

interface RateBucket {
  keyHash: string;
  scope: string;
  windowKey: string;
  limit: number;
  ttl: string;
}

/**
 * 예약이 걸 버킷들. 한도·범위·토큰 없을 때의 강등은 **`evaluateRateLimit`과 같아야 한다** —
 * 두 경로가 다른 판정을 하면 사전 판정은 통과했는데 예약에서 막히는(또는 그 반대) 일이 생긴다.
 */
function admissionBuckets(
  keys: RateKeys,
  policy: RatePolicy,
  eventId: number,
  now: number,
): RateBucket[] {
  const w = windowKeys(policy, now);
  const sc = scopes(policy, eventId);
  const dayTtl = '+2 days';
  const winTtl = `+${Math.max(policy.windowSeconds * 4, 300)} seconds`;

  // 토큰이 없으면 IP 단독 버킷 하나로 강등한다. 한도를 브라우저 버킷과 같게 두는 것도
  // 그대로다 — 토큰 생략이 우회가 되면 안 된다.
  if (!keys.tokenHash) {
    return [
      { keyHash: keys.ipHash, scope: sc.ip, windowKey: w.window, limit: policy.maxPerWindow, ttl: winTtl },
      { keyHash: keys.ipHash, scope: sc.ip, windowKey: w.day, limit: policy.maxPerDay, ttl: dayTtl },
    ];
  }
  return [
    { keyHash: keys.tokenHash, scope: sc.token, windowKey: w.window, limit: policy.maxPerWindow, ttl: winTtl },
    { keyHash: keys.tokenHash, scope: sc.token, windowKey: w.day, limit: policy.maxPerDay, ttl: dayTtl },
    { keyHash: keys.ipHash, scope: sc.ip, windowKey: w.window, limit: policy.ipMaxPerWindow, ttl: winTtl },
    { keyHash: keys.ipHash, scope: sc.ip, windowKey: w.day, limit: policy.ipMaxPerDay, ttl: dayTtl },
  ];
}

/** 예약한 몫을 버킷에서 뺀다. 음수로 내려가지 않게 바닥을 0으로 둔다. */
function releaseStatements(db: D1Database, buckets: RateBucket[], cost: number) {
  return buckets.map((b) =>
    db
      .prepare(
        `UPDATE rate_counters SET count = MAX(0, count - ?)
          WHERE key_hash = ? AND scope = ? AND window_key = ?`,
      )
      .bind(cost, b.keyHash, b.scope, b.windowKey),
  );
}

/**
 * 부작용을 일으키기 **전에** 한도를 예약한다. 한도를 넘으면 `RateLimited`를 던진다.
 *
 * 성공하면 카운터는 이미 올라가 있다 — 호출자는 뒤에 `rateUsageStatements`를 또
 * 부르면 안 된다(이중 계상).
 *
 * 거절 사유 문구는 **읽기 한 번을 더 써서** 정확히 고른다. 게이트는 어느 버킷이
 * 막았는지 알려주지 않는데, 사용자에게 "5분 한도"와 "오늘 한도"는 다른 안내다.
 * 읽기는 5백만/일이라 거절 경로에서만 한 번 더 쓰는 비용이 문제되지 않는다.
 */
export async function reserveRateLimit(
  db: D1Database,
  keys: RateKeys,
  policy: RatePolicy,
  eventId: number,
  cost = 1,
  now = Date.now(),
): Promise<RateReservation> {
  const buckets = admissionBuckets(keys, policy, eventId, now);

  const rows = buckets.map(() => `SELECT ? AS k, ? AS s, ? AS w, ? AS ttl`).join(' UNION ALL ');
  const gate = buckets
    .map(
      () =>
        `COALESCE((SELECT count FROM rate_counters c
                    WHERE c.key_hash = ? AND c.scope = ? AND c.window_key = ?), 0) + ? <= ?`,
    )
    .join(' AND ');

  const params: unknown[] = [cost];
  for (const b of buckets) params.push(b.keyHash, b.scope, b.windowKey, b.ttl);
  for (const b of buckets) params.push(b.keyHash, b.scope, b.windowKey, cost, b.limit);

  const res = await db
    .prepare(
      `INSERT INTO rate_counters (key_hash, scope, window_key, count, expires_at)
       SELECT b.k, b.s, b.w, ?, datetime('now', b.ttl) FROM (${rows}) b
        WHERE ${gate}
       ON CONFLICT(key_hash, scope, window_key) DO UPDATE SET count = count + excluded.count
       RETURNING key_hash, scope, window_key`,
    )
    .bind(...params)
    .all<{ key_hash: string; scope: string; window_key: string }>();

  const granted = res.results ?? [];
  if (granted.length === buckets.length) {
    return { release: async () => void (await db.batch(releaseStatements(db, buckets, cost))) };
  }

  // 게이트가 막았으면 0행이다. 0도 전부도 아니면 엔진이 우리가 잰 것과 다르게 동작한
  // 것이므로, **실제로 오른 것만** 되돌린 뒤 거절한다(카운터를 어긋난 채 두지 않는다).
  if (granted.length > 0) {
    const moved = buckets.filter((b) =>
      granted.some(
        (g) => g.key_hash === b.keyHash && g.scope === b.scope && g.window_key === b.windowKey,
      ),
    );
    await db.batch(releaseStatements(db, moved, cost));
  }

  const current = await rateCounterStatement(db, keys, policy, eventId, now).all();
  evaluateRateLimit(current.results as never, keys, policy, eventId, cost, now);
  // 여기 닿았다면 그 사이 창이 비었거나 다른 요청이 물러난 것이다 — 이 요청은 이미
  // 거절됐으므로 사유를 창 한도로 알린다(재시도하면 통과한다).
  throw new RateLimited(policy.messages.window);
}

/** 만료 카운터 정리. 자정 Cron이 부른다 — 방치하면 단조 증가한다. */
export async function purgeExpiredCounters(db: D1Database): Promise<number> {
  const res = await db
    .prepare("DELETE FROM rate_counters WHERE expires_at <= datetime('now')")
    .run();
  return res.meta.changes ?? 0;
}
