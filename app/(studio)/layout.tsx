'use client';

import { StudioFrame } from '@fe/app/providers/studio/StudioFrame';
import { StudioProvider } from "@fe/app/providers/studio/StudioProvider";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudioProvider>
      <StudioFrame>{children}</StudioFrame>
    </StudioProvider>
  );
}
