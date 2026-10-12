'use client';

import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { Pagination } from '@/components/common/Pagination';
import { UserFormDialog } from '@/components/users/UserFormDialog';
import { UsersTable } from '@/components/users/UsersTable';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiAction } from '@/hooks/useApiAction';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { useDeleteUserMutation, useListUsersQuery } from '@/services/api/usersApi';
import { User } from '@/types/api';


// Separate from the task list's PAGE_SIZE (lib/taskFilters): the two pages may be tuned independently.
const USERS_PAGE_SIZE = 10;

export default function UsersPage(): React.JSX.Element {
  const { user: me, isAdmin } = useAuth();
  const confirm = useConfirm();
  const { run } = useApiAction();
  const [deleteUser, { isLoading: isDeleting }] = useDeleteUserMutation();
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | undefined>();
  // Skipped for non-admins: the backend would answer 403 anyway, and there is no reason to provoke an error toast.
  const users = useListUsersQuery({ page, limit: USERS_PAGE_SIZE }, { skip: !isAdmin });

  if (!isAdmin || !me) {
    return <ErrorState title="Admins only" message="You do not have access to this page." />;
  }

  const openCreate = (): void => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (user: User): void => {
    setEditing(user);
    setFormOpen(true);
  };
  const onDelete = async (user: User): Promise<void> => {
    const { confirmed } = await confirm({
      title: `Delete ${user.name}?`,
      description: 'They will no longer be able to sign in. This only works for users who have no tasks assigned.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    const result = await run(() => deleteUser(user.id).unwrap());
    // Removing the only row on a later page would leave an empty page, so step back (done here, not in an effect, to avoid a render loop).
    if (result.ok && page > 1 && users.data?.items.length === 1) setPage(page - 1);
  };

  return (
    <div>
      <PageHeader
        title="Users"
        description="Create, edit and remove accounts."
        actions={
          <Button onClick={openCreate}>
            <UserPlus className="mr-2 h-4 w-4" aria-hidden />
            New user
          </Button>
        }
      />

      {users.isError ? (
        <ErrorState message={users.error.message} onRetry={() => void users.refetch()} />
      ) : !users.data ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <UsersTable users={users.data.items} currentUserId={me.id} isDeleting={isDeleting} onEdit={openEdit} onDelete={(user) => void onDelete(user)} />
          <Pagination
            page={users.data.meta.page}
            totalPages={users.data.meta.totalPages}
            total={users.data.meta.total}
            onPageChange={setPage}
            disabled={users.isFetching}
            noun="user"
          />
        </>
      )}

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} />
    </div>
  );
}
