'use client';

import { notFound, useParams } from 'next/navigation';
import EditorScreen from '@/components/screens/EditorScreen';
import { useStudio } from '@/components/StudioProvider';

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const { s, ev, presets, patch, patchEvent } = useStudio();

  if (ev.id !== Number(id)) notFound();

  return <EditorScreen s={s} ev={ev} presets={presets} patch={patch} patchEvent={patchEvent} />;
}
