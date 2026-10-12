'use client';

import { CheckSquare, LayoutDashboard, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare, adminOnly: false },
  { href: '/users', label: 'Users', icon: Users, adminOnly: true },
] as const;

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }): React.JSX.Element {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 max-md:min-h-10 text-sm font-medium transition-colors',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
