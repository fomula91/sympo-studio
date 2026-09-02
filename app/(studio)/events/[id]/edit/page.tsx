'use client';

import { notFound, useParams } from 'next/navigation';
import { useEffect } from 'react';
import EditorScreen from '@/components/screens/EditorScreen';
import { useStudio } from '@/components/StudioProvider';

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = Number(id);
  const { s, presets, patch, patchEvent } = useStudio();
  const ev = s.events.find((e) => e.id === eventId);

  useEffect(() => {
    if (ev) patch({ editingId: eventId });
  }, [eventId, ev, patch]);

  if (!ev) notFound();

  return <EditorScreen s={s} ev={ev} presets={presets} patch={patch} patchEvent={patchEvent} />;
}
