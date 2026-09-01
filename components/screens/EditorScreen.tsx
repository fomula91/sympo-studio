'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Microsite from '@/components/Microsite';
import { generateCertificate } from '@/lib/certificate';
import { extractPresetColor } from '@/lib/colorExtract';
import { autoSlug, DOCS, ENGAGE_DEFS, FIELD_DEFS, SECTIONS, SESSION_LIB } from '@/lib/data';
import { contrastAllPass, contrastRows, derive, ICONSETS } from '@/lib/theme';
import type {
  Density,
  Device,
  EventItem,
  IconSetId,
  KvPattern,
  Mode,
  PatchEventFn,
  PatchFn,
  Preset,
  StudioState,
} from '@/lib/types';
import { ghostBtn, MONO, monoLabel, primaryBtn, seg, UI } from '@/lib/ui';

function slugifyLabel(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'preset';
}

function uniquePresetId(label: string, existing: Preset[]): string {
  const base = slugifyLabel(label);
  if (!existing.some((p) => p.id === base)) return base;
  let n = 2;
  while (existing.some((p) => p.id === `${base}-${n}`)) n++;
  return `${base}-${n}`;
}

const MODES: { k: Mode; label: string }[] = [
  { k: 'light', label: '라이트' },
  { k: 'dark', label: '다크' },
];
const DENSITIES: Density[] = ['컴팩트', '기본', '여유'];
const DEVICES: { k: Device; label: string }[] = [
  { k: 'mobile', label: '모바일' },
  { k: 'tablet', label: '태블릿' },
];
const KV_CHOICES: { k: KvPattern; label: string }[] = [
  { k: 'stripe', label: '사선 패턴' },
  { k: 'grid', label: '그리드 패턴' },
  { k: 'flat', label: '단색' },
];

const sectionTitle = { margin: '0 0 6px', fontSize: 20, fontWeight: 700, letterSpacing: '-0.025em' } as const;
const sectionDesc = {
  margin: '0 0 24px',
  fontSize: 13,
  color: UI.muted,
  lineHeight: 1.6,
} as const;

