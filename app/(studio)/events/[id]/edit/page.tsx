'use client';

import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import EditorScreen from '@/components/screens/EditorScreen';
import { useStudio } from '@/components/StudioProvider';

export default function EditEventPage() {
  const { id } = useParams<{ id: string }>();
  const { s, ev, patch, patchEvent } = useStudio();

  useEffect(() => {
    patch({ editingId: Number(id) });
  }, [id, patch]);

  return <EditorScreen s={s} ev={ev} patch={patch} patchEvent={patchEvent} />;
}
