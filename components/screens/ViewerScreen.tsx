'use client';

import Microsite from '@/components/Microsite';
import { derive, ICONSETS } from '@/lib/theme';
import type { EventItem, Preset } from '@/lib/types';
import { monoLabel, UI } from '@/lib/ui';

export default function ViewerScreen({ ev, presets }: { ev: EventItem; presets: Preset[] }) {
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
  const micrositeProps = {
    theme,
    sessions: ev.sessions,
    icons,
    event: micrositeEvent,
    // 스튜디오 미리보기는 실제 참가자 페이지가 아니다 — 편집 중인 목업 이벤트에는
    // D1에 대응하는 실제 id가 없어 Q&A는 데모 이벤트(id=1) 기준으로 보여준다.
    eventId: 1,
    kv: ev.keyVisual,
    kvPattern: ev.kvPattern,
    density: ev.density,
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
        <div style={{ ...monoLabel, color: UI.faint, marginBottom: 10 }}>MOBILE · 390</div>
        <div
          style={{
            width: 414,
            height: 844,
            borderRadius: 44,
            background: 'oklch(0.22 0.008 250)', // 항상 어둡게 — 실제 기기 베젤
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
        <div style={{ ...monoLabel, color: UI.faint, marginBottom: 10 }}>TABLET · 834</div>
        <div
          style={{
            borderRadius: 28,
            background: 'oklch(0.22 0.008 250)', // 항상 어둡게 — 실제 기기 베젤
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
