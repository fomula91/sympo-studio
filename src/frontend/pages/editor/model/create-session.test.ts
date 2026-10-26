import { describe, expect, it } from 'vitest';
import type { Session } from '@fe/entities/event';
import { createAgendaSession } from './create-session';

const existing = (id: number, time: string, title = `기존 세션 ${id}`): Session => ({ id, time, title, speaker: '기존 연자', kind: 'CASE' });

describe('아젠다 세션 추가', () => {
  it('6번 연속 추가해도 제목·id가 겹치지 않고 시간이 역행하지 않는다', () => {
    const sessions: Session[] = [existing(1, '19:10')];
    for (let i = 0; i < 6; i++) {
      const added = createAgendaSession(sessions, 1000);
      expect(added.time >= sessions[sessions.length - 1].time).toBe(true);
      expect(added.speaker).toBe('');
      sessions.push(added);
    }
    expect(new Set(sessions.map((s) => s.title)).size).toBe(7);
    expect(new Set(sessions.map((s) => s.id)).size).toBe(7);
    expect(sessions.slice(1).map((s) => s.time)).toEqual(['19:30', '19:50', '20:10', '20:30', '20:50', '21:10']);
  });

  it('비어 있는 아젠다에는 편집 가능한 첫 세션을 만든다', () => {
    expect(createAgendaSession([], 1000)).toEqual({ id: 1000, time: '09:00', title: '새 세션 1', speaker: '', kind: 'LECTURE' });
  });

  it('순서 변경된 아젠다에서도 가장 늦은 시각 뒤로 제안하고 원본은 바꾸지 않는다', () => {
    const sessions = [existing(1, '22:10'), existing(2, '18:00')];
    expect(createAgendaSession(sessions, 1000).time).toBe('22:30');
    expect(sessions).toEqual([existing(1, '22:10'), existing(2, '18:00')]);
  });

  it('자정 경계에서 시간이 00:00으로 역행하지 않는다', () => {
    const sessions = [existing(1, '23:50')];
    const last = createAgendaSession(sessions, 1000);
    expect(last.time).toBe('23:59');
    expect(createAgendaSession([...sessions, last], 1000).time).toBe('23:59');
  });

  it('제목을 수정하거나 세션을 삭제한 뒤에도 기존 제목을 중복 생성하지 않는다', () => {
    expect(createAgendaSession([existing(1, '17:00', '새 세션 2')], 1000).title).toBe('새 세션 3');
  });

  it('미입력·잘못된 시간은 계산에서 제외한다', () => {
    expect(createAgendaSession([existing(1, ''), existing(2, '25:10'), existing(3, '18:40')], 1000).time).toBe('19:00');
    expect(createAgendaSession([existing(1, '')], 1000).time).toBe('09:00');
  });
});
