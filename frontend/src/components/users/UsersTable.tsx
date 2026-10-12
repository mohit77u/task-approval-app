import { Badge } from '@/components/ui/badge';
import { UserRowActions } from '@/components/users/UserRowActions';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { User } from '@/types/api';

interface UsersTableProps {
  users: User[];
  currentUserId: number;
  isDeleting: boolean;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
}

function UsersTableView({ users, currentUserId, isDeleting, onEdit, onDelete }: UsersTableProps): React.JSX.Element {
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
                  <UserRowActions user={user} currentUserId={currentUserId} isDeleting={isDeleting} onEdit={onEdit} onDelete={onDelete} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** Stacked cards for narrow screens, where five columns (long emails especially) would scroll sideways. */
function UsersCardList({ users, currentUserId, isDeleting, onEdit, onDelete }: UsersTableProps): React.JSX.Element {
  return (
    <ul className="flex flex-col gap-3">
      {users.map((user) => (
        <li key={user.id} className="rounded-md border bg-card p-3 text-card-foreground">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 py-1">
              <p className="break-words font-medium">
                {user.name}
                {user.isDefault && <span className="ml-2 text-xs font-normal text-muted-foreground">(default)</span>}
              </p>
              <p className="break-all text-sm text-muted-foreground">{user.email}</p>
            </div>
            <div className="-mr-1 flex shrink-0">
              <UserRowActions user={user} currentUserId={currentUserId} isDeleting={isDeleting} onEdit={onEdit} onDelete={onDelete} buttonClassName="size-10" />
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <Badge variant={user.role.code === 'ADMIN' ? 'default' : 'secondary'}>{user.role.name}</Badge>
            <span className="text-muted-foreground">{user.phone ?? '—'}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Table from the `lg` breakpoint up, cards below it. Only one layout is mounted so buttons are never duplicated in the DOM. */
export function UsersTable(props: UsersTableProps): React.JSX.Element {
  const isDesktop = useIsDesktop();
  return isDesktop ? <UsersTableView {...props} /> : <UsersCardList {...props} />;
}
