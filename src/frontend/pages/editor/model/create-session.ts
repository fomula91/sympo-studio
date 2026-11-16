import type { Session } from '@fe/entities/event';

// 가상 라이브러리를 순환하지 않고 편집 가능한 새 세션을 만든다.
// 시간은 같은 날 안에서 제안하며, 23:59를 넘으면 다음 날 00:00으로 되감지 않는다.
export function createAgendaSession(sessions: readonly Session[], idSeed: number): Session {
  const latest = sessions.reduce((minutes, session) => {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(session.time)) return minutes;
    const [hour, minute] = session.time.split(':').map(Number);
    return Math.max(minutes, hour * 60 + minute);
  }, -1);
  const next = latest < 0 ? 9 * 60 : Math.min(latest + 20, 23 * 60 + 59);
  const titles = new Set(sessions.map((session) => session.title));
  let number = sessions.length + 1;
  while (titles.has(`새 세션 ${number}`)) number++;
  return {
    id: Math.max(idSeed, ...sessions.map((session) => session.id + 1)),
    time: `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`,
    title: `새 세션 ${number}`,
    speaker: '',
    kind: 'LECTURE',
  };
}
