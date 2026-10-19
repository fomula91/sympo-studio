'use client';

import { useState } from 'react';
import { Card } from '@fe/shared/ui/Card';
import { SectionTitle } from '@fe/shared/ui/SectionTitle';
import { generateCertificate } from '@/lib/certificate';
import { ENGAGE_DEFS } from '@/components/screens/editor/config';
import type { EventItem, PatchEventFn } from '@fe/entities/event/model/types';
import type { PatchFn } from '@fe/app/providers/studio/types';
import { ghostBtn, UI } from '@fe/shared/config/ui';
import { savingMessage } from './saving-message';

export default function EngageSection({
  ev,
  patch,
  patchEvent,
  isServerEvent,
}: {
  ev: EventItem;
  patch: PatchFn;
  patchEvent: PatchEventFn;
  isServerEvent: boolean;
}) {
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
      <SectionTitle title="참여" description="Q&A와 설문을 외부 링크·QR 이미지 대신 페이지 안에서 완결시킵니다." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ENGAGE_DEFS.map((t) => {
          const on = ev.engage[t.k];
          return (
            <button
              key={t.k}
              className="hv-border80"
              onClick={() => {
                patchEvent((curEv) => ({ engage: { ...curEv.engage, [t.k]: !curEv.engage[t.k] } }));
                patch({ saved: savingMessage(isServerEvent) });
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
                <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: '-0.015em', color: UI.ink }}>
                  {t.label}
                </div>
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
        <Card padding={16} radius={12} style={{ marginTop: 20 }}>
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
            <div role="alert" style={{ fontSize: 12, color: UI.toneDangerFg, marginTop: 8 }}>
              {certError}
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
