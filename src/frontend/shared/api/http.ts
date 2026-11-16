

// 범용 HTTP transport — 클라이언트 토큰, 타임아웃·외부 signal 병합, 에러 응답 파싱.
export class ApiClientError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = 'sympo-client-token';

// 응답 없이 매달리는 요청이 폴링을 영구히 멈추지 않도록 상한을 둔다(교차 리뷰 C2).
const FETCH_TIMEOUT_MS = 8000;

let memoryToken: string | null = null;

export function getClientToken(): string {
  if (memoryToken) return memoryToken;
  try {
    let token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem(TOKEN_KEY, token);
    }
    memoryToken = token;
    return token;
  } catch {
    // 프라이빗 모드 등 storage가 막힌 브라우저 — 매 요청 새 토큰이라 남용 통제는
    // IP 버킷으로 강등되지만(ADR 0006), 최소한 "전송 실패"로 끝나지 않는다.
    memoryToken = crypto.randomUUID();
    return memoryToken;
  }
}

export async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || `요청이 실패했습니다 (${res.status})`;
  } catch {
    return `요청이 실패했습니다 (${res.status})`;
  }
}

/**
 * 두 signal 중 하나라도 트리거되면 abort되는 signal을 돌려준다. `AbortSignal.any`가
 * 없는 런타임(Safari 17.4 미만 등)을 위한 수동 combinator — FE-33 과제 본문이
 * 명시한 대로, 없으면 `AbortSignal.any`가 `undefined`라 호출 자체가 TypeError로
 * 터진다(`/code-review` 발견 — 자원 낭비를 고치려다 더 나쁜 하드 실패를 만들 뻔했다).
 */
function anySignal(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([a, b]);
  const controller = new AbortController();
  if (a.aborted || b.aborted) {
    controller.abort();
    return controller.signal;
  }
  const onAbort = () => controller.abort();
  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}

/**
 * `init.signal`이 있으면 자기 타임아웃 signal과 합친다(FE-33) — 예전엔 내부
 * 컨트롤러로 항상 덮어써 호출자가 넘긴 signal이 무시됐다(`/code-review` 발견,
 * FE-32 리뷰 과정). `Microsite.openDocument`처럼 "이 요청은 더 이상 필요 없다"가
 * 확실해진 시점에 실제로 연결을 끊을 수 있게 한다 — 안 그러면 타임아웃(8초)이
 * 찰 때까지 버려진 요청이 대역폭을 계속 붙잡는다.
 */
export async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const signal = init?.signal ? anySignal(controller.signal, init.signal) : controller.signal;
  try {
    return await fetch(url, { ...init, signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      // 내부 타임아웃이 쏜 것만 "시간 초과"로 번역한다 — 호출자의 signal이 끊은
      // 것이면(의도적 취소) 원래 AbortError를 그대로 던져, 호출자가 자기 취소를
      // 스스로 알아볼 수 있게 한다.
      if (controller.signal.aborted) {
        throw new ApiClientError(0, '요청이 시간 초과됐습니다. 다시 시도해주세요.');
      }
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
