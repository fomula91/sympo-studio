'use client';

import { useState } from 'react';
import { SectionTitle } from "@fe/shared/ui/SectionTitle";
import { SESSION_LIB, SESSION_KINDS, SESSION_TITLE_MAX, SESSION_SPEAKER_MAX } from "@fe/entities/event";
import type { EventItem, PatchEventFn, Session } from "@fe/entities/event";
import type { PatchFn, StudioState } from "../model/state";
import { ghostBtn, MONO, UI } from "@fe/shared/config/ui";
import { savingMessage } from "@fe/entities/event";

export default function AgendaSection({
  s,
  ev,
  patch,
  patchEvent,
  isServerEvent,
}: {
  s: StudioState;
  ev: EventItem;
  patch: PatchFn;
  patchEvent: PatchEventFn;
  isServerEvent: boolean;
}) {
  const [moveAnnouncement, setMoveAnnouncement] = useState('');

  const startDrag = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    let cur = idx;
    patch({ dragIdx: idx });
    const move = (pe: PointerEvent) => {
      const el = document.elementFromPoint(pe.clientX, pe.clientY);
      const row = el?.closest?.('[data-idx]');
      if (!row) return;
      const to = parseInt(row.getAttribute('data-idx') ?? '', 10);
      if (isNaN(to) || to === cur) return;
      const from = cur;
      cur = to;
      patchEvent((curEv) => {
        const arr = curEv.sessions.slice();
        const [it] = arr.splice(from, 1);
        arr.splice(to, 0, it);
        return { sessions: arr };
      });
      patch({ dragIdx: to, saved: savingMessage(isServerEvent) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      patch({ dragIdx: -1, saved: savingMessage(isServerEvent) });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // 포인터 드래그의 키보드 대안 — 핸들에 포커스 후 위/아래 화살표로 한 칸씩 이동한다.
  const moveByKeyboard = (from: number, to: number) => {
    if (to < 0 || to >= ev.sessions.length || to === from) return;
    const moved = ev.sessions[from];
    patchEvent((curEv) => {
      const arr = curEv.sessions.slice();
      const [it] = arr.splice(from, 1);
      arr.splice(to, 0, it);
      return { sessions: arr };
    });
    patch({ saved: savingMessage(isServerEvent) });
    setMoveAnnouncement(`${moved.title}을(를) ${ev.sessions.length}개 중 ${to + 1}번째로 이동했습니다.`);
  };

  const updateSession = (idx: number, fields: Partial<Session>) => {
    patchEvent((curEv) => {
      const arr = curEv.sessions.slice();
      arr[idx] = { ...arr[idx], ...fields };
      return { sessions: arr };
    });
    patch({ saved: savingMessage(isServerEvent) });
  };

  const handleHandleKeyDown = (idx: number) => (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveByKeyboard(idx, idx - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveByKeyboard(idx, idx + 1);
    }
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <SectionTitle
        title="아젠다"
        description="이미지 슬라이드가 아니라 구조화된 세션 레코드입니다. 순서는 핸들을 끌어 바꾸거나, 핸들에 포커스한 뒤 위/아래 화살표로 바꿉니다."
        action={
          <button
            className="hv-bg965"
            onClick={() => {
              patchEvent((curEv) => {
                const pick = SESSION_LIB[curEv.sessions.length % SESSION_LIB.length];
                return { sessions: [...curEv.sessions, { id: Date.now(), ...pick }] };
              });
              patch({ saved: savingMessage(isServerEvent) });
            }}
            style={{ ...ghostBtn, fontWeight: 600 }}
          >
            라이브러리에서 가져오기
          </button>
        }
      />
      <div
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}
      >
        {moveAnnouncement}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ev.sessions.map((x, i) => (
          <div
            key={x.id}
            data-idx={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: UI.surface,
              borderRadius: 12,
              padding: '6px 8px 6px 0',
              userSelect: 'none',
              border: `1px solid ${s.dragIdx === i ? UI.ink : UI.line}`,
              boxShadow: s.dragIdx === i ? '0 10px 24px -12px oklch(0.4 0.02 250 / 0.4)' : undefined,
            }}
          >
            <button
              type="button"
              className="hv-ink"
              onPointerDown={startDrag(i)}
              onKeyDown={handleHandleKeyDown(i)}
              aria-label={`${x.title} 순서 변경 — 현재 ${ev.sessions.length}개 중 ${i + 1}번째. 화살표 위/아래로 이동`}
              style={{
                width: 44,
                height: 56,
                flex: '0 0 44px',
                display: 'grid',
                placeItems: 'center',
                cursor: 'grab',
                touchAction: 'none',
                color: 'oklch(0.7 0.006 250)',
                fontSize: 15,
                letterSpacing: 1,
                border: 'none',
                background: 'transparent',
                padding: 0,
              }}
            >
              ⠿
            </button>
            <input
              type="time"
              className="inp"
              aria-label="시작 시각"
              value={x.time}
              onChange={(e) => updateSession(i, { time: e.target.value })}
              style={{
                width: 92,
                flex: '0 0 92px',
                height: 32,
                borderRadius: 8,
                border: `1px solid ${UI.line}`,
                background: UI.surface,
                padding: '0 6px',
                fontFamily: MONO,
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: UI.ink,
                outline: 'none',
              }}
            />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <input
                type="text"
                className="inp"
                aria-label="세션 제목"
                value={x.title}
                maxLength={SESSION_TITLE_MAX}
                onChange={(e) => updateSession(i, { title: e.target.value })}
                style={{
                  width: '100%',
                  height: 28,
                  borderRadius: 8,
                  border: `1px solid ${UI.line}`,
                  background: UI.surface,
                  padding: '0 8px',
                  fontSize: 14,
                  fontWeight: 650,
                  letterSpacing: '-0.015em',
                  color: UI.ink,
                  outline: 'none',
                }}
              />
              <input
                type="text"
                className="inp"
                aria-label="연자"
                value={x.speaker}
                maxLength={SESSION_SPEAKER_MAX}
                onChange={(e) => updateSession(i, { speaker: e.target.value })}
                style={{
                  width: '100%',
                  height: 24,
                  borderRadius: 8,
                  border: `1px solid ${UI.line}`,
                  background: UI.surface,
                  padding: '0 8px',
                  fontSize: 12,
                  color: UI.muted,
                  outline: 'none',
                }}
              />
            </div>
            <select
              aria-label="세션 종류"
              value={x.kind}
              onChange={(e) => updateSession(i, { kind: e.target.value })}
              style={{
                width: 92,
                flex: '0 0 92px',
                height: 32,
                borderRadius: 8,
                border: `1px solid ${UI.line}`,
                background: UI.surface,
                padding: '0 4px',
                fontFamily: MONO,
                fontSize: 10,
                color: UI.faint,
                outline: 'none',
              }}
            >
              {SESSION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <button
              className="hv-x"
              onClick={() => {
                patchEvent((curEv) => ({ sessions: curEv.sessions.filter((_, j) => j !== i) }));
                patch({ saved: savingMessage(isServerEvent) });
              }}
              style={{
                width: 44,
                height: 44,
                flex: '0 0 44px',
                border: 'none',
                background: 'transparent',
                borderRadius: 10,
                color: UI.faint,
                fontSize: 15,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
