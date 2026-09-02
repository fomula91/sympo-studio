'use client';

import StudioShell from '@/components/StudioShell';
import { StudioProvider } from '@/components/StudioProvider';

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudioProvider>
      <StudioShell>{children}</StudioShell>
    </StudioProvider>
  );
}
