'use client';

import ConsoleScreen from '@/components/screens/ConsoleScreen';
import { useStudio } from '@/components/StudioProvider';

export default function ConsolePage() {
  const { s, patch } = useStudio();
  return <ConsoleScreen s={s} patch={patch} />;
}
