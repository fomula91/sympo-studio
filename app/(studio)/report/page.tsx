'use client';

import { ReportScreen } from '@fe/pages/report';
import { useStudio } from "@fe/app/providers/studio/StudioProvider";

export default function ReportPage() {
  const { ev } = useStudio();
  return <ReportScreen ev={ev} />;
}
