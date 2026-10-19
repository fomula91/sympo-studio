'use client';

import { ConsoleScreen } from '@fe/pages/console';
import { useStudio } from '@fe/app/providers';

export default function ConsolePage() {
  const { s, patch, user, authStatus, importPrompt, importBusy, importMessage, confirmImport, dismissImport } =
    useStudio();
  return (
    <ConsoleScreen
      s={s}
      patch={patch}
      user={user}
      authStatus={authStatus}
      importPrompt={importPrompt}
      importBusy={importBusy}
      importMessage={importMessage}
      confirmImport={confirmImport}
      dismissImport={dismissImport}
    />
  );
}
