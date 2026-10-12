import { ReactNode } from 'react';
import { AuthGate } from '@/components/auth/AuthGate';
import { AppShell } from '@/components/layout/AppShell';

export default function AppLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
