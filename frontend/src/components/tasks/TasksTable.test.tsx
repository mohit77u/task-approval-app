import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TasksTable } from '@/components/tasks/TasksTable';
import { UsersTable } from '@/components/users/UsersTable';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Task, User } from '@/types/api';

class RO { observe(): void {} unobserve(): void {} disconnect(): void {} }
globalThis.ResizeObserver = RO;

/** jsdom has no matchMedia; this stub answers every min-width query with the given result. */
function stubViewport(isDesktop: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: isDesktop, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}

afterEach(() => vi.unstubAllGlobals());

const task = {
  id: 7,
  title: 'Ship the thing',
  priority: 'HIGH',
  status: 'COMPLETED',
  dueDate: '2030-01-01T00:00:00.000Z',
  assignee: { id: 2, name: 'Priya' },
} as unknown as Task;

const user = { id: 1, name: 'Admin', email: 'a@x.dev', phone: null, isDefault: true, role: { id: 1, code: 'ADMIN', name: 'Admin' } } as User;

describe.each([
  ['desktop', true, 'table'],
  ['mobile', false, 'list'],
] as const)('task list on %s', (_label, isDesktop, container) => {
  it('renders one layout with the title link and assignee', () => {
    stubViewport(isDesktop);
    render(
      <TooltipProvider>
        <TasksTable tasks={[task]} isAdmin onEdit={vi.fn()} onDelete={vi.fn()} />
      </TooltipProvider>,
    );
    expect(screen.getAllByRole(container)).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Ship the thing' })).toHaveAttribute('href', '/tasks/7');
    expect(screen.getByText('Priya')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Ship the thing' })).toBeInTheDocument();
  });
});

describe.each([
  ['desktop', true, 'table'],
  ['mobile', false, 'list'],
] as const)('users list on %s', (_label, isDesktop, container) => {
  it('renders one layout with email and a disabled Delete for default accounts', () => {
    stubViewport(isDesktop);
    render(
      <TooltipProvider>
        <UsersTable users={[user]} currentUserId={99} isDeleting={false} onEdit={vi.fn()} onDelete={vi.fn()} />
      </TooltipProvider>,
    );
    const root = screen.getByRole(container);
    expect(within(root).getByText('a@x.dev')).toBeInTheDocument();
    expect(within(root).getByRole('button', { name: 'Delete Admin' })).toBeDisabled();
  });
});
