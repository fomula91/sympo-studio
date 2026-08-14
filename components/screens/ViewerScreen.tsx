'use client';

import Microsite from '@/components/Microsite';
import { derive, ICONSETS, PRESETS } from '@/lib/theme';
import type { StudioState } from '@/lib/types';
import { monoLabel, UI } from '@/lib/ui';

export default function ViewerScreen({ s }: { s: StudioState }) {
  const preset = PRESETS.find((p) => p.id === s.presetId) || PRESETS[0];
  const theme = derive(preset, s.mode);
  const icons = ICONSETS[s.iconSet].glyphs;
  const ev = {
    title: s.title,
    venue: s.venue,
    date: s.date,
    host: s.host,
    cap: s.cap,
    engage: s.engage,
    brandLabel: preset.label,
  };
  const micrositeProps = {
    theme,
    sessions: s.sessions,
    icons,
    event: ev,
    kv: s.keyVisual,
    kvPattern: s.kvPattern,
    density: s.density,
  };

  return (
    <div
      style={{
        padding: 28,
        display: 'flex',
        gap: 28,
        justifyContent: 'center',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ width: 414, flex: '0 0 414px' }}>
        <div style={{ ...monoLabel, color: 'oklch(0.6 0.006 250)', marginBottom: 10 }}>MOBILE · 390</div>
        <div
          style={{
            width: 414,
            height: 844,
            borderRadius: 44,
            background: UI.ink,
            padding: 12,
            boxShadow: '0 24px 60px -20px oklch(0.4 0.02 250 / 0.35)',
          }}
        >
          <div style={{ width: 390, height: 820, borderRadius: 33, overflow: 'hidden', background: '#fff' }}>
            <Microsite {...micrositeProps} />
          </div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 520, maxWidth: 820 }}>
        <div style={{ ...monoLabel, color: 'oklch(0.6 0.006 250)', marginBottom: 10 }}>TABLET · 834</div>
        <div
          style={{
            borderRadius: 28,
            background: UI.ink,
            padding: 14,
            boxShadow: '0 24px 60px -20px oklch(0.4 0.02 250 / 0.35)',
          }}
        >
          <div style={{ height: 640, borderRadius: 18, overflow: 'hidden', background: '#fff' }}>
            <Microsite {...micrositeProps} wide />
          </div>
        </div>
        <div style={{ marginTop: 14, fontSize: 12.5, color: UI.muted, lineHeight: 1.7 }}>
          에디터 프리뷰와 참가자 뷰는 같은 컴포넌트입니다. 테마 스튜디오에서 바꾼 값이 두 화면에 동시에 반영됩니다.
        </div>
      </div>
    </div>
  );
}
