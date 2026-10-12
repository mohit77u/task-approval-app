'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { applyFieldErrors, useApiAction } from '@/hooks/useApiAction';
import { PRIORITY_LABEL, PRIORITY_ORDER } from '@/lib/constants';
import { useCreateTaskMutation, useUpdateTaskMutation } from '@/services/api/tasksApi';
import { useListUsersQuery } from '@/services/api/usersApi';
import { Task } from '@/types/api';

const schema = z.object({
  title: z.string().trim().min(1, 'Enter a title').max(200, 'Keep the title under 200 characters'),
  description: z.string().trim().min(1, 'Enter a description').max(5000, 'Keep the description under 5000 characters'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a due date'),
  // Kept as a string because the Select works with strings; converted to a number on submit.
  assigneeId: z.string().min(1, 'Choose an employee'),
});
type FormValues = z.infer<typeof schema>;

const FIELDS = ['title', 'description', 'priority', 'dueDate', 'assigneeId'] as const;

function FieldError({ message }: { message?: string }): React.JSX.Element | null {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

function TaskForm({ task, onDone }: { task?: Task; onDone: () => void }): React.JSX.Element {
  const [createTask] = useCreateTaskMutation();
  const [updateTask] = useUpdateTaskMutation();
  const employees = useListUsersQuery({ roleCode: 'EMPLOYEE', limit: 100 });
  const { run, isPending } = useApiAction();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      priority: task?.priority ?? 'MEDIUM',
      dueDate: task?.dueDate ?? '',
      assigneeId: task ? String(task.assignee.id) : '',
    },
  });
  const { errors } = form.formState;

  const onSubmit = async (values: FormValues): Promise<void> => {
    const input = { ...values, assigneeId: Number(values.assigneeId) };
    const result = await run(() => (task ? updateTask({ id: task.id, changes: input }).unwrap() : createTask(input).unwrap()));
    if (result.ok) onDone();
    else applyFieldErrors(result.error, form.setError, FIELDS);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" maxLength={200} aria-invalid={Boolean(errors.title)} {...form.register('title')} />
        <FieldError message={errors.title?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={4} aria-invalid={Boolean(errors.description)} {...form.register('description')} />
        <FieldError message={errors.description?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <Controller
            control={form.control}
            name="priority"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="priority">
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
        <div className="space-y-2">
          <Label htmlFor="dueDate">Due date</Label>
          <Input id="dueDate" type="date" aria-invalid={Boolean(errors.dueDate)} {...form.register('dueDate')} />
          <FieldError message={errors.dueDate?.message} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="assigneeId">Assignee</Label>
        <Controller
          control={form.control}
          name="assigneeId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={employees.isLoading}>
              <SelectTrigger id="assigneeId">
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit task' : 'New task'}</DialogTitle>
          <DialogDescription>{task ? 'Update the details or reassign the task.' : 'Create a task and assign it to an employee.'}</DialogDescription>
        </DialogHeader>
        {/* Rendered only while open, so the form is rebuilt with fresh defaults every time the dialog opens. */}
        <TaskForm task={task} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
