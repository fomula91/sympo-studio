'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Microsite } from '@fe/widgets/participant-site';
import { toPreviewDocuments } from '@fe/entities/event';
import { SECTIONS } from "../config/sections";
import { derive, ICONSETS } from "@fe/shared/lib/theme/palette";
import type { AuthUser } from "@fe/entities/account";
import type { Device, PatchFn, StudioState } from "../model/state";
import type { EventItem, PatchEventFn } from "@fe/entities/event";
import type { Preset } from "@fe/entities/theme";
import { MONO, monoLabel, UI } from "@fe/shared/config/ui";
import AgendaSection from "./AgendaSection";
import { BasicSection } from '@fe/features/edit-event-details';
import DocsSection from "./DocsSection";
import EngageSection from "./EngageSection";
import { ThemeSection } from '@fe/features/edit-theme';

const DEVICES: { k: Device; label: string }[] = [
  { k: 'mobile', label: '모바일' },
  { k: 'tablet', label: '태블릿' },
];

export default function EditorScreen({
  s,
  ev,
  presets,
  patch,
  patchEvent,
  isServerEvent,
  user,
  createPreset,
  isKnownPreset,
  addDocument,
  removeDocument,
}: {
  s: StudioState;
  ev: EventItem;
  presets: Preset[];
  patch: PatchFn;
  patchEvent: PatchEventFn;
  isServerEvent: boolean;
  user: AuthUser | null;
  createPreset: (input: { id: string; label: string; hue: number; chroma: number }) => Promise<Preset>;
  isKnownPreset: (presetId: string) => boolean;
  addDocument: (file: File) => Promise<void>;
  removeDocument: (docId: number) => Promise<void>;
}) {
  const preset = presets.find((p) => p.id === ev.presetId) || presets[0];
  const theme = derive(preset, ev.mode);
  const icons = ICONSETS[ev.iconSet].glyphs;
  const micrositeEvent = {
    title: ev.title,
    venue: ev.venue,
    date: ev.date,
    host: ev.host,
    cap: ev.cap,
    engage: ev.engage,
    brandLabel: ev.brand,
  };
  // 실제 이 이벤트의 자료로 미리보기를 그린다(FE-25) — 안 넘기면 Microsite가 대표
  // 예시 2건(DEMO_DOCUMENTS)을 보여줘서, 자료를 하나도 안 올린 새 이벤트도 미리보기엔
  // 늘 "자료 2건"이 떠 있었다. 스튜디오엔 서명 URL이 없어(그건 참가자 경로 전용이다)
  // url은 전부 null — 미리보기에서 파일을 실제로 열어보는 건 이번 범위 밖이다.
  const previewDocuments = toPreviewDocuments(ev.documents);

  const roRef = useRef<ResizeObserver | null>(null);
  const pvRef = useCallback(
    (el: HTMLDivElement | null) => {
      roRef.current?.disconnect();
      if (!el || typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(() => {
        const w = el.clientWidth;
        if (w) patch((st) => (w !== st.paneW ? { paneW: w } : null));
      });
      ro.observe(el);
      roRef.current = ro;
    },
    [patch],
  );
  useEffect(() => () => roRef.current?.disconnect(), []);

  const kvW = s.device === 'mobile' ? 390 : 834;
  const kvH = s.device === 'mobile' ? 780 : 620;
  const avail = Math.max(240, (s.paneW || 472) - 40);
  const scale = Math.min(1, avail / kvW);

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <div
        style={{
          width: 180,
          flex: '0 0 180px',
          borderRight: `1px solid ${UI.line}`,
          background: UI.surface,
          padding: '16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        <div style={{ ...monoLabel, color: UI.faint, padding: '6px 10px 10px' }}>SECTIONS</div>
        {SECTIONS.map((x) => {
          const meta =
            x.id === 'agenda'
              ? String(ev.sessions.length)
              : x.id === 'docs'
                ? String(ev.documents.length)
                : x.id === 'theme'
                  ? preset.label.split(' ')[0]
                  : x.meta;
          return (
            <button
              key={x.id}
              className="hv-bg962"
              onClick={() => patch({ section: x.id })}
              style={{
                width: '100%',
                height: 48,
                padding: '0 12px',
                borderRadius: 11,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 13.5,
                fontWeight: s.section === x.id ? 700 : 600,
                letterSpacing: '-0.015em',
                textAlign: 'left',
                background: 'transparent',
                color: s.section === x.id ? UI.ink : UI.muted,
              }}
            >
              <span>{x.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: s.section === x.id ? UI.brand : UI.faint }}>
                {meta}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ flex: '1 1 auto', minWidth: 440, overflow: 'auto', padding: '24px 28px 64px' }}>
        {s.section === 'agenda' ? (
          <AgendaSection s={s} ev={ev} patch={patch} patchEvent={patchEvent} isServerEvent={isServerEvent} />
        ) : null}
        {s.section === 'theme' ? (
          <ThemeSection
            s={s}
            ev={ev}
            presets={presets}
            patch={patch}
            patchEvent={patchEvent}
            isServerEvent={isServerEvent}
            user={user}
            createPreset={createPreset}
            isKnownPreset={isKnownPreset}
            showContrast
          />
        ) : null}
        {s.section === 'basic' ? (
          <BasicSection ev={ev} patch={patch} patchEvent={patchEvent} isServerEvent={isServerEvent} />
        ) : null}
        {s.section === 'docs' ? (
          <DocsSection
            ev={ev}
            isServerEvent={isServerEvent}
            addDocument={addDocument}
            removeDocument={removeDocument}
          />
        ) : null}
        {s.section === 'engage' ? (
          <EngageSection ev={ev} patch={patch} patchEvent={patchEvent} isServerEvent={isServerEvent} />
        ) : null}
      </div>

      <div
        style={{
          flex: '0 1 472px',
          minWidth: 300,
          borderLeft: `1px solid ${UI.line}`,
          background: UI.soft,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: 60,
            flex: '0 0 60px',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            gap: 10,
            borderBottom: `1px solid ${UI.line}`,
          }}
        >
          <div style={{ ...monoLabel, color: UI.muted }}>LIVE PREVIEW</div>
          <div style={{ flex: 1 }} />
          <div
            style={{
              display: 'flex',
              background: UI.surface,
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: 4,
              gap: 3,
            }}
          >
            {DEVICES.map((d) => (
              <button
                key={d.k}
                onClick={() => patch({ device: d.k })}
                style={{
                  height: 36,
                  padding: '0 13px',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 650,
                  background: s.device === d.k ? UI.brand : 'transparent',
                  color: s.device === d.k ? UI.surface : UI.muted,
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div
          ref={pvRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            justifyContent: 'center',
            padding: '20px 0',
          }}
        >
          <div
            style={{
              width: Math.round(kvW * scale),
              height: Math.round(kvH * scale),
              borderRadius: s.device === 'mobile' ? 28 : 16,
              overflow: 'hidden',
              background: UI.surface,
              boxShadow: '0 18px 44px -18px oklch(0.4 0.02 250 / 0.4)',
            }}
          >
            <div style={{ width: kvW, height: kvH, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
              <Microsite
                theme={theme}
                sessions={ev.sessions}
                icons={icons}
                event={micrositeEvent}
                documents={previewDocuments}
                // 스튜디오 미리보기는 실제 참가자 페이지가 아니다 — 편집 중인 목업 이벤트에는
                // D1에 대응하는 실제 id가 없다. preview로 Q&A 입력·폴링을 꺼서 실제 행사 데이터에
                // 쓰기가 일어나지 않게 한다(Codex 리뷰 2026-09-02 P1).
                preview
                kv={ev.keyVisual}
                kvPattern={ev.kvPattern}
                density={ev.density}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