function AgendaSection({
  s,
  ev,
  patch,
  patchEvent,
}: {
  s: StudioState;
  ev: EventItem;
  patch: PatchFn;
  patchEvent: PatchEventFn;
}) {
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
      patch({ dragIdx: to, saved: '변경 저장 중…' });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      patch({ dragIdx: -1, saved: '방금 저장됨' });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 6 }}>
        <h2 style={{ ...sectionTitle, margin: 0 }}>아젠다</h2>
        <div style={{ flex: 1 }} />
        <button
          className="hv-bg965"
          onClick={() => {
            patchEvent((curEv) => {
              const pick = SESSION_LIB[curEv.sessions.length % SESSION_LIB.length];
              return { sessions: [...curEv.sessions, { id: Date.now(), ...pick }] };
            });
            patch({ saved: '방금 저장됨' });
          }}
          style={{ ...ghostBtn, fontWeight: 600 }}
        >
          라이브러리에서 가져오기
        </button>
      </div>
      <p style={sectionDesc}>이미지 슬라이드가 아니라 구조화된 세션 레코드입니다. 순서는 핸들을 끌어 바꿉니다.</p>

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
            <div
              className="hv-ink"
              onPointerDown={startDrag(i)}
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
              }}
            >
              ⠿
            </div>
            <div
              style={{
                width: 74,
                flex: '0 0 74px',
                fontFamily: MONO,
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: '-0.02em',
              }}
            >
              {x.time}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 650,
                  letterSpacing: '-0.015em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {x.title}
              </div>
              <div style={{ fontSize: 12, color: UI.muted, marginTop: 3 }}>{x.speaker}</div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: UI.faint, paddingRight: 6 }}>
              {x.kind}
            </div>
            <button
              className="hv-x"
              onClick={() => {
                patchEvent((curEv) => ({ sessions: curEv.sessions.filter((_, j) => j !== i) }));
                patch({ saved: '방금 저장됨' });
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

function BasicSection({ ev, patch, patchEvent }: { ev: EventItem; patch: PatchFn; patchEvent: PatchEventFn }) {
  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={sectionTitle}>기본 정보</h2>
      <p style={sectionDesc}>
        한 문자열에 인코딩되어 있던 제목을 필드로 분해했습니다. 슬러그는 자동 생성되고 중복을 검사합니다.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {FIELD_DEFS.map((f) => (
          <label key={f.k} style={{ display: 'block' }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 650,
                color: UI.muted2,
                marginBottom: 7,
                letterSpacing: '-0.01em',
              }}
            >
              {f.label}
            </div>
            <input
              className="inp"
              value={ev[f.k]}
              onChange={(e) => {
                patchEvent({ [f.k]: e.target.value });
                patch({ saved: '변경 저장 중…' });
              }}
              style={{
                width: '100%',
                height: 52,
                borderRadius: 12,
                border: `1px solid ${UI.line}`,
                background: UI.surface,
                padding: '0 16px',
                fontSize: 14.5,
                color: UI.ink,
                outline: 'none',
              }}
            />
            <div style={{ fontSize: 11.5, color: UI.faint, marginTop: 6 }}>{f.hint}</div>
          </label>
        ))}
        <div style={{ border: `1px solid ${UI.line}`, borderRadius: 12, background: UI.surface, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 650, color: UI.muted2, marginBottom: 8 }}>
            생성될 URL
          </div>
          <div style={{ fontFamily: MONO, fontSize: 13, color: UI.ink2, wordBreak: 'break-all' }}>
            sympo.studio/{autoSlug(ev.title, ev.venue, ev.date)}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              marginTop: 10,
              fontSize: 12,
              color: 'oklch(0.45 0.09 145)',
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: 99, background: UI.green }} />
            중복 없음 · 회차마다 고유
          </div>
        </div>
      </div>
    </div>
  );
}

function DocsSection() {
  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={sectionTitle}>자료</h2>
      <p style={sectionDesc}>강의자료와 제품소개를 한 곳에서 다룹니다. 해시 파일명 대신 표시명을 관리합니다.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {DOCS.map((d) => (
          <div
            key={d.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              background: UI.surface,
              border: `1px solid ${UI.line}`,
              borderRadius: 12,
              padding: '12px 14px',
            }}
          >
            <div
              style={{
                width: 40,
                height: 44,
                flex: '0 0 40px',
                borderRadius: 8,
                background: UI.soft,
                display: 'grid',
                placeItems: 'center',
                fontFamily: MONO,
                fontSize: 9,
                fontWeight: 700,
                color: UI.muted2,
              }}
            >
              PDF
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 650,
                  letterSpacing: '-0.015em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {d.name}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, color: UI.faint, marginTop: 3 }}>
                {d.meta}
              </div>
            </div>
            <div
              style={{
                flex: '0 0 auto',
                padding: '5px 10px',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 650,
                background: UI.soft,
                color: UI.muted2,
              }}
            >
              {d.tag}
            </div>
          </div>
        ))}
        <div
          style={{
            height: 64,
            border: '1px dashed var(--hover-border)',
            borderRadius: 12,
            display: 'grid',
            placeItems: 'center',
            fontFamily: MONO,
            fontSize: 11,
            color: UI.faint,
            letterSpacing: '0.02em',
          }}
        >
          PDF 드롭 · 표시명 자동 추론
        </div>
      </div>
    </div>
  );
}

