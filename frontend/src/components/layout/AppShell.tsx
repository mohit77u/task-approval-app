import { ReactNode } from 'react';
import { ServerStatusBanner } from './ServerStatusBanner';
import { SidebarNav } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col">
      <ServerStatusBanner />
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r p-4 md:block">
          <p className="mb-6 px-3 text-lg font-semibold tracking-tight">Task &amp; Approval</p>
          <SidebarNav />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
