'use client';

import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { DisabledReason } from '@/components/common/DisabledReason';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { CommentsPanel } from '@/components/tasks/CommentsPanel';
import { HistoryTimeline } from '@/components/tasks/HistoryTimeline';
import { TaskDetails } from '@/components/tasks/TaskDetails';
import { TaskFormDialog } from '@/components/tasks/TaskFormDialog';
import { TaskStatusControl } from '@/components/tasks/TaskStatusControl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApiAction } from '@/hooks/useApiAction';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { isApiError } from '@/lib/normalizeError';
import { useDeleteTaskMutation, useGetTaskQuery } from '@/services/api/tasksApi';

export default function TaskDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const confirm = useConfirm();
  const { run, isPending } = useApiAction();
  const [deleteTask] = useDeleteTaskMutation();
  const [editOpen, setEditOpen] = useState(false);

  const taskId = Number(params.id);
  const validId = Number.isInteger(taskId) && taskId > 0;
  const task = useGetTaskQuery(taskId, { skip: !validId });

  const back = (
    <Link href="/tasks" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back to tasks
    </Link>
  );

  // RTK Query types `error` as ApiError | SerializedError, so narrow before reading `code`.
  if (!validId || (task.error && isApiError(task.error) && task.error.code === 'NOT_FOUND')) {
    return (
      <div>
        {back}
        <ErrorState title="Task not found" message="It may have been deleted, or it is not assigned to you." />
      </div>
    );
  }
  if (task.isError) {
    return (
      <div>
        {back}
        <ErrorState message={task.error.message} onRetry={() => void task.refetch()} />
      </div>
    );
  }
  if (!task.data) {
    return (
      <div>
        {back}
        <Skeleton className="mb-4 h-10 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const data = task.data;

  const onDelete = async (): Promise<void> => {
    const { confirmed } = await confirm({
      title: 'Delete this task?',
      description: `"${data.title}" will disappear from all lists. Its history is kept for audit.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    const result = await run(() => deleteTask(data.id).unwrap());
    if (result.ok) router.replace('/tasks');
  };

  return (
    <div>
      {back}
      <PageHeader
        title={data.title}
        actions={
          <>
            <StatusBadge status={data.status} />
            {isAdmin && (
              <>
                <DisabledReason reason={data.status === 'COMPLETED' ? "Completed tasks can't be edited" : isPending ? 'Please wait…' : undefined}>
                  <Button variant="outline" size="sm" disabled={data.status === 'COMPLETED' || isPending} onClick={() => setEditOpen(true)}>
                    <Pencil className="mr-1 h-4 w-4" aria-hidden />
                    Edit
                  </Button>
                </DisabledReason>
                <DisabledReason reason={isPending ? 'Please wait…' : undefined}>
                  <Button variant="outline" size="sm" className="text-destructive" disabled={isPending} onClick={() => void onDelete()}>
                    <Trash2 className="mr-1 h-4 w-4" aria-hidden />
                    Delete
                  </Button>
                </DisabledReason>
              </>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="space-y-6 p-6">
          <TaskDetails task={data} />
          <TaskStatusControl task={data} isFetching={task.isFetching} />
        </CardContent>
      </Card>

      <Tabs defaultValue="comments" className="mt-6">
        <TabsList>
          <TabsTrigger value="comments">Comments</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="comments" className="pt-4">
          <CommentsPanel taskId={data.id} />
        </TabsContent>
        <TabsContent value="history" className="pt-4">
          <HistoryTimeline taskId={data.id} />
        </TabsContent>
      </Tabs>

      {isAdmin && <TaskFormDialog open={editOpen} onOpenChange={setEditOpen} task={data} />}
    </div>
  );
}