function EngageSection({ ev, patch, patchEvent }: { ev: EventItem; patch: PatchFn; patchEvent: PatchEventFn }) {
  const [generating, setGenerating] = useState(false);
  const [certError, setCertError] = useState<string | null>(null);

  async function handlePreviewCertificate() {
    setGenerating(true);
    setCertError(null);
    try {
      await generateCertificate({ eventTitle: ev.title, venue: ev.venue, date: ev.date });
    } catch {
      setCertError('수료증을 생성하지 못했습니다.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={sectionTitle}>참여</h2>
      <p style={sectionDesc}>Q&A와 설문을 외부 링크·QR 이미지 대신 페이지 안에서 완결시킵니다.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ENGAGE_DEFS.map((t) => {
          const on = ev.engage[t.k];
          return (
            <button
              key={t.k}
              className="hv-border80"
              onClick={() => {
                patchEvent((curEv) => ({ engage: { ...curEv.engage, [t.k]: !curEv.engage[t.k] } }));
                patch({ saved: '방금 저장됨' });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                background: UI.surface,
                border: `1px solid ${UI.line}`,
                borderRadius: 12,
                padding: '14px 16px',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: '-0.015em' }}>{t.label}</div>
                <div style={{ fontSize: 12, color: UI.muted, marginTop: 3 }}>{t.desc}</div>
              </div>
              <div
                style={{
                  width: 52,
                  height: 32,
                  flex: '0 0 52px',
                  borderRadius: 99,
                  padding: 3,
                  display: 'flex',
                  justifyContent: on ? 'flex-end' : 'flex-start',
                  background: on ? UI.brand : 'var(--line)',
                }}
              >
                <div style={{ width: 26, height: 26, borderRadius: 99, background: '#fff' }} />
              </div>
            </button>
          );
        })}
      </div>

      {ev.engage.cert ? (
        <div
          style={{
            marginTop: 20,
            padding: 16,
            border: `1px solid ${UI.line}`,
            borderRadius: 12,
            background: UI.surface,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 4 }}>수료증 미리보기</div>
          <p style={{ fontSize: 12, color: UI.muted, marginBottom: 12, lineHeight: 1.5 }}>
            참가자가 설문을 완료했을 때 받는 PDF와 같은 양식입니다. 참가자 화면은 아직 이 흐름에 연결되지
            않았습니다 — 여기서는 운영자가 결과물을 미리 볼 수 있게 직접 다운로드합니다.
          </p>
          <button
            className="hv-bg965"
            onClick={handlePreviewCertificate}
            disabled={generating}
            style={{ ...ghostBtn, opacity: generating ? 0.6 : 1, cursor: generating ? 'not-allowed' : 'pointer' }}
          >
            {generating ? '생성 중…' : '수료증 다운로드'}
          </button>
          {certError ? (
            <div role="alert" style={{ fontSize: 12, color: 'oklch(0.5 0.15 28)', marginTop: 8 }}>
              {certError}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ThemeSection({
  s,
  ev,
  presets,
  patch,
  patchEvent,
  showContrast,
}: {
  s: StudioState;
  ev: EventItem;
  presets: Preset[];
  patch: PatchFn;
  patchEvent: PatchEventFn;
  showContrast: boolean;
}) {
  const preset = presets.find((p) => p.id === ev.presetId) || presets[0];
  const theme = derive(preset, ev.mode);
  const cRows = contrastRows(theme, ev.mode);
  const allPass = contrastAllPass(preset, ev.mode);

  const [draft, setDraft] = useState<{ h: number; extractedC: number; c: number; label: string } | null>(null);
  const [extractError, setExtractError] = useState('');

  const handleFile = async (file: File) => {
    setExtractError('');
    try {
      const { h, c } = await extractPresetColor(file);
      setDraft({ h, extractedC: c, c, label: file.name.replace(/\.[^.]+$/, '') });
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : '색을 추출하지 못했습니다.');
    }
  };

  const draftPreset: Preset | null = draft ? { id: 'draft', label: draft.label, h: draft.h, c: draft.c } : null;
  const draftTheme = draftPreset ? derive(draftPreset, ev.mode) : null;
  const draftRows = draftPreset ? contrastRows(draftTheme!, ev.mode) : [];
  const draftPass = draftPreset
    ? contrastAllPass(draftPreset, 'light') && contrastAllPass(draftPreset, 'dark')
    : false;

  const saveDraft = () => {
    if (!draft || !draftPass) return;
    const id = uniquePresetId(draft.label, presets);
    const newPreset: Preset = { id, label: draft.label || '새 브랜드', h: draft.h, c: draft.c };
    patch({ customPresets: [...s.customPresets, newPreset] });
    patchEvent({ presetId: id });
    patch({ saved: '테마 반영됨' });
    setDraft(null);
  };

  return (
    <div style={{ maxWidth: 660 }}>
      <h2 style={sectionTitle}>테마 스튜디오</h2>
      <p style={sectionDesc}>
        기존 HEX 12개 입력을 프리셋 1회 선택으로 대체했습니다. 대비비가 기준 미달인 조합은 만들 수 없습니다.
      </p>

      <div style={{ ...monoLabel, marginBottom: 10 }}>01 · 브랜드 프리셋</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 10,
          marginBottom: 28,
        }}
      >
        {presets.map((p) => {
          const t = derive(p, ev.mode);
          const on = ev.presetId === p.id;
          const sw = { width: 14, height: 28, borderRadius: 4 } as const;
          return (
            <button
              key={p.id}
              className="hv-border78"
              onClick={() => {
                patchEvent({ presetId: p.id });
                patch({ saved: '테마 반영됨' });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                height: 60,
                padding: '0 14px',
                borderRadius: 13,
                cursor: 'pointer',
                background: UI.surface,
                border: `1px solid ${on ? UI.brand : UI.line}`,
                boxShadow: on ? '0 0 0 3px oklch(0.475 0.11 205 / 0.09)' : undefined,
              }}
            >
              <div style={{ display: 'flex', gap: 5 }}>
                <div style={{ ...sw, background: t.brand }} />
                <div style={{ ...sw, background: t.soft }} />
                <div style={{ ...sw, background: t.ink }} />
              </div>
              <div style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: 650, letterSpacing: '-0.015em' }}>
                {p.label}
              </div>
              <div style={{ fontSize: 13, color: UI.muted }}>{on ? '✓' : ''}</div>
            </button>
          );
        })}
        <label
          className="hv-border78"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            height: 60,
            borderRadius: 13,
            cursor: 'pointer',
            border: '1.5px dashed var(--hover-border)',
            background: UI.surface,
            fontSize: 12.5,
            fontWeight: 650,
            color: UI.muted2,
          }}
        >
          + 이미지에서 추출
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) handleFile(f);
            }}
          />
        </label>
      </div>

      {extractError ? (
        <div style={{ fontSize: 12, color: 'oklch(0.5 0.15 28)', marginBottom: 20 }}>{extractError}</div>
      ) : null}

      {draft && draftTheme ? (
        <div
          style={{
            border: `1px solid ${UI.line}`,
            borderRadius: 14,
            background: UI.surface,
            padding: 16,
            marginBottom: 28,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              <div style={{ width: 14, height: 28, borderRadius: 4, background: draftTheme.brand }} />
              <div style={{ width: 14, height: 28, borderRadius: 4, background: draftTheme.soft }} />
              <div style={{ width: 14, height: 28, borderRadius: 4, background: draftTheme.ink }} />
            </div>
            <input
              className="inp"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="프리셋 이름"
              style={{
                flex: 1,
                height: 40,
                borderRadius: 8,
                border: `1px solid ${UI.line}`,
                padding: '0 12px',
                fontSize: 13,
                color: UI.ink,
                background: UI.surface,
              }}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: UI.muted, marginBottom: 6 }}>채도 {draft.c.toFixed(3)}</div>
            <input
              type="range"
              min={0}
              max={draft.extractedC}
              step={0.005}
              value={draft.c}
              onChange={(e) => setDraft({ ...draft, c: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {draftRows.map((r) => (
              <div
                key={r.label}
                style={{
                  fontSize: 10.5,
                  fontFamily: MONO,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: r.pass ? 'oklch(0.955 0.03 145)' : 'oklch(0.955 0.04 28)',
                  color: r.pass ? 'oklch(0.42 0.1 145)' : 'oklch(0.5 0.15 28)',
                }}
              >
                {r.label.split(' ')[0]} {r.ratio}
              </div>
            ))}
          </div>
          {!draftPass ? (
            <div style={{ fontSize: 12, color: 'oklch(0.5 0.15 28)', marginBottom: 14 }}>
              {draftRows.every((r) => r.pass)
                ? `대비비 미달 — ${ev.mode === 'light' ? '다크' : '라이트'} 모드로 전환하면 기준 미달이라 저장할 수 없습니다.`
                : '대비비 미달 — 채도를 낮추면 통과할 수 있습니다.'}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={saveDraft}
              disabled={!draftPass}
              style={{ ...primaryBtn, opacity: draftPass ? 1 : 0.4, cursor: draftPass ? 'pointer' : 'not-allowed' }}
            >
              프리셋으로 저장
            </button>
            <button onClick={() => setDraft(null)} style={ghostBtn}>
              취소
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 28 }}>
        <div>
          <div style={{ ...monoLabel, marginBottom: 10 }}>02 · 표면</div>
          <div
            style={{
              display: 'flex',
              background: UI.surface,
              border: `1px solid ${UI.line}`,
              borderRadius: 12,
              padding: 5,
              gap: 4,
            }}
          >
            {MODES.map((m) => (
              <button
                key={m.k}
                onClick={() => {
                  patchEvent({ mode: m.k });
                  patch({ saved: '테마 반영됨' });
                }}
                style={seg(ev.mode === m.k)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ ...monoLabel, marginBottom: 10 }}>03 · 아이콘 세트</div>
          <div
            style={{
              display: 'flex',
              background: UI.surface,
              border: `1px solid ${UI.line}`,
              borderRadius: 12,
              padding: 5,
              gap: 4,
            }}
          >
            {(Object.keys(ICONSETS) as IconSetId[]).map((k) => (
              <button
                key={k}
                onClick={() => {
                  patchEvent({ iconSet: k });
                  patch({ saved: '테마 반영됨' });
                }}
                style={seg(ev.iconSet === k)}
              >
                {ICONSETS[k].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ ...monoLabel, marginBottom: 10 }}>04 · 밀도</div>
          <div
            style={{
              display: 'flex',
              background: UI.surface,
              border: `1px solid ${UI.line}`,
              borderRadius: 12,
              padding: 5,
              gap: 4,
            }}
          >
            {DENSITIES.map((d) => (
              <button
                key={d}
                onClick={() => {
                  patchEvent({ density: d });
                  patch({ saved: '테마 반영됨' });
                }}
                style={seg(ev.density === d)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ ...monoLabel, marginBottom: 10 }}>05 · 키 비주얼</div>
      <div
        onDrop={(e) => {
          e.preventDefault();
          patch({ dragOver: false });
          const f = e.dataTransfer?.files?.[0];
          if (f && f.type.startsWith('image')) {
            patchEvent({ keyVisual: URL.createObjectURL(f) });
            patch({ saved: '키 비주얼 교체됨' });
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!s.dragOver) patch({ dragOver: true });
        }}
        onDragLeave={() => patch({ dragOver: false })}
        style={{
          height: 150,
          borderRadius: 14,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
          background: s.dragOver ? UI.soft : UI.surface,
          border: `1.5px dashed ${s.dragOver ? UI.ink2 : 'var(--hover-border)'}`,
        }}
      >
        {ev.keyVisual ? (
          <div
            role="img"
            aria-label="키 비주얼"
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 13,
              background: `url("${ev.keyVisual}") center/cover no-repeat`,
            }}
          />
        ) : (
          <div
            style={{
              textAlign: 'center',
              fontFamily: MONO,
              fontSize: 11,
              color: UI.faint,
              lineHeight: 1.9,
              letterSpacing: '0.02em',
            }}
          >
            key visual · 1600 × 640
            <br />
            이미지를 이 영역에 드롭
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {KV_CHOICES.map((p) => (
          <button
            key={p.k}
            onClick={() => {
              patchEvent({ kvPattern: p.k, keyVisual: '' });
              patch({ saved: '키 비주얼 교체됨' });
            }}
            style={{
              height: 44,
              padding: '0 14px',
              borderRadius: 10,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 650,
              background: UI.surface,
              border: `1px solid ${ev.kvPattern === p.k && !ev.keyVisual ? UI.ink : 'var(--line)'}`,
              color: UI.ink2,
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          className="hv-bg965"
          onClick={() => {
            patchEvent({ keyVisual: '', kvPattern: 'none' });
            patch({ saved: '키 비주얼 비워짐' });
          }}
          style={{
            height: 44,
            padding: '0 14px',
            borderRadius: 10,
            border: '1px solid var(--line)',
            background: UI.surface,
            fontSize: 12,
            fontWeight: 600,
            color: UI.muted,
            cursor: 'pointer',
          }}
        >
          비우기
        </button>
      </div>

      {showContrast ? (
        <div
          style={{
            marginTop: 28,
            border: `1px solid ${UI.line}`,
            borderRadius: 14,
            background: UI.surface,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 16px',
              borderBottom: `1px solid ${UI.lineFaint}`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.015em' }}>대비비 검증</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: UI.faint, letterSpacing: '0.06em' }}>
              WCAG AA · 저장 게이트
            </div>
            <div style={{ flex: 1 }} />
            <div
              style={{
                padding: '5px 11px',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 700,
                background: allPass ? 'oklch(0.955 0.03 145)' : 'oklch(0.955 0.04 28)',
                color: allPass ? 'oklch(0.4 0.1 145)' : 'oklch(0.5 0.15 28)',
              }}
            >
              {allPass ? '저장 허용' : '저장 차단'}
            </div>
          </div>
          {cRows.map((r) => (
            <div
              key={r.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 16px',
                borderBottom: '1px solid var(--line-faint)',
              }}
            >
              <div style={{ flex: 1, fontSize: 12.5, color: UI.muted2 }}>{r.label}</div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  fontVariantNumeric: 'tabular-nums',
                  color: UI.ink2,
                }}
              >
                {r.ratio}
              </div>
              <div
                style={{
                  width: 46,
                  textAlign: 'center',
                  padding: '4px 0',
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: MONO,
                  background: r.pass ? 'oklch(0.955 0.03 145)' : 'oklch(0.955 0.04 28)',
                  color: r.pass ? 'oklch(0.42 0.1 145)' : 'oklch(0.5 0.15 28)',
                }}
              >
                {r.pass ? 'AA' : '미달'}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function EditorScreen({
  s,
  ev,
  presets,
  patch,
  patchEvent,
}: {
  s: StudioState;
  ev: EventItem;
  presets: Preset[];
  patch: PatchFn;
  patchEvent: PatchEventFn;
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
    brandLabel: preset.label,
  };

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
            x.id === 'agenda' ? String(ev.sessions.length) : x.id === 'theme' ? preset.label.split(' ')[0] : x.meta;
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
        {s.section === 'agenda' ? <AgendaSection s={s} ev={ev} patch={patch} patchEvent={patchEvent} /> : null}
        {s.section === 'theme' ? (
          <ThemeSection s={s} ev={ev} presets={presets} patch={patch} patchEvent={patchEvent} showContrast />
        ) : null}
        {s.section === 'basic' ? <BasicSection ev={ev} patch={patch} patchEvent={patchEvent} /> : null}
        {s.section === 'docs' ? <DocsSection /> : null}
        {s.section === 'engage' ? <EngageSection ev={ev} patch={patch} patchEvent={patchEvent} /> : null}
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
                // 스튜디오 미리보기는 실제 참가자 페이지가 아니다 — 편집 중인 목업 이벤트에는
                // D1에 대응하는 실제 id가 없어 Q&A는 데모 이벤트(id=1) 기준으로 보여준다.
                eventId={1}
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
