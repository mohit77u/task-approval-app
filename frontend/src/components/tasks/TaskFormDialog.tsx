'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { applyFieldErrors, useApiAction } from '@/hooks/useApiAction';
import { todayAsDateString } from '@/lib/dates';
import { makeTaskSchema, TaskFormValues as FormValues } from '@/lib/taskFormSchema';
import { PRIORITY_LABEL, PRIORITY_ORDER } from '@/lib/constants';
import { useCreateTaskMutation, useUpdateTaskMutation } from '@/services/api/tasksApi';
import { useListUsersQuery } from '@/services/api/usersApi';
import { Task } from '@/types/api';

const FIELDS = ['title', 'description', 'priority', 'dueDate', 'assigneeId'] as const;

function FieldError({ message }: { message?: string }): React.JSX.Element | null {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

function TaskForm({ task, onDone, onPendingChange }: { task?: Task; onDone: () => void; onPendingChange: (pending: boolean) => void }): React.JSX.Element {
  const [createTask] = useCreateTaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const employees = useListUsersQuery({ roleCode: 'EMPLOYEE', limit: 100 });
  const { run, isPending } = useApiAction();

  const form = useForm<FormValues>({
    resolver: zodResolver(makeTaskSchema(task?.dueDate)),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      priority: task?.priority ?? 'MEDIUM',
      dueDate: task?.dueDate ?? '',
      assigneeId: task ? String(task.assignee.id) : '',
    },
  });
  const { errors } = form.formState;

  // Lift the pending flag so the dialog can refuse to close mid-request.
  useEffect(() => {
    onPendingChange(isPending);
    return () => onPendingChange(false);
  }, [isPending, onPendingChange]);

  const onSubmit = async (values: FormValues): Promise<void> => {
    const input = { ...values, assigneeId: Number(values.assigneeId) };
    const result = await run(() => (task ? updateTask({ id: task.id, changes: input }).unwrap() : createTask(input).unwrap()));
    if (result.ok) onDone();
    else applyFieldErrors(result.error, form.setError, FIELDS);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="title" required>
          Title
        </Label>
        <Input id="title" required maxLength={200} aria-invalid={Boolean(errors.title)} {...form.register('title')} />
        <FieldError message={errors.title?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description" required>
          Description
        </Label>
        <Textarea id="description" required rows={4} aria-invalid={Boolean(errors.description)} {...form.register('description')} />
        <FieldError message={errors.description?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="priority" required>
            Priority
          </Label>
          <Controller
            control={form.control}
            name="priority"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="priority" aria-required className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_ORDER.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {PRIORITY_LABEL[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.priority?.message} />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="dueDate" required>
            Due date
          </Label>
          <Input id="dueDate" type="date" required className="w-full" min={task ? undefined : todayAsDateString()} aria-invalid={Boolean(errors.dueDate)} {...form.register('dueDate')} />
          <FieldError message={errors.dueDate?.message} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="assigneeId" required>
          Assignee
        </Label>
        <Controller
          control={form.control}
          name="assigneeId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={employees.isLoading}>
              <SelectTrigger id="assigneeId" aria-required className="w-full">
                <SelectValue placeholder={employees.isLoading ? 'Loading employees…' : 'Select an employee'} />
              </SelectTrigger>
              <SelectContent>
                {(employees.data?.items ?? []).map((employee) => (
                  <SelectItem key={employee.id} value={String(employee.id)}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError message={errors.assigneeId?.message} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          {task ? 'Save changes' : 'Create task'}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to create a new task. */
  task?: Task;
}

export function TaskFormDialog({ open, onOpenChange, task }: TaskFormDialogProps): React.JSX.Element {
  const [pending, setPending] = useState(false);
  // Esc, overlay click and the X all route through here; closing mid-request would hide the outcome of the save.
  const handleOpenChange = (next: boolean): void => {
    if (!next && pending) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{task ? 'Edit task' : 'New task'}</DialogTitle>
          <DialogDescription>{task ? 'Update the details or reassign the task.' : 'Create a task and assign it to an employee.'}</DialogDescription>
        </DialogHeader>
        {/* Rendered only while open, so the form is rebuilt with fresh defaults every time the dialog opens. */}
        <TaskForm task={task} onDone={() => onOpenChange(false)} onPendingChange={setPending} />
      </DialogContent>
    </Dialog>
  );
}
