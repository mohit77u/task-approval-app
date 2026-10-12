import { Pencil, Trash2 } from 'lucide-react';
import { DisabledReason } from '@/components/common/DisabledReason';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { User } from '@/types/api';

/** Why Delete is unavailable for a row, or undefined when it is allowed. The backend enforces the same rules (and the "has tasks" one). */
function deleteBlockedReason(user: User, currentUserId: number, isDeleting: boolean): string | undefined {
  if (user.isDefault) return "Default accounts can't be deleted";
  if (user.id === currentUserId) return "You can't delete your own account";
  if (isDeleting) return 'Deleting…';
  return undefined;
}

interface UserRowActionsProps {
  user: User;
  currentUserId: number;
  isDeleting: boolean;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  /** Applied to both icon buttons (the mobile card enlarges them for touch). */
  buttonClassName?: string;
}

/** Edit + Delete controls shared by the table row and the mobile card, including the disabled-Delete tooltip. */
export function UserRowActions({ user, currentUserId, isDeleting, onEdit, onDelete, buttonClassName }: UserRowActionsProps): React.JSX.Element {
  const blocked = deleteBlockedReason(user, currentUserId, isDeleting);
  return (
    <>
      <Button variant="ghost" size="icon" className={cn(buttonClassName)} aria-label={`Edit ${user.name}`} onClick={() => onEdit(user)}>
        <Pencil className="h-4 w-4" aria-hidden />
      </Button>
      <DisabledReason reason={blocked}>
        <Button variant="ghost" size="icon" className={cn(buttonClassName)} aria-label={`Delete ${user.name}`} disabled={Boolean(blocked)} onClick={() => onDelete(user)}>
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      </DisabledReason>
    </>
  );
}
