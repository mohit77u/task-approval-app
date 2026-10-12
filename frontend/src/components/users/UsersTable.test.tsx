import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { UsersTable } from '@/components/users/UsersTable';
import { User } from '@/types/api';

const base: User = {
  id: 1,
  name: 'Admin',
  email: 'a@x.dev',
  phone: null,
  isDefault: true,
  role: { id: 1, code: 'ADMIN', name: 'Admin' },
} as User;

class RO { observe(): void {} unobserve(): void {} disconnect(): void {} }
globalThis.ResizeObserver = RO;

describe('UsersTable delete tooltip', () => {
  it('explains why a default account cannot be deleted', async () => {
    render(
      <TooltipProvider>
        <UsersTable users={[base]} currentUserId={99} isDeleting={false} onEdit={vi.fn()} onDelete={vi.fn()} />
      </TooltipProvider>,
    );
    expect(screen.getByRole('button', { name: 'Delete Admin' })).toBeDisabled();
    act(() => (document.querySelector('[data-slot="disabled-reason"]') as HTMLElement).focus()); // Focus opens the tooltip the same way hover does, and works in jsdom.
    expect((await screen.findAllByText("Default accounts can't be deleted")).length).toBeGreaterThan(0);
  });
});
