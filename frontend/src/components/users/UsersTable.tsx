import { Pencil, Trash2 } from 'lucide-react';
import { DisabledReason } from '@/components/common/DisabledReason';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { User } from '@/types/api';

interface UsersTableProps {
  users: User[];
  currentUserId: number;
  isDeleting: boolean;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
}

/** Why Delete is unavailable for a row, or undefined when it is allowed. The backend enforces the same rules (and the "has tasks" one). */
function deleteBlockedReason(user: User, currentUserId: number, isDeleting: boolean): string | undefined {
  if (user.isDefault) return "Default accounts can't be deleted";
  if (user.id === currentUserId) return "You can't delete your own account";
  if (isDeleting) return 'Deleting…';
  return undefined;
}

export function UsersTable({ users, currentUserId, isDeleting, onEdit, onDelete }: UsersTableProps): React.JSX.Element {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const blocked = deleteBlockedReason(user, currentUserId, isDeleting);
            return (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  {user.name}
                  {user.isDefault && <span className="ml-2 text-xs text-muted-foreground">(default)</span>}
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.phone ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant={user.role.code === 'ADMIN' ? 'default' : 'secondary'}>{user.role.name}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" aria-label={`Edit ${user.name}`} onClick={() => onEdit(user)}>
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <DisabledReason reason={blocked}>
                    <Button variant="ghost" size="icon" aria-label={`Delete ${user.name}`} disabled={Boolean(blocked)} onClick={() => onDelete(user)}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </DisabledReason>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
