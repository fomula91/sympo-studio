'use client';

import ReportScreen from '@/components/screens/ReportScreen';
import { useStudio } from '@/components/StudioProvider';

export default function ReportPage() {
  const { ev } = useStudio();
  return <ReportScreen ev={ev} />;
}
