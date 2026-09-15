'use client';

import { notFound, useParams } from 'next/navigation';
import EditorScreen from '@/components/screens/EditorScreen';
import { useStudio } from '@/components/StudioProvider';
import { UI } from '@/lib/ui';

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const { s, ev, presets, patch, patchEvent, loadStatus } = useStudio();

  if (loadStatus === 'notfound') notFound();
  // FE-30 — 목업 시드(0~14) 밖의 실제 D1 전용 id는 조회 결과가 오기 전까지
  // ev가 아직 엉뚱한 자리표시자다. 이 상태에서 바로 아래 404 검사를 하면
  // 실제로 존재하는 이벤트인데도 결과가 오기 전에 잘못 404가 난다.
  if (loadStatus === 'loading') {
    return <div style={{ padding: 40, color: UI.muted, fontSize: 14 }}>불러오는 중…</div>;
  }
  if (ev.id !== Number(id)) notFound();

  return <EditorScreen s={s} ev={ev} presets={presets} patch={patch} patchEvent={patchEvent} />;
}
