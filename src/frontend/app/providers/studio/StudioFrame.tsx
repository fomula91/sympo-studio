'use client';
import { useStudio } from './StudioProvider';
import { StudioShell } from '@fe/widgets/studio-shell';
import { DevicePreview } from '@fe/widgets/participant-site';

import { AccountMenu } from '@fe/features/account-menu';
export function StudioFrame({ children }: { children: React.ReactNode }) {
  const studio = useStudio();
  return (
    <StudioShell
      {...studio}
      accountMenu={<AccountMenu {...studio} />}
      preview={<DevicePreview ev={studio.ev} presets={studio.presets} />}
    >
      {children}
    </StudioShell>
  );
}
