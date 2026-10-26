'use client';

import { ReportScreen } from '@fe/pages/report';
import { useStudio } from '@fe/app/providers';

export default function ReportPage() {
  const { ev } = useStudio();
  return <ReportScreen ev={ev} />;
}
