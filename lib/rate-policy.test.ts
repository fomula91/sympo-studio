import { describe, expect, it } from 'vitest';
import { QUESTION_RATE_POLICY } from './qa';
import { SURVEY_RATE_POLICY } from './survey';
import { LOG_RATE_POLICY } from './logs';
import { EVENT_WRITE_RATE_POLICY } from './events';
import { UPLOAD_RATE_POLICY } from './r2';
import type { RatePolicy } from './rate-limit';

/**
 * 정책 수치는 **되돌리기 싼 파라미터**라 ADR 없이 바뀐다([[0006-rate-limit-key]] 보충).
 * 그래서 값 자체가 아니라 **값들 사이에 성립해야 하는 관계**를 고정한다 — 어느 하나를
 * 만지다 관계가 깨지면 증상이 조용하다.
 *
 * 2026-09-17에 Q&A 창 한도를 3→10으로 올리면서 이 관계들이 실제로 필요해졌다:
 * 창만 올리고 IP 창을 안 올리면 **한 사람이 행사장 창 한도의 절반을 먹는다.**
 */
const POLICIES: [string, RatePolicy][] = [
  ['questions', QUESTION_RATE_POLICY],
  ['survey', SURVEY_RATE_POLICY],
  ['logs', LOG_RATE_POLICY],
  ['events', EVENT_WRITE_RATE_POLICY],
  ['upload', UPLOAD_RATE_POLICY],
];

describe('rate 정책 정합성', () => {
  it.each(POLICIES)('%s — 창 한도가 하루 한도를 넘지 않는다 (넘으면 창이 의미 없다)', (_n, p) => {
    expect(p.maxPerWindow).toBeLessThanOrEqual(p.maxPerDay);
    expect(p.ipMaxPerWindow).toBeLessThanOrEqual(p.ipMaxPerDay);
  });

  it.each(POLICIES)('%s — IP 총량이 브라우저 버킷보다 좁지 않다', (_n, p) => {
    // 좁으면 브라우저가 자기 한도를 쓰기 전에 IP에서 먼저 막혀, 2층 구조가
    // 사실상 IP 단독으로 퇴화한다(0006이 기각한 상태).
    expect(p.ipMaxPerWindow).toBeGreaterThanOrEqual(p.maxPerWindow);
    expect(p.ipMaxPerDay).toBeGreaterThanOrEqual(p.maxPerDay);
  });

  it.each(POLICIES)('%s — 창 길이가 양수이고 하루보다 짧다', (_n, p) => {
    expect(p.windowSeconds).toBeGreaterThan(0);
    expect(p.windowSeconds).toBeLessThan(86400);
  });

  it('Q&A 창 한도를 올려도 하루 한도(노출의 천장)는 그대로다', () => {
    // 이 변경의 요점이다 — 마찰은 창에서 오고, 노출은 하루에서 온다.
    expect(QUESTION_RATE_POLICY.maxPerDay).toBe(30);
    expect(QUESTION_RATE_POLICY.ipMaxPerDay).toBe(300);
  });
});
