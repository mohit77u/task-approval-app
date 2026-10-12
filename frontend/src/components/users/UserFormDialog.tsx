'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { applyFieldErrors, useApiAction } from '@/hooks/useApiAction';
import { useCreateUserMutation, useListRolesQuery, useUpdateUserMutation } from '@/services/api/usersApi';
import { User } from '@/types/api';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d)/;

// Mirrors the backend rules (8–72 chars, a letter and a digit) so most mistakes are caught before the request.
function makeSchema(isEdit: boolean) {
  return z.object({
    name: z.string().trim().min(1, 'Enter a name').max(120, 'Keep the name under 120 characters'),
    email: z.string().trim().min(1, 'Enter an email').email('Enter a valid email'),
    phone: z.string().trim().regex(/^(\+?[0-9 ()-]{7,20})?$/, 'Use 7–20 digits, spaces, +, - or ( )'),
    password: z
      .string()
      .refine((value) => (isEdit && value === '') || value.length >= 8, 'Use at least 8 characters')
      .refine((value) => value.length <= 72, 'Use at most 72 characters')
      .refine((value) => (isEdit && value === '') || PASSWORD_RULE.test(value), 'Include at least one letter and one number'),
    roleId: isEdit ? z.string() : z.string().min(1, 'Choose a role'),
  });
}
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

function FieldError({ message }: { message?: string }): React.JSX.Element | null {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

function UserForm({ user, onDone, onPendingChange }: { user?: User; onDone: () => void; onPendingChange: (pending: boolean) => void }): React.JSX.Element {
  const isEdit = Boolean(user);
  const roles = useListRolesQuery();
  const [createUser] = useCreateUserMutation();
  const [updateUser] = useUpdateUserMutation();
  const { run, isPending } = useApiAction();

  const form = useForm<FormValues>({
    resolver: zodResolver(makeSchema(isEdit)),
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      password: '',
      roleId: user ? String(user.role.id) : '',
    },
  });
  const { errors } = form.formState;

  // Lift the pending flag so the dialog can refuse to close mid-request.
  useEffect(() => {
    onPendingChange(isPending);
    return () => onPendingChange(false);
  }, [isPending, onPendingChange]);

  const onSubmit = async (values: FormValues): Promise<void> => {
    const result = await run(() =>
      user
        ? updateUser({
            id: user.id,
            name: values.name,
            email: values.email,
            phone: values.phone === '' ? null : values.phone,
            ...(values.password ? { password: values.password } : {}),
          }).unwrap()
        : createUser({ ...values, phone: values.phone || undefined, roleId: Number(values.roleId) }).unwrap(),
    );
    if (result.ok) {
      onDone();
      return;
    }
    const matched = applyFieldErrors(result.error, form.setError, ['name', 'email', 'phone', 'password', 'roleId']);
    // A duplicate email arrives as a plain CONFLICT without a field name, but we know where it belongs.
    if (!matched && result.error.code === 'CONFLICT') form.setError('email', { type: 'server', message: result.error.message });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="user-name">Name</Label>
        <Input id="user-name" aria-invalid={Boolean(errors.name)} {...form.register('name')} />
        <FieldError message={errors.name?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="user-email">Email</Label>
        <Input id="user-email" type="email" autoComplete="off" aria-invalid={Boolean(errors.email)} {...form.register('email')} />
        <FieldError message={errors.email?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="user-phone">Phone (optional)</Label>
        <Input id="user-phone" type="tel" autoComplete="off" aria-invalid={Boolean(errors.phone)} {...form.register('phone')} />
        <FieldError message={errors.phone?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="user-password">{isEdit ? 'New password (leave blank to keep the current one)' : 'Temporary password'}</Label>
        <Input id="user-password" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} {...form.register('password')} />
        <FieldError message={errors.password?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="user-role">Role</Label>
        <Controller
          control={form.control}
          name="roleId"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={isEdit || roles.isLoading}>
              <SelectTrigger id="user-role">
                <SelectValue placeholder={roles.isLoading ? 'Loading roles…' : 'Select a role'} />
              </SelectTrigger>
              <SelectContent>
                {(roles.data ?? []).map((role) => (
                  <SelectItem key={role.id} value={String(role.id)}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError message={errors.roleId?.message} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          {isEdit ? 'Save changes' : 'Create user'}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present for edit mode, absent for create mode. */
  user?: User;
}

export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps): React.JSX.Element {
  const [pending, setPending] = useState(false);
  // Esc, overlay click and the X all route through here; closing mid-request would hide the outcome of the save.
  const handleOpenChange = (next: boolean): void => {
    if (!next && pending) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{user ? 'Edit user' : 'New user'}</DialogTitle>
          <DialogDescription>
            {user ? 'The role cannot be changed after the account is created.' : 'They can sign in right away with this email and password.'}
          </DialogDescription>
        </DialogHeader>
        {/* Keyed so each user (or a fresh create) starts from clean form state. */}
        <UserForm key={user?.id ?? 'new'} user={user} onDone={() => onOpenChange(false)} onPendingChange={setPending} />
      </DialogContent>
    </Dialog>
  );
}
