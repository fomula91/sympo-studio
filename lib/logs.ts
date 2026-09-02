import { BadRequest } from './db';
import type { RatePolicy } from './rate-limit';

// 이벤트 로그 적재·집계 (BE-5). 리포트(FE-5)가 샘플 대신 실측을 그리게 하는 원자료다.
//
// 참가자 화면이 자동으로 보내는 데이터라 사람이 누르는 Q&A·설문과 성격이 다르다:
// 한 사람이 한 행사에서 수십 건을 만든다. 그래서 두 가지를 다르게 뒀다.
//   1. 배치 전송 — 화면이 모아 보내 요청 수를 줄인다(D1 쓰기가 아니라 요청 수가
//      먼저 부담이 된다).
//   2. 한도를 Q&A보다 훨씬 넉넉히 — 정상 사용이 원래 많다. 대신 하루 총량으로
//      막는다.

/** 0001_init.sql의 event_logs.kind 주석과 같은 목록. */
export const LOG_KINDS = ['page_view', 'session_view', 'doc_view', 'survey_complete'];

export const MAX_LOGS_PER_REQUEST = 30;

export const LOG_RATE_POLICY: RatePolicy = {
  table: 'event_logs',
  timeColumn: 'created_at',
  windowSeconds: 60,
  // 행 기준. 한 참가자가 아젠다를 훑으며 세션 6개 + 자료 4개를 여는 것이
  // 1분 안에 일어날 수 있어 Q&A(3건)와는 자릿수가 다르다.
  maxPerWindow: 60,
  maxPerDay: 300,
  ipMaxPerWindow: 600,
  ipMaxPerDay: 6000,
  messages: {
    window: '기록이 잠시 몰렸습니다. 잠시 후 다시 시도해 주세요.',
    day: '오늘 기록할 수 있는 양을 모두 사용했습니다.',
    ipWindow: '현재 네트워크에서 기록이 몰렸습니다. 잠시 후 다시 시도해 주세요.',
    ipDay: '오늘 이 네트워크에서 기록할 수 있는 양을 모두 사용했습니다.',
  },
};

export interface LogInput {
  kind: string;
  sessionId: number | null;
  documentId: number | null;
}

function intOrNull(v: unknown, field: string): number | null {
  if (v === undefined || v === null) return null;
  if (!Number.isInteger(v) || (v as number) <= 0) {
    throw new BadRequest(`${field}는 양의 정수여야 합니다.`);
  }
  return v as number;
}

/** POST /api/events/[id]/logs 본문 → 정리된 로그 목록. */
export function validateLogsBody(raw: unknown): LogInput[] {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequest('요청 본문은 JSON 객체여야 합니다.');
  }
  const list = (raw as Record<string, unknown>).logs;
  if (!Array.isArray(list)) throw new BadRequest('logs는 배열이어야 합니다.');
  if (list.length === 0) throw new BadRequest('logs가 비어 있습니다.');
  if (list.length > MAX_LOGS_PER_REQUEST) {
    throw new BadRequest(`logs는 ${MAX_LOGS_PER_REQUEST}개 이하여야 합니다.`);
  }

  return list.map((entry, i) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new BadRequest(`logs[${i}]는 객체여야 합니다.`);
    }
    const o = entry as Record<string, unknown>;
    if (typeof o.kind !== 'string' || !LOG_KINDS.includes(o.kind)) {
      throw new BadRequest(`logs[${i}].kind는 ${LOG_KINDS.join('|')} 중 하나여야 합니다.`);
    }
    const sessionId = intOrNull(o.sessionId, `logs[${i}].sessionId`);
    const documentId = intOrNull(o.documentId, `logs[${i}].documentId`);
    // kind가 가리키는 대상이 없으면 집계에서 어디에도 안 잡히는 유령 행이 된다.
    if (o.kind === 'session_view' && sessionId === null) {
      throw new BadRequest(`logs[${i}]: session_view에는 sessionId가 필요합니다.`);
    }
    if (o.kind === 'doc_view' && documentId === null) {
      throw new BadRequest(`logs[${i}]: doc_view에는 documentId가 필요합니다.`);
    }
    return { kind: o.kind, sessionId, documentId };
  });
}
