'use client';

import { Plus } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { Pagination } from '@/components/common/Pagination';
import { TaskFilterBar } from '@/components/tasks/TaskFilterBar';
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog';
import { TasksTable } from '@/components/tasks/TasksTable';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiAction } from '@/hooks/useApiAction';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { useTaskFilters } from '@/hooks/useTaskFilters';
import { cn } from '@/lib/utils';
import { hasActiveFilters, PAGE_SIZE } from '@/lib/taskFilters';
import { useDeleteTaskMutation, useListTasksQuery } from '@/services/api/tasksApi';
import { useListUsersQuery } from '@/services/api/usersApi';
import { Task } from '@/types/api';

function TasksView(): React.JSX.Element {
  const { isAdmin } = useAuth();
  const confirm = useConfirm();
  const { run } = useApiAction();
  const [deleteTask, { isLoading: isDeleting }] = useDeleteTaskMutation();
  const { filters, searchInput, setSearchInput, setFilter, setPage, reset } = useTaskFilters();

  const tasks = useListTasksQuery({ ...filters, limit: PAGE_SIZE });
  const employees = useListUsersQuery({ roleCode: 'EMPLOYEE', limit: 100 }, { skip: !isAdmin });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | undefined>();

  // After deleting the last task on the final page, move back instead of showing an empty page.
  // currentData belongs to the current args only (data may be a stale previous page), and we wait out refetches.
  const totalPages = tasks.isFetching ? undefined : tasks.currentData?.meta.totalPages;
  useEffect(() => {
    if (totalPages !== undefined && filters.page > Math.max(totalPages, 1)) setPage(Math.max(totalPages, 1));
  }, [totalPages, filters.page, setPage]);

  const openCreate = (): void => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (task: Task): void => {
    setEditing(task);
    setFormOpen(true);
  };
  const onDelete = async (task: Task): Promise<void> => {
    const { confirmed } = await confirm({
      title: 'Delete this task?',
      description: `"${task.title}" will disappear from all lists. Its history is kept for audit.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) await run(() => deleteTask(task.id).unwrap());
  };

  const filtersActive = hasActiveFilters(filters);

  return (
    <div>
      <PageHeader
        title="Tasks"
        description={isAdmin ? 'Create, assign and track every task.' : 'Tasks assigned to you.'}
        actions={
          isAdmin && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              New task
            </Button>
          )
        }
      />

      <TaskFilterBar
        filters={filters}
        searchInput={searchInput}
        onSearchChange={setSearchInput}
        onFilterChange={setFilter}
        onReset={reset}
        hasActiveFilters={filtersActive || searchInput.length > 0}
        employees={isAdmin ? employees.data?.items ?? [] : undefined}
      />

      {tasks.isError ? (
        <ErrorState message={tasks.error.message} onRetry={() => void tasks.refetch()} />
      ) : !tasks.data ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading tasks">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : tasks.data.items.length === 0 ? (
        <EmptyState
          title={filtersActive ? 'No tasks match your filters' : isAdmin ? 'No tasks yet' : 'No tasks assigned to you yet'}
          description={filtersActive ? 'Try a different search or clear the filters.' : isAdmin ? 'Create the first task and assign it to an employee.' : 'New assignments will appear here.'}
          action={
            filtersActive ? (
              <Button variant="outline" onClick={reset}>
                Clear filters
              </Button>
            ) : isAdmin ? (
              <Button onClick={openCreate}>New task</Button>
            ) : undefined
          }
        />
      ) : (
        // `data` keeps the previous page while the next one loads, so the table dims instead of flashing empty.
        <div className={cn('transition-opacity', tasks.isFetching && 'opacity-60')}>
          <TasksTable tasks={tasks.data.items} isAdmin={isAdmin} isDeleting={isDeleting} onEdit={openEdit} onDelete={(task) => void onDelete(task)} />
          <Pagination
            page={tasks.data.meta.page}
            totalPages={tasks.data.meta.totalPages}
            total={tasks.data.meta.total}
            onPageChange={setPage}
            disabled={tasks.isFetching}
          />
        </div>
      )}

      {isAdmin && <TaskFormDialog open={formOpen} onOpenChange={setFormOpen} task={editing} />}
    </div>
  );
}

// useSearchParams needs a Suspense boundary for static rendering.
export default function TasksPage(): React.JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <TasksView />
    </Suspense>
  );
}
