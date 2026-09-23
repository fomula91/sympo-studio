'use client';

import { notFound, useParams } from 'next/navigation';
import EditorScreen from '@/components/screens/EditorScreen';
import { useStudio } from '@/components/StudioProvider';
import { UI } from '@/lib/ui';

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const { s, ev, presets, patch, patchEvent, isServerEvent, loadStatus, user, createPreset } = useStudio();

  if (loadStatus === 'notfound') notFound();
  // FE-30 — 목업 시드(0~14) 밖의 실제 D1 전용 id는 조회 결과가 오기 전까지
  // ev가 아직 엉뚱한 자리표시자다. 이 상태에서 바로 아래 404 검사를 하면
  // 실제로 존재하는 이벤트인데도 결과가 오기 전에 잘못 404가 난다.
  if (loadStatus === 'loading') {
    return <div style={{ padding: 40, color: UI.muted, fontSize: 14 }}>불러오는 중…</div>;
  }
  // 404가 아닌 조회 실패(타임아웃·500 등) — 이전에는 이 경우가 계속 'loading'으로
  // 남아 무한 스피너가 됐다. 사유를 화면에 드러내고, 재시도는 콘솔에서 다시 여는
  // 것으로 유도한다(별도 재시도 버튼은 이번 범위 밖).
  if (loadStatus === 'error') {
    return (
      <div style={{ padding: 40, color: UI.muted, fontSize: 14 }}>
        이벤트를 불러오지 못했습니다. 콘솔에서 다시 열어보세요.
      </div>
    );
  }
  if (ev.id !== Number(id)) notFound();

  return (
    <EditorScreen
      s={s}
      ev={ev}
      presets={presets}
      patch={patch}
      patchEvent={patchEvent}
      isServerEvent={isServerEvent}
      user={user}
      createPreset={createPreset}
    />
  );
}
